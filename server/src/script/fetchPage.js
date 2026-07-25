/**
 * AI usage note (Task requirement):
 *
 * I used Claude to speed up writing this fetch/parse pipeline and to
 * pressure-test my error handling — I went in already knowing the shape
 * I wanted (validate → fetch → classify failures → parse), but used AI
 * to catch mistakes and surface things I hadn't considered.
 *
 * Concretely, it helped me:
 * - Fix real bugs I introduced myself (a `typeof x !== string` typo missing
 *   quotes, and axios throwing on non-2xx by default, which would have
 *   silently broken returning a report for pages like 404s).
 * - Learn a security angle I hadn't thought of: my server fetches a
 *   user-supplied URL, so it's a textbook SSRF surface — a request could
 *   be pointed at localhost, an internal service, or the cloud metadata
 *   endpoint (169.254.169.254). I added the DNS-resolve-then-check-the-IP
 *   guard after that and learned what SSRF is and why it is necessary.
 * - Push back on my own first fix, after discussing it with Claude: 
 *   I initially thought of keeping maxRedirects to 0 to close the SSRF 
 *   gap on redirects, but that breaks completely normal things like 
 *   http->https upgrades. I ended up implementing manual hop-by-hop 
 *   redirect following instead, re-running the SSRF check on every hop 
 *   rather than just the original hostname — that was a deliberate 
 *   trade-off I chose after seeing why the blunt fix was wrong.
 *
 * Decisions that are mine, not AI's: treating `alt=""` as an intentional
 * "decorative image" marker rather than a missing-alt violation, stripping
 * script/style tags before counting words so the word count reflects
 * actual content, and choosing to report the final resolved URL rather
 * than the originally requested one, since that's the page actually audited.
 */

import * as cheerio from "cheerio";
import { ApiError } from "../utils/ApiError";
import { lookup } from "dns/promises";
import axios from "axios";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECT_HOPS = 5;

// Blocks the classic SSRF targets: loopback, link-local (incl. cloud
// metadata endpoint 169.254.169.254), and RFC1918 private ranges.
function isPrivateIp(ip) {
  if (ip === "127.0.0.1" || ip === "::1") return true;
  if (ip.startsWith("169.254.")) return true; // link-local / metadata
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true; // 172.16.0.0/12
  return false;
}

function validateUrl(rawUrl) {
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    throw new ApiError(400, "The url must be a non-empty string");
  }

  let parsed;

  try {
    parsed = new URL(rawUrl.trim());
  } catch (error) {
    throw new ApiError(400, `"${rawUrl}" is not a valid URL`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ApiError(400, `Only http:// and https:// URLs are supported`);
  }

  return parsed;
}

async function assertNotPrivate(hostname) {
  let records;

  try {
    records = await lookup(hostname, { all: true });
  } catch (error) {
    throw new ApiError(400, `Could not resolve host "${hostname}"`);
  }

  if (records.some((r) => isPrivateIp(r.address))) {
    throw new ApiError(400, "Requests to private or internal addresses are not allowed");
  }
}

// Pure parsing step — no network involved, so it's independently unit-testable.
function parseReport(html) {
  const $ = cheerio.load(html);

  // Strip script/style so word count doesn't include JS/CSS as if it were content.
  const $body = $("body").length ? $("body").clone() : $.root().clone();
  $body.find("script, style, noscript, template").remove();

  const wordCount = $body
    .text()
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  const title = $("head > title").first().text().trim() || null;

  const metaDescription =
    $('meta[name="description" i]').attr("content")?.trim() ||
    $('meta[property="og:description"]').attr("content")?.trim() ||
    null;

  const h1Count = $("h1").length;

  let imagesTotal = 0;
  let imagesMissingAlt = 0;
  $("img").each((_, el) => {
    imagesTotal += 1;
    // alt="" is a deliberate "decorative image" signal — only a fully
    // missing alt attribute counts as an accessibility gap.
    if ($(el).attr("alt") === undefined) {
      imagesMissingAlt += 1;
    }
  });

  return {
    title,
    metaDescription,
    h1Count,
    imagesTotal,
    imagesMissingAlt,
    wordCount,
  };
}

// Follows redirects one hop at a time, re-validating that each new
// hostname isn't a private/internal address before following it —
// otherwise a malicious 301 could bypass the SSRF check entirely.
// Returns both the final response and the final resolved URL, since
// the report should reflect what was actually audited.
async function safeGet(startUrl, controller) {
  let currentUrl = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    await assertNotPrivate(currentUrl.hostname);

    const response = await axios.get(currentUrl.toString(), {
      signal: controller.signal,
      maxRedirects: 0,
      validateStatus: () => true,
      responseType: "text",
      headers: { "User-Agent": "PagePulse/1.0 site auditor" },
    });

    const isRedirect = response.status >= 300 && response.status < 400;
    if (!isRedirect || !response.headers.location) {
      return { response, finalUrl: currentUrl };
    }

    currentUrl = new URL(response.headers.location, currentUrl);
  }

  throw new ApiError(502, "Too many redirects");
}

async function fetchPage(url) {
  const parsedUrl = validateUrl(url);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const startedAt = performance.now();

  let response, finalUrl;
  try {
    ({ response, finalUrl } = await safeGet(parsedUrl, controller));
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ApiError(504, `This page did not respond within ${FETCH_TIMEOUT_MS / 1000}s`);
    }
    throw new ApiError(502, `Could not reach that URL: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }

  const responseTimeMs = Math.round(performance.now() - startedAt);
  const contentType = response.headers["content-type"] || "";

  if (!contentType.toLowerCase().startsWith("text/html")) {
    throw new ApiError(415, `That URL returned "${contentType || "an unknown content type"}", not HTML`);
  }

  const parsed = parseReport(response.data);

  return {
    url: finalUrl.toString(),
    httpStatus: response.status,
    responseTimeMs,
    ...parsed,
  };
}

export { parseReport, fetchPage };