/*

For the tests, I focused on `parseReport` specifically, since that's the pure logic with no network involved, 
the part that's actually practical to unit test without mocking a fetch. I used Claude to help me structure 
the test cases, but the cases themselves come directly from decisions I'd already made and could explain: 
why `alt=""` shouldn't count as a missing-alt violation, why the word count needs to exclude script and 
style contents, and why a page with no metadata should return `null` instead of throwing or silently returning 
empty strings. I didn't just ask for "some tests", I made sure each one maps to something I could defend if 
asked why it's there.

The suite covers one happy-path block, two failure-case blocks (a page with no metadata at all, and 
malformed/empty HTML), and one extra block testing the og:description fallback, which isn't a failure case but 
is a real branch in the code that a pure happy-path test wouldn't touch. I ran the suite myself and corrected 
the word-count numbers where my own manual counting was off, rather than assuming the numbers were right.

What I didn't do: I haven't written tests for `fetchPage` itself or for the SSRF/redirect logic, since those 
need actual network mocking to test properly, and I judged that out of scope for the time I had, the task 
specifically asked for tests on the parsing logic, and I kept my effort there rather than spreading it thin.


*/

import { parseReport } from "../src/script/fetchPage";

describe("parseReport — happy path", () => {
  const html = `
    <html>
      <head>
        <title>  Himanshu's Portfolio  </title>
        <meta name="Description" content="A showcase of backend projects." />
      </head>
      <body>
        <h1>Welcome</h1>
        <h1>Projects</h1>
        <img src="avatar.png" alt="profile photo" />
        <img src="banner.png" alt="" />
        <img src="icon.png" />
        <p>This is a short paragraph with exactly seven words.</p>
        <script>console.log("this should never be counted as content");</script>
        <style>.hero { color: red; font-size: huge; }</style>
      </body>
    </html>
  `;

  const result = parseReport(html);

  test("trims the title and ignores surrounding whitespace", () => {
    expect(result.title).toBe("Himanshu's Portfolio");
  });

  test("reads meta description case-insensitively (name='Description')", () => {
    expect(result.metaDescription).toBe("A showcase of backend projects.");
  });

  test("counts every h1, not just the first", () => {
    expect(result.h1Count).toBe(2);
  });

  test("treats alt='' as an intentional decorative marker, not a missing-alt violation", () => {
    // avatar.png has real alt text, banner.png has alt="" (decorative, by design),
    // icon.png has no alt attribute at all — only icon.png should count as missing.
    expect(result.imagesTotal).toBe(3);
    expect(result.imagesMissingAlt).toBe(1);
  });

  test("counts body words but excludes script and style contents", () => {
    // "Welcome" (1) + "Projects" (1) + the paragraph (9 words, despite claiming
    // to be "seven") = 11. The script's JS and the style block's CSS must not
    // leak into the count.
    expect(result.wordCount).toBe(11);
  });
});

describe("parseReport — failure case: page has no metadata at all", () => {
  const html = `<html><body><p>Just a sentence, nothing else here.</p></body></html>`;
  const result = parseReport(html);

  test("returns null for title and metaDescription instead of throwing or returning ''", () => {
    expect(result.title).toBeNull();
    expect(result.metaDescription).toBeNull();
  });

  test("h1Count and imagesTotal are 0, not undefined, when absent", () => {
    expect(result.h1Count).toBe(0);
    expect(result.imagesTotal).toBe(0);
    expect(result.imagesMissingAlt).toBe(0);
  });

  test("still produces an accurate word count from the remaining content", () => {
    expect(result.wordCount).toBe(6);
  });
});

describe("parseReport — failure case: malformed / empty HTML", () => {
  test("a completely empty string does not throw", () => {
    expect(() => parseReport("")).not.toThrow();
    const result = parseReport("");
    expect(result.wordCount).toBe(0);
    expect(result.title).toBeNull();
  });

  test("unclosed tags and broken markup still parse without throwing", () => {
    // Cheerio is forgiving of malformed HTML by design — this test exists
    // to lock in that we rely on that tolerance rather than assume well-formed input.
    const broken = `<html><body><h1>Oops<p>Missing closing tags<img src="x.png"</body>`;
    expect(() => parseReport(broken)).not.toThrow();
  });
});

describe("parseReport — meta description fallback", () => {
  test("falls back to og:description when a plain description tag is absent", () => {
    const html = `
      <html><head>
        <meta property="og:description" content="Open Graph fallback text." />
      </head><body></body></html>
    `;
    const result = parseReport(html);
    expect(result.metaDescription).toBe("Open Graph fallback text.");
  });
});