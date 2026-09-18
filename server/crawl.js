// One-time (or occasionally re-run) crawler that turns the live website into
// a local knowledge base (knowledge.json) the chatbot answers questions from.
//
// Usage: npm run crawl
// Re-run it any time the site content changes, then restart the server.

const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");

const START_URL = "https://cyberdudenetworks.com/";
const MAX_PAGES = 60; // safety cap so a link loop can't crawl forever
const ORIGIN = new URL(START_URL).origin;

const NOISE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "svg",
  "nav",
  "footer",
  "header",
  "[aria-hidden='true']",
];

// This site renders content client-side (React) — a plain fetch() only
// returns a shared HTML shell that's nearly identical across different
// pages (confirmed: two different case-study URLs returned near-identical
// raw HTML). A headless browser actually runs the page's JS so we see the
// real, page-specific content before extracting it.
async function fetchRenderedPage(browser, url) {
  const page = await browser.newPage();
  try {
    await page.setUserAgent("CyberDudeChatbotCrawler/1.0");
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
    return await page.content();
  } finally {
    await page.close();
  }
}

function extractPage(url, html) {
  const $ = cheerio.load(html);

  // Collect same-origin links (from the full document, so site nav is
  // still followed) before stripping anything.
  const links = new Set();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const abs = new URL(href, url);
      abs.hash = "";
      abs.search = ""; // query-string variants (?model=x) are the same page
      if (
        abs.origin === ORIGIN &&
        !abs.pathname.match(/\.(pdf|jpg|jpeg|png|gif|svg|webp|zip|css|js)$/i)
      ) {
        links.add(abs.toString());
      }
    } catch {
      // ignore malformed hrefs
    }
  });

  const title = $("title").first().text().trim() || url;

  NOISE_SELECTORS.forEach((sel) => $(sel).remove());

  // cheerio's .text() concatenates adjacent elements with no separator
  // (e.g. "<div>Software</div><div>Engagement Models</div>" becomes
  // "SoftwareEngagement Models"), which silently glues words together and
  // breaks keyword matching. Inserting a space after every element before
  // extracting text avoids that.
  $("main, body").find("*").after(" ");

  // Prefer <main> (the actual page content) over <body>, which also
  // catches floating logo/brand markup that isn't wrapped in <nav>/<header>.
  const contentRoot = $("main").length ? $("main") : $("body");
  const text = contentRoot.text().replace(/\s+/g, " ").trim();

  return { title, text, links: [...links] };
}

// Splits long page text into ~550 character chunks on sentence boundaries.
// Smaller chunks keep each one topically focused, which matters a lot for
// keyword search: a chunk that blends three unrelated sections together
// dilutes the term-frequency signal for the one that actually matters.
function chunkText(text, maxLen = 550) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let current = "";
  for (const sentence of sentences) {
    if ((current + " " + sentence).length > maxLen && current) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function crawl() {
  const visited = new Set();
  const queue = [START_URL];
  const pages = [];
  // Some routes on this site (e.g. individual /careers/* and case-study
  // detail pages) render identical placeholder content regardless of the
  // URL slug — a bug on the site's side, not something crawling can fix.
  // Skipping exact-duplicate content keeps the knowledge base (and search
  // results) from being flooded with repeated noise.
  const seenText = new Set();
  const skippedDuplicates = [];

  const browser = await puppeteer.launch({ headless: true });

  try {
    while (queue.length && visited.size < MAX_PAGES) {
      const url = queue.shift();
      if (visited.has(url)) continue;
      visited.add(url);

      try {
        const html = await fetchRenderedPage(browser, url);
        const { title, text, links } = extractPage(url, html);
        const isErrorPage = /Oops!\s*You'?re lost|page not found|404 error/i.test(text);
        if (text.length > 50 && !isErrorPage) {
          if (seenText.has(text)) {
            skippedDuplicates.push(url);
          } else {
            seenText.add(text);
            pages.push({ url, title, text });
            console.log(`Crawled: ${url} (${text.length} chars)`);
          }
        }
        for (const link of links) {
          if (!visited.has(link)) queue.push(link);
        }
      } catch (err) {
        console.warn(`Skipped ${url}: ${err.message}`);
      }
    }
  } finally {
    await browser.close();
  }

  if (skippedDuplicates.length) {
    console.log(
      `\nSkipped ${skippedDuplicates.length} page(s) with duplicate content (likely unwired dynamic routes on the site):`
    );
    skippedDuplicates.forEach((u) => console.log(`  - ${u}`));
  }

  const knowledge = pages.flatMap((page) =>
    chunkText(page.text).map((chunk, i) => ({
      id: `${page.url}#${i}`,
      url: page.url,
      title: page.title,
      content: chunk,
    }))
  );

  const outPath = path.join(__dirname, "knowledge.json");
  fs.writeFileSync(outPath, JSON.stringify(knowledge, null, 2));
  console.log(
    `\nDone. ${pages.length} pages -> ${knowledge.length} chunks written to ${outPath}`
  );
}

crawl().catch((err) => {
  console.error("Crawl failed:", err);
  process.exit(1);
});
