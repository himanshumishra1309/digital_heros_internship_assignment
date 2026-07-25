/*

The caching layer is a good example of where I had a clear idea but needed help of Claude for turning it into 
something that actually worked. I knew from the start that I wanted both a time limit and some notion of popularity 
to matter, not just "delete whatever's oldest," but "keep the URLs people are actually checking."

From there I made the actual calls: TTL is the hard ceiling no matter how popular a URL is, because a 9-minute-old 
cached report claiming to be "current" defeats the point of an audit tool, but when the cache fills up before that 
TTL naturally clears things out, the entry with the fewest hits gets evicted first, not the least-recently-touched one. 
I also decided that refreshing an existing entry shouldn't reset its hit count, a URL that's been popular stays 
popular even if I overwrite its data.

There is a limitation I know about and chose not to fix here: hit counts never decay, so a URL that 
was hot a while ago can still outrank one that just started getting traffic, if eviction happens to land in between. 
A more complete version would age those counts down over time. I left it as-is because the TTL already caps how long 
that staleness can matter, and I'd rather ship something I fully understand than something more "correct" that I 
can't explain.

*/

const MAX_ENTRIES = 500;
const TTL_MS = 1000 * 60 * 10; // 10 minutes — hard cap regardless of popularity

class UrlCache {
  constructor() {
    this.store = new Map(); // key -> { data, expiresAt, hits, lastAccessed }
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key); // expired — TTL always wins, popularity doesn't save it
      return undefined;
    }

    entry.hits += 1;
    entry.lastAccessed = Date.now();
    return entry.data;
  }

  set(key, data) {
    if (this.store.has(key)) {
      // refreshing an existing entry — keep its hit count, don't reset popularity
      const existing = this.store.get(key);
      existing.data = data;
      existing.expiresAt = Date.now() + TTL_MS;
      return;
    }

    if (this.store.size >= MAX_ENTRIES) {
      this._evictLeastPopular();
    }

    this.store.set(key, {
      data,
      expiresAt: Date.now() + TTL_MS,
      hits: 1,
      lastAccessed: Date.now(),
    });
  }

  _evictLeastPopular() {
    let victimKey = null;
    let victimEntry = null;

    for (const [key, entry] of this.store) {
      // an already-expired entry is always the best candidate to remove first
      if (Date.now() > entry.expiresAt) {
        this.store.delete(key);
        return;
      }

      if (
        victimEntry === null ||
        entry.hits < victimEntry.hits ||
        (entry.hits === victimEntry.hits && entry.lastAccessed < victimEntry.lastAccessed)
      ) {
        victimKey = key;
        victimEntry = entry;
      }
    }

    if (victimKey !== null) {
      this.store.delete(victimKey);
    }
  }
}

const cache = new UrlCache();

function normalizeUrl(rawUrl) {
  try {
    const u = new URL(rawUrl.trim());
    u.hash = "";
    let path = u.pathname.endsWith("/") && u.pathname !== "/"
      ? u.pathname.slice(0, -1)
      : u.pathname;
    return `${u.protocol}//${u.hostname.toLowerCase()}${path}${u.search}`;
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

export { cache, normalizeUrl };