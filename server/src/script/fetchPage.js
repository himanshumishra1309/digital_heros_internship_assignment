import * as cheerio from "cheerio";
import { ApiError } from "../utils/ApiError";
import {lookup} from "dns/promises";
import axios from "axios";

const FETCH_TIMEOUT_MS = 10_000;

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

function validateUrl(rawUrl){
  if( typeof rawUrl !== "string" || rawUrl.trim().length === 0 ){
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

async function assertNotPrivate(hostname){
  let records;

  try {
    records = await lookup(hostname, {all: true});
  } catch (error) {
    throw new ApiError(400, `Could not resolve host "${hostname}"`);
  }

  if(records.some((r)=>isPrivateIp(r.address))){
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

async function safeGet(url, controller) {
  let currentUrl = new URL(url);
  const maxHops = 5;

  for (let hop = 0; hop <= maxHops; hop++) {
    await assertNotPrivate(currentUrl.hostname); // re-check every hop, not just the first

    const response = await axios.get(currentUrl.toString(), {
      signal: controller.signal,
      maxRedirects: 0,
      validateStatus: () => true,
      responseType: "text",
      headers: { "User-Agent": "PagePulse/1.0 site auditor" },
    });

    const isRedirect = response.status >= 300 && response.status < 400;
    if (!isRedirect || !response.headers.location) {
      return response; // final response — either a real page or a non-redirect error status
    }

    currentUrl = new URL(response.headers.location, currentUrl); // resolves relative redirects too
  }

  throw new ApiError(502, "Too many redirects");
}

async function fetchPage(url) {
  const parsedUrl = validateUrl(url);
  await assertNotPrivate(parsedUrl.hostname);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const startedAt = performance.now();

  let response;
  try {
    response = await safeGet(parsedUrl.toString(), controller);
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
    url: parsedUrl.toString(),
    httpStatus: response.status,
    responseTimeMs,
    ...parsed,
  };
}