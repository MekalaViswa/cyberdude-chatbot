// Guardrails for a non-AI, keyword-search-based bot. Since there is no
// language model doing judgment calls, safety here works differently than a
// typical "system prompt": we pattern-match obviously bad requests and
// handle common small talk directly, before ever touching the search index.

// Categories kept intentionally broad rather than exhaustive — this is a
// blocklist, not a moderation model, so treat it as a basic filter, not a
// guarantee.
const BLOCKED_PATTERNS = [
  /\b(kill|murder|suicide|self[\s-]?harm|bomb|explosive|weapon)\b/i,
  /\b(hack|exploit|malware|ransomware|ddos|phishing|steal\s+(data|password))\b/i,
  /\b(porn|nsfw|sexual|nude)\b/i,
  /\b(fuck|shit|bitch|asshole|cunt)\b/i,
  /\b(credit\s?card\s?number|social\s?security\s?number|ssn|password|bank\s?account\s?number)\b/i,
];

const SMALL_TALK = [
  {
    pattern: /^(hi|hello|hey|good\s?(morning|afternoon|evening))[!.\s]*$/i,
    reply: "Hi there! I'm the CyberDude Networks site assistant. Ask me about our services, past work, engagement models, or how to get started.",
  },
  {
    pattern: /^(thanks|thank you|thx|ty)[!.\s]*$/i,
    reply: "You're welcome! Let me know if there's anything else about CyberDude Networks I can help with.",
  },
  {
    pattern: /(who are (you|u)\b|what are (you|u)\b|what can (you|u) (do|help)|help me)/i,
    reply:
      "I'm the CyberDude Networks website assistant. I can answer questions about our services (IoT & edge computing, AI-native SaaS, autonomous ERP, legacy modernization, data security), our past work, engagement models, careers, and the Academy — based on the content of this site.",
  },
  {
    pattern: /^(bye|goodbye|see\s?ya)[!.\s]*$/i,
    reply: "Thanks for stopping by — reach out anytime through the site's contact page if you'd like to talk to the team!",
  },
];

function isBlocked(message) {
  return BLOCKED_PATTERNS.some((re) => re.test(message));
}

function matchSmallTalk(message) {
  const trimmed = message.trim();
  const hit = SMALL_TALK.find((s) => s.pattern.test(trimmed));
  return hit ? hit.reply : null;
}

const DECLINE_REPLY =
  "I can only help with questions related to CyberDude Networks — our services, work, and how to get started. Could you rephrase your question around that?";

module.exports = { isBlocked, matchSmallTalk, DECLINE_REPLY };
