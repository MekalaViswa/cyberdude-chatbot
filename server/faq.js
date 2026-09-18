// Direct-answer FAQ seeder for facts that live in structured site data (team,
// contact details) rather than prose — keyword search over crawled chunks is
// unreliable for these ("who is the CEO" doesn't share vocabulary with the
// paragraph that names him), so they're answered directly instead, before
// falling back to search. Sourced from knowledge.json (about, contact pages).
//
// Each entry accepts several phrasing styles for the same intent — a direct
// question ("what's your X"), "who is X" (with or without a possessive —
// "who is ceo" as well as "who is the ceo"), "X name" ("founder name"), an
// imperative ask ("give me X" / "tell me X" / "share X"), and a bare keyword
// on its own ("ceo?") — since real users mix all of these, and use "ur"
// interchangeably with "your".
const POSS = "(?:your|ur|the|our)";
const OPT_POSS = `(?:${POSS}\\s+)?`;
const ASK = "(?:give|tell|share|send)(?:\\s+me)?";

// role: the word(s) that name the position, e.g. "ceo|founder"
// bareRole: same, used inside a ^...$ anchor for a standalone keyword query
function roleQuestion(role) {
  return new RegExp(
    `\\bwho('?s| is)\\s+${OPT_POSS}(${role})\\b` + // "who is ceo" / "who is the ceo"
    `|\\b(${role})('s)?\\s+name\\b` + // "ceo name" / "founder's name"
    `|\\b${ASK}\\s+${OPT_POSS}(${role})('s)?\\s*(name)?\\b` + // "give me the ceo" / "tell me the founder's name"
    `|^\\s*(${role})\\s*\\??\\s*$`, // bare "ceo" / "ceo?"
    "i"
  );
}

const FAQ = [
  {
    pattern: new RegExp(
      roleQuestion("ceo|founder").source + `|\\bfounded\\s+by\\b|\\bwho\\s+founded\\b`,
      "i"
    ),
    reply: "Our Founder, CEO & Principal Scientist is **Mr. Anbuselvan Annamalai**.",
  },
  {
    pattern: roleQuestion("cto"),
    reply: "Our CTO is **Mr. Abishek Pushparaj**.",
  },
  {
    pattern: roleQuestion("director"),
    reply: "Our Director is **Dr. Ananth JP**.",
  },
  {
    pattern: /\b(leadership|founders?|management)\s+team\b|\bwho\s+(runs|leads|manages)\s+cyberdude\b/i,
    reply:
      "Our leadership team: **Mr. Anbuselvan Annamalai** (Founder, CEO & Principal Scientist), **Mr. Abishek Pushparaj** (CTO), **Dr. Ananth JP** (Director), and **Mr. Yuvaraj Mohan** (Business Analyst).",
  },
  {
    pattern: new RegExp(
      `\\b(contact|phone|mobile|whatsapp)\\s*(number|no\\.?)\\b` +
      `|\\bhow\\s+(can|do)\\s+i\\s+(call|reach|contact|dial)\\s+you\\b` +
      `|\\bwhat('?s| is)\\s+${POSS}\\s*(phone|contact|mobile|whatsapp)\\b` +
      `|\\b${ASK}\\s+${OPT_POSS}(phone|contact|mobile|whatsapp)\\s*(number|no\\.?)?\\b`,
      "i"
    ),
    reply:
      "You can call us directly: 📞 [+91 89397 38801](tel:+918939738801) or [+91 81484 13506](tel:+918148413506).",
  },
  {
    pattern: new RegExp(
      `\\bwhat('?s| is)\\s+${POSS}\\s*e[\\s-]?mail\\b` +
      `|\\be[\\s-]?mail\\s+(address|id)\\b` +
      `|\\b${ASK}\\s+${OPT_POSS}e[\\s-]?mail\\b`,
      "i"
    ),
    reply: "You can email us at [hello@cyberdudenetworks.com](mailto:hello@cyberdudenetworks.com).",
  },
  {
    pattern: new RegExp(
      `\\b${POSS}\\s+address\\b` +
      `|\\bwhere\\s+(are\\s+you|is\\s+${POSS}\\s+office)\\s*(located)?\\b` +
      `|\\bwhere\\s+is\\s+cyberdude\\b` +
      `|\\boffice\\s+location\\b` +
      `|\\b${ASK}\\s+${OPT_POSS}address\\b`,
      "i"
    ),
    reply:
      "Our office: #32, Second Street, Ramalingapuram, Kamaraj Nagar, Avadi, Chennai – 600 071, India. We also have teams in Malaysia and Dubai.",
  },
  {
    pattern: new RegExp(
      `\\bwhen\\s+(was\\s+cyberdude\\s+)?founded\\b` +
      `|\\bhow\\s+old\\s+is\\s+cyberdude\\b` +
      `|\\bwhich\\s+year\\s+.*\\b(start|found)` +
      `|\\bsince\\s+when\\b` +
      `|\\b${ASK}\\s+${OPT_POSS}(founding|founded)\\s+(year|date)\\b`,
      "i"
    ),
    reply: "CyberDude Networks was founded in **December 2016** in Chennai — 9+ years in business, 35+ projects shipped.",
  },
];

function matchFAQ(message) {
  const trimmed = message.trim();
  const hit = FAQ.find((f) => f.pattern.test(trimmed));
  return hit ? hit.reply : null;
}

module.exports = { matchFAQ };
