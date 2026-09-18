# CyberDude Networks — Website Chatbot

A chat widget for cyberdudenetworks.com that answers questions grounded in the
site's own content, with guardrails, voice search (mic), and spoken replies.

## How it works

1. **`server/crawl.js`** crawls the live site once and saves its text content
   into `server/knowledge.json` (chunked, per page).
2. **`server/server.js`** is a small Express API. On each chat message it
   sends your guardrail instructions + the site knowledge (as a cached system
   prompt) + the conversation to Claude, and returns the answer.
3. **`widget/widget.js`** is the embeddable frontend: an animated launch
   button, a rich chat window, markdown-formatted replies, a mic button for
   voice search (Web Speech API), spoken replies (Web Speech Synthesis), and
   short tone cues when the mic turns on/off. It's a single script tag —
   no build step, no framework, renders inside a Shadow DOM so it won't
   clash with the site's existing CSS.

No vector database is used — the site's content is small enough to hand to
Claude directly each time, with prompt caching so repeat requests are cheap.
If the site grows much larger later, retrieval can be added without changing
the widget.

## 1. Backend setup

```bash
cd server
npm install
cp .env.example .env
```

Edit `.env`:
- `ANTHROPIC_API_KEY` — from https://console.anthropic.com/settings/keys
- `ALLOWED_ORIGINS` — your live domain(s), e.g. `https://cyberdudenetworks.com`

Build the knowledge base from the live site (re-run this any time site
content changes):

```bash
npm run crawl
```

Start the server:

```bash
npm start
```

It listens on `http://localhost:3000` by default, with the chat endpoint at
`POST /api/chat`.

## 2. Try the widget locally

Open `widget/test.html` in a browser (with the server running). It loads
`widget.js` pointed at `http://localhost:3000/api/chat`. Click the floating
button bottom-right, type a question, or click the mic and speak.

## 3. Deploy

- **Backend**: deploy the `server/` folder to Render, Railway, or any Node
  host. Set the same environment variables there (`ANTHROPIC_API_KEY`,
  `ALLOWED_ORIGINS` set to your real domain, `PORT` if required by the host).
- **Widget**: host `widget.js` anywhere reachable over HTTPS (same host as
  the backend is fine, a CDN, or directly alongside the website's other
  static assets).
- **Embed** on cyberdudenetworks.com, right before `</body>` on every page
  you want the bot to appear:

```html
<script
  src="https://YOUR-WIDGET-HOST/widget.js"
  data-api-url="https://YOUR-BACKEND-HOST/api/chat"
  data-name="CyberDude Assistant"
  defer
></script>
```

Optional attributes: `data-greeting`, `data-primary-color`,
`data-accent-color` to restyle without touching the code.

## Guardrails (tune in `server/server.js` → `GUARDRAILS`)

- Answers are restricted to CyberDude Networks topics; off-topic requests
  are politely declined.
- Answers are grounded only in the crawled site content — the bot is told to
  say "I don't have that information" rather than invent facts, pricing, or
  claims.
- Refuses harmful/illegal content and prompt-injection attempts ("ignore
  previous instructions", role-play jailbreaks, etc.).
- Doesn't solicit sensitive personal data.
- Rate-limited per IP (`RATE_LIMIT_PER_MINUTE` in `.env`) and CORS-locked to
  your real domain(s) so the API can't be freely called from other sites.

## Notes on voice features

- Voice search (mic) uses the browser's built-in `SpeechRecognition` API —
  supported in Chrome, Edge, and Safari (partial); it degrades gracefully
  (mic button disables itself) in browsers without support.
- Spoken replies use `SpeechSynthesis`, also built-in and free. Visitors can
  toggle it off via the speaker icon in the widget header; the setting is
  remembered per-browser.
- Mic on/off sounds are generated tones (Web Audio API) — no audio files to
  host or replace.

## Maintaining the knowledge base

Whenever site content changes meaningfully (new services, case studies,
pricing, etc.), re-run `npm run crawl` in `server/` and restart the server so
the bot's answers stay accurate.
