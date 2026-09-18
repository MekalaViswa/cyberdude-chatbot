// Tiny, dependency-free TF-IDF search engine over the crawled site content.
// No AI model, no API calls — pure keyword matching.

const STOPWORDS = new Set(
  ("a an and are as at be by for from has have how i in is it its of on or " +
    "our so that the their there they this to us was we what when where " +
    "which who why will with you your can does do about into over under " +
    "than then them these those not no yes if but").split(" ")
);

// Very light stemming (plural/suffix stripping) so "service" and "services",
// or "model" and "models", count as the same term instead of competing for
// separate, independently-weighted matches.
function stem(word) {
  if (word.length > 4 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 4 && word.endsWith("es") && !word.endsWith("ses")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
  return word;
}

function tokenize(text) {
  return (text.toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

// Bridges phrasing gaps stemming can't (genuinely different words for the
// same idea) — e.g. a visitor asking "where are you located" won't find the
// literal word "located" on the contact page, which says "office"/"address".
const SYNONYM_GROUPS = [
  ["locate", "located", "location", "address", "office", "based", "headquarters", "city", "region"],
  ["hire", "job", "career", "role", "position", "employment", "vacancy", "opening"],
  ["price", "pricing", "cost", "budget", "fee", "rate", "afford", "expensive", "cheap", "quote"],
  ["contact", "reach", "email", "phone", "call", "touch"],
  ["service", "solution", "offering", "offer", "provide"],
  ["company", "who", "team", "story"],
  ["intern", "internship", "trainee", "student"],
  ["engagement", "package", "plan", "process", "approach", "engage"],
  ["security", "secure", "safety", "protect", "protection", "compliance"],
  ["ai", "artificial", "intelligence", "ml", "machine", "learn"],
  ["academy", "training", "course", "learn"],
];

const SYNONYMS = new Map();
SYNONYM_GROUPS.forEach((group) => {
  const stemmedGroup = [...new Set(group.map(stem))];
  stemmedGroup.forEach((term) => {
    const others = stemmedGroup.filter((t) => t !== term);
    SYNONYMS.set(term, others);
  });
});

// Legal/policy pages are rarely the intended answer to an open-ended
// question about the business — but their dense, repetitive boilerplate
// ("Service", "data", "information"...) can out-score genuinely relevant
// pages on raw term frequency. Dampen rather than exclude them, so they can
// still surface for an explicit privacy/terms question.
function relevanceWeight(url) {
  return /\/legal\//i.test(url) ? 0.35 : 1;
}

class SearchIndex {
  constructor(chunks) {
    this.chunks = chunks; // [{ id, url, title, content }]
    this.docTokens = chunks.map((c) => tokenize(`${c.title} ${c.content}`));
    this.df = new Map(); // term -> number of chunks containing it
    this.docTokens.forEach((tokens) => {
      new Set(tokens).forEach((t) => this.df.set(t, (this.df.get(t) || 0) + 1));
    });
    this.N = chunks.length;
  }

  idf(term) {
    const df = this.df.get(term) || 0;
    return Math.log((this.N + 1) / (df + 1)) + 1;
  }

  // Returns top matching chunks, each with a relevance score.
  search(query, topK = 3) {
    const queryTerms = [...new Set(tokenize(query))];
    if (!queryTerms.length) return [];

    // Expand with synonyms at reduced weight so phrasing differences
    // ("hiring" vs "careers") still find the right page.
    const weightedTerms = new Map(); // term -> weight
    queryTerms.forEach((t) => weightedTerms.set(t, 1));
    queryTerms.forEach((t) => {
      (SYNONYMS.get(t) || []).forEach((syn) => {
        if (!weightedTerms.has(syn)) weightedTerms.set(syn, 0.6);
      });
    });

    const scores = this.chunks.map((chunk, idx) => {
      const tokens = this.docTokens[idx];
      const tf = new Map();
      tokens.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
      const titleTokens = new Set(tokenize(chunk.title));

      let rawScore = 0;
      let distinctMatched = 0;
      weightedTerms.forEach((weight, term) => {
        const count = tf.get(term) || 0;
        let matched = false;
        if (count > 0) {
          // log-dampened term frequency: a word repeated several times in
          // a short chunk shouldn't outweigh a rarer, more specific word
          // that appears once in the chunk that's actually about it.
          rawScore += weight * (1 + Math.log(count)) * this.idf(term);
          matched = true;
        }
        if (titleTokens.has(term)) {
          // A term matching the page's own title is the strongest relevance
          // signal on a small multi-page site — weighted above a single
          // incidental body mention so the actual "IoT Solutions" page beats
          // a blog post that merely mentions IoT a few times in passing.
          rawScore += weight * this.idf(term) * 1.5;
          matched = true;
        }
        // Only count full-weight (non-synonym) terms toward coverage, so
        // multi-word queries still favor the chunk matching most of them.
        if (matched && weight === 1) distinctMatched++;
      });

      // Coverage bonus: chunks matching more of the distinct query terms
      // rank well above chunks that only match one word a lot.
      const coverage = distinctMatched / queryTerms.length;
      const score = rawScore * (0.25 + 0.75 * coverage) * relevanceWeight(chunk.url);

      return { chunk, score };
    });

    return scores
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}

module.exports = { SearchIndex, tokenize };
