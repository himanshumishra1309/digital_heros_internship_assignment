/*
Claude help: 

Initailly I used `rate-limiter-flexible`, but after discussing this with Claude, I realised that there is a
boundary-burst condition, so i rather planned to implement token bucket system so that the requests refils
after a certain amount of time

*/

import { ApiError } from "../utils/ApiError.js";

// Token bucket: each IP gets a bucket that holds up to CAPACITY tokens.
// Tokens refill continuously over time (not all-at-once like a fixed
// window), and every request consumes one token, there's no single moment where
// a full refill becomes available all at once.
const CAPACITY = 10; // max tokens a bucket can hold (max burst size)
const REFILL_RATE = 10 / 60; // tokens added per second (10 per 60s ≈ one every 6s)

const buckets = new Map(); // ip -> { tokens, lastRefill }

function refill(bucket, now) {
  const elapsedSeconds = (now - bucket.lastRefill) / 1000;
  const tokensToAdd = elapsedSeconds * REFILL_RATE;

  bucket.tokens = Math.min(CAPACITY, bucket.tokens + tokensToAdd);
  bucket.lastRefill = now;
}

const rateLimiterMiddleware = (req, res, next) => {
  const ip = req.ip;
  const now = Date.now();

  let bucket = buckets.get(ip);
  if (!bucket) {
    bucket = { tokens: CAPACITY, lastRefill: now }; // start full — first burst is always allowed
    buckets.set(ip, bucket);
  }

  refill(bucket, now);

  if (bucket.tokens < 1) {
    const secondsUntilNextToken = (1 - bucket.tokens) / REFILL_RATE;
    res.set("Retry-After", String(Math.ceil(secondsUntilNextToken)));
    return next(
      new ApiError(
        429,
        `Too many requests. Try again in ${Math.ceil(secondsUntilNextToken)}s.`,
      ),
    );
  }

  bucket.tokens -= 1;
  next();
};

export { rateLimiterMiddleware };
