require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { SearchIndex } = require("./search");
const { isBlocked, matchSmallTalk, DECLINE_REPLY } = require("./guardrails");
const { matchFAQ } = require("./faq");

const PORT = 3050;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_MINUTE || 30);
const MAX_STRIKES = 3;
const LOCK_DURATION_MS = (Number(process.env.GUARDRAIL_LOCK_MINUTES) || 15) * 60 * 1000;

// ---------------------------------------------------------------------------
// Load the crawled site knowledge (run `npm run crawl` to (re)generate it)
// and build the in-memory keyword search index. No AI model, no API calls —
// answers are found by matching question keywords against site content.
// ---------------------------------------------------------------------------
const KNOWLEDGE_PATH = path.join(__dirname, "knowledge.json");
let chunks = [];

if (fs.existsSync(KNOWLEDGE_PATH)) {
  chunks = JSON.parse(fs.readFileSync(KNOWLEDGE_PATH, "utf8"));
  console.log(`Loaded ${chunks.length} knowledge chunks.`);
} else {
  console.warn("knowledge.json not found — run `npm run crawl` first.");
}

const index = new SearchIndex(chunks);
const contactChunk = chunks.find((c) => /\/contact/i.test(c.url));
const CONTACT_LINE = contactChunk
  ? `You can also reach out directly via our [contact page](${contactChunk.url}).`
  : "You can also reach out to us through the contact page on our site.";

const NO_MATCH_REPLY = `I don't have specific information about that on our site. ${CONTACT_LINE}`;
const BLOCKED_REPLY = "I can't help with that request. I'm only able to answer questions about CyberDude Networks.";

function truncate(text, max = 480) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : max)}…`;
}

function buildReply(matches) {
  // Keep at most one chunk per source page so the reply covers distinct
  // topics instead of three fragments of the same paragraph.
  const seenUrls = new Set();
  const distinct = [];
  for (const { chunk } of matches) {
    if (seenUrls.has(chunk.url)) continue;
    seenUrls.add(chunk.url);
    distinct.push(chunk);
    if (distinct.length === 2) break;
  }

  if (distinct.length === 1) {
    const c = distinct[0];
    return `${truncate(c.content)}\n\n[Read more on ${c.title}](${c.url})`;
  }

  return distinct
    .map((c) => `**${c.title}**\n${truncate(c.content, 320)}\n[Read more](${c.url})`)
    .join("\n\n");
}

// Deterministic lookup used by the widget's menu: given a known page URL,
// return that page's content directly instead of going through fuzzy
// search. Guarantees the guided menu always lands on the right content,
// unlike free-text search which can occasionally pick a related-but-wrong
// page.
function buildTopicReply(url) {
  const pageChunks = chunks.filter((c) => c.url === url);
  if (!pageChunks.length) return null;
  const combined = pageChunks.map((c) => c.content).join(" ");
  return `**${pageChunks[0].title}**\n${truncate(combined, 550)}\n\n[Read more](${url})`;
}

// ---------------------------------------------------------------------------
// Guardrail strikes: after MAX_STRIKES blocked messages from the same
// visitor, pause the chat for a while instead of letting them keep probing.
// In-memory is fine here — a restart resetting strikes is an acceptable
// trade-off for not needing a database.
// ---------------------------------------------------------------------------
const strikes = new Map(); // ip -> { count, lockedUntil }

function getStrikeState(ip) {
  return strikes.get(ip) || { count: 0, lockedUntil: 0 };
}

function currentLockReply(state) {
  const minutesLeft = Math.max(1, Math.ceil((state.lockedUntil - Date.now()) / 60000));
  return `This conversation has been paused after repeated policy violations. Please try again in about ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}, or reach out directly via the site's contact page.`;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "20kb" }));

// app.use(
//   // cors({
//   //   origin(origin, callback) {
//   //     // Allow same-origin/non-browser tools (no Origin header) and the
//   //     // explicit allowlist from .env. Reject everything else.
//   //     if (!origin || ALLOWED_ORIGINS.includes(origin)) {
//   //       callback(null, true);
//   //     } else {
//   //       callback(new Error("Not allowed by CORS"));
//   //     }
//   //   },
//   // })
// );
app.use(cors())
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: RATE_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many messages — please slow down a moment." },
});
app.use("/api/chat", chatLimiter);
app.use("/api/topic", chatLimiter);

app.get("/api/health", (_req, res) => res.json({ ok: true, chunks: chunks.length }));

app.post("/api/chat", (req, res) => {
  const { message } = req.body || {};

  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "message is required" });
  }
  if (message.length > 500) {
    return res.status(400).json({ error: "message is too long" });
  }

  const state = getStrikeState(req.ip);
  if (state.lockedUntil > Date.now()) {
    return res.status(403).json({ reply: currentLockReply(state), locked: true });
  }

  if (isBlocked(message)) {
    state.count += 1;
    if (state.count >= MAX_STRIKES) {
      state.lockedUntil = Date.now() + LOCK_DURATION_MS;
      strikes.set(req.ip, state);
      return res.status(403).json({
        reply:
          "You've reached the maximum number of policy violations for this conversation, so it's now paused. Please contact us directly via the site's contact page if you need help.",
        locked: true,
      });
    }
    strikes.set(req.ip, state);
    return res.json({ reply: `${BLOCKED_REPLY} (Warning ${state.count}/${MAX_STRIKES})` });
  }

  const smallTalkReply = matchSmallTalk(message);
  if (smallTalkReply) {
    return res.json({ reply: smallTalkReply });
  }

  const faqReply = matchFAQ(message);
  if (faqReply) {
    return res.json({ reply: faqReply });
  }

  const matches = index.search(message, 3);
  const reply = matches.length ? buildReply(matches) : NO_MATCH_REPLY;

  res.json({ reply });
});

// Used by the widget's guided menu — looks up a known page directly instead
// of going through search, so menu navigation is always exactly right.
app.post("/api/topic", (req, res) => {
  const { url } = req.body || {};

  const state = getStrikeState(req.ip);
  if (state.lockedUntil > Date.now()) {
    return res.status(403).json({ reply: currentLockReply(state), locked: true });
  }

  if (typeof url !== "string" || !url.startsWith("https://cyberdudenetworks.com/")) {
    return res.status(400).json({ error: "invalid topic" });
  }

  const reply = buildTopicReply(url);
  if (!reply) return res.status(404).json({ error: "Topic not found" });

  res.json({ reply });
});

// Generic error handler — keeps stack traces/internal paths out of
// responses (Express's default handler would otherwise leak them as HTML).
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.message === "Not allowed by CORS" ? 403 : 500).json({
    error: "Something went wrong on our end. Please try again in a moment.",
  });
});

app.listen(PORT, () => {
  console.log(`CyberDude chatbot server listening on port ${PORT}`);
});
