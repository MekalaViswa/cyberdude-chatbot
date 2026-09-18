/**
 * CyberDude Networks — embeddable chat widget.
 * Drop-in usage (before </body>):
 *
 * <script
 *   src="https://your-cdn-or-host/widget.js"
 *   data-api-url="https://your-backend.example.com/api/chat"
 *   data-name="CyberDude Assistant"
 *   defer
 * ></script>
 *
 * Everything (markup, styles, logic) lives in this one file and renders
 * inside a Shadow DOM so it can't clash with the host page's CSS.
 */
(function () {
  "use strict";

  const scriptTag = document.currentScript;
  const CFG = {
    apiUrl: scriptTag?.dataset.apiUrl || "http://localhost:3050/api/chat",
    name: scriptTag?.dataset.name || "CyberDude Assistant",
    greeting:
      scriptTag?.dataset.greeting ||
      "Hi, I'm the CyberDude Networks assistant.\nHi! How can I help you today?",
    primary: scriptTag?.dataset.primaryColor || "#7C3AED",
    accent: scriptTag?.dataset.accentColor || "#06B6D4",
  };
  CFG.topicApiUrl = scriptTag?.dataset.topicApiUrl || CFG.apiUrl.replace(/\/chat$/, "/topic");

  const SpeechRecognitionAPI =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  const supportsSTT = !!SpeechRecognitionAPI;
  const supportsTTS = "speechSynthesis" in window;

  // ---------------------------------------------------------------------
  // Host + Shadow DOM
  // ---------------------------------------------------------------------
  const host = document.createElement("div");
  host.id = "cyberdude-chat-widget-host";
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    :host, * { box-sizing: border-box; }
    .cdc-root {
      --primary: ${CFG.primary};
      --accent: ${CFG.accent};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483000;
    }

    /* ---------- Launch button ---------- */
    .cdc-launch {
      position: relative;
      width: 64px;
      height: 64px;
      border-radius: 50%;
      border: none;
      cursor: pointer;
      background: linear-gradient(135deg, var(--primary), var(--accent));
      box-shadow: 0 8px 24px rgba(0,0,0,0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      animation: cdc-bounce-in 0.5s cubic-bezier(.34,1.56,.64,1);
      transition: transform 0.2s ease;
    }
    .cdc-launch:hover { transform: scale(1.08); }
    .cdc-launch:active { transform: scale(0.95); }
    .cdc-launch::before {
      content: "";
      position: absolute;
      inset: -6px;
      border-radius: 50%;
      border: 2px solid var(--accent);
      opacity: 0.6;
      animation: cdc-pulse-ring 2.2s ease-out infinite;
    }
    .cdc-launch svg { width: 28px; height: 28px; color: #fff; transition: transform .25s ease, opacity .25s ease; }
    .cdc-launch .cdc-icon-close { position: absolute; opacity: 0; transform: rotate(-90deg) scale(.6); }
    .cdc-root.cdc-open .cdc-launch .cdc-icon-chat { opacity: 0; transform: rotate(90deg) scale(.6); }
    .cdc-root.cdc-open .cdc-launch .cdc-icon-close { opacity: 1; transform: rotate(0) scale(1); }
    .cdc-badge {
      position: absolute;
      top: -2px; right: -2px;
      width: 16px; height: 16px;
      border-radius: 50%;
      background: #22c55e;
      border: 2px solid #fff;
      box-shadow: 0 0 0 0 rgba(34,197,94,.7);
      animation: cdc-badge-pulse 2s infinite;
    }
    .cdc-root.cdc-open .cdc-badge { display: none; }

    @keyframes cdc-bounce-in {
      0% { transform: scale(0); opacity: 0; }
      60% { transform: scale(1.15); opacity: 1; }
      100% { transform: scale(1); }
    }
    @keyframes cdc-pulse-ring {
      0% { transform: scale(1); opacity: .6; }
      100% { transform: scale(1.35); opacity: 0; }
    }
    @keyframes cdc-badge-pulse {
      0% { box-shadow: 0 0 0 0 rgba(34,197,94,.7); }
      70% { box-shadow: 0 0 0 8px rgba(34,197,94,0); }
      100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
    }

    /* ---------- Chat window ---------- */
    .cdc-panel {
      position: absolute;
      bottom: 80px;
      right: 0;
      width: 380px;
      max-width: calc(100vw - 32px);
      height: 560px;
      max-height: calc(100vh - 140px);
      border-radius: 20px;
      overflow: hidden;
      background: #0f1220;
      box-shadow: 0 20px 60px rgba(0,0,0,.45);
      display: flex;
      flex-direction: column;
      transform-origin: bottom right;
      transform: scale(0.85) translateY(12px);
      opacity: 0;
      pointer-events: none;
      transition: transform .28s cubic-bezier(.34,1.56,.64,1), opacity .22s ease;
      border: 1px solid rgba(255,255,255,.08);
    }
    .cdc-root.cdc-open .cdc-panel {
      transform: scale(1) translateY(0);
      opacity: 1;
      pointer-events: auto;
    }

    .cdc-header {
      padding: 16px 18px;
      background: linear-gradient(135deg, var(--primary), var(--accent));
      display: flex;
      align-items: center;
      gap: 10px;
      color: #fff;
    }
    .cdc-avatar {
      width: 36px; height: 36px; border-radius: 50%;
      background: rgba(255,255,255,.2);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .cdc-avatar svg { width: 20px; height: 20px; }
    .cdc-header-text { flex: 1; min-width: 0; }
    .cdc-header-name { font-weight: 600; font-size: 14.5px; }
    .cdc-header-status { font-size: 12px; opacity: .85; display: flex; align-items: center; gap: 5px; }
    .cdc-header-status::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: #4ade80; display: inline-block; }
    .cdc-header-btn {
      background: rgba(255,255,255,.15);
      border: none; color: #fff; width: 30px; height: 30px; border-radius: 8px;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      transition: background .15s ease;
    }
    .cdc-header-btn:hover { background: rgba(255,255,255,.3); }
    .cdc-header-btn svg { width: 16px; height: 16px; }

    /* ---------- Messages ---------- */
    .cdc-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background:
        radial-gradient(circle at 20% 0%, rgba(124,58,237,.15), transparent 40%),
        radial-gradient(circle at 100% 100%, rgba(6,182,212,.12), transparent 40%),
        #0f1220;
    }
    .cdc-messages::-webkit-scrollbar { width: 6px; }
    .cdc-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15); border-radius: 3px; }

    .cdc-row { display: flex; gap: 8px; align-items: flex-end; animation: cdc-msg-in .25s ease; }
    .cdc-row.cdc-user { justify-content: flex-end; }
    @keyframes cdc-msg-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

    .cdc-bubble {
      position: relative;
      max-width: 78%;
      padding: 10px 13px;
      border-radius: 16px;
      font-size: 14px;
      line-height: 1.45;
      word-wrap: break-word;
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.08);
      color: #e7e9f5;
    }
    .cdc-bubble p { margin: 0 0 6px; }
    .cdc-bubble p:last-child { margin-bottom: 0; }
    .cdc-bubble ul { margin: 4px 0; padding-left: 18px; }
    .cdc-bubble a { color: inherit; text-decoration: underline; }
    .cdc-row.cdc-bot .cdc-bubble { border-bottom-left-radius: 4px; }
    .cdc-row.cdc-bot .cdc-bubble::after {
      content: "";
      position: absolute;
      width: 10px; height: 10px;
      bottom: 0; left: -4px;
      background: rgba(255,255,255,.06);
      border-left: 1px solid rgba(255,255,255,.08);
      border-bottom: 1px solid rgba(255,255,255,.08);
      border-bottom-right-radius: 6px;
      transform: rotate(45deg);
      z-index: -1;
    }
    .cdc-row.cdc-user .cdc-bubble { border-bottom-right-radius: 4px; }
    .cdc-row.cdc-user .cdc-bubble::after {
      content: "";
      position: absolute;
      width: 10px; height: 10px;
      bottom: 0; right: -4px;
      background: rgba(255,255,255,.06);
      border-right: 1px solid rgba(255,255,255,.08);
      border-bottom: 1px solid rgba(255,255,255,.08);
      border-bottom-left-radius: 6px;
      transform: rotate(-45deg);
      z-index: -1;
    }
    .cdc-mini-avatar {
      width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
      background: linear-gradient(135deg, var(--primary), var(--accent));
      display: flex; align-items: center; justify-content: center;
    }
    .cdc-mini-avatar svg { width: 14px; height: 14px; color: #fff; }

    .cdc-speak-btn {
      background: none; border: none; cursor: pointer; opacity: .55;
      padding: 2px; display: flex; align-items: center; flex-shrink: 0;
      transition: opacity .15s ease;
    }
    .cdc-speak-btn:hover { opacity: 1; }
    .cdc-speak-btn svg { width: 14px; height: 14px; color: #cbd5e1; }

    /* ---------- Guided menu chips ---------- */
    .cdc-menu-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      max-width: 92%;
      margin-left: 34px;
      animation: cdc-msg-in .25s ease;
    }
    .cdc-chip {
      border: 1px solid rgba(255,255,255,.15);
      background: rgba(255,255,255,.06);
      color: #e7e9f5;
      font-size: 13px;
      font-family: inherit;
      padding: 7px 13px;
      border-radius: 999px;
      cursor: pointer;
      transition: background .15s ease, border-color .15s ease, transform .15s ease;
      white-space: nowrap;
    }
    .cdc-chip:hover { background: rgba(255,255,255,.14); border-color: var(--accent); transform: translateY(-1px); }
    .cdc-chip:active { transform: translateY(0); }
    .cdc-chip.cdc-chip-primary {
      background: linear-gradient(135deg, var(--primary), var(--accent));
      border-color: transparent;
      color: #fff;
      font-weight: 500;
    }
    .cdc-chip.cdc-chip-back { opacity: .7; font-size: 12px; }

    .cdc-typing { display: flex; gap: 4px; padding: 4px 2px; }
    .cdc-typing span {
      width: 6px; height: 6px; border-radius: 50%;
      background: #9ca3af; animation: cdc-typing-bounce 1.2s infinite ease-in-out;
    }
    .cdc-typing span:nth-child(2) { animation-delay: .15s; }
    .cdc-typing span:nth-child(3) { animation-delay: .3s; }
    @keyframes cdc-typing-bounce { 0%,60%,100% { transform: translateY(0); opacity: .5; } 30% { transform: translateY(-4px); opacity: 1; } }

    /* ---------- Input area ---------- */
    .cdc-inputbar {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      padding: 12px;
      background: #12162a;
      border-top: 1px solid rgba(255,255,255,.08);
    }
    .cdc-input {
      flex: 1;
      resize: none;
      border: 1px solid rgba(255,255,255,.12);
      background: rgba(255,255,255,.05);
      color: #fff;
      border-radius: 12px;
      padding: 10px 12px;
      font-size: 14px;
      font-family: inherit;
      max-height: 90px;
      outline: none;
      transition: border-color .15s ease;
      /* auto-resize (via JS) keeps content visible without ever needing to
         scroll in normal use — the scrollbar/spin-arrows some browsers draw
         on a textarea by default are just visual noise here, so hide them
         while keeping the textarea scrollable if content ever exceeds the
         max height. */
      overflow-y: auto;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    .cdc-input::-webkit-scrollbar { display: none; width: 0; height: 0; }
    .cdc-input:focus { border-color: var(--accent); }
    .cdc-input::placeholder { color: rgba(255,255,255,.4); }
    .cdc-input:disabled { opacity: .5; cursor: not-allowed; }

    .cdc-icon-btn {
      width: 40px; height: 40px; border-radius: 12px; border: none;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: transform .15s ease, background .15s ease;
    }
    .cdc-icon-btn svg { width: 18px; height: 18px; }
    .cdc-send { background: linear-gradient(135deg, var(--primary), var(--accent)); color: #fff; }
    .cdc-send:hover { transform: scale(1.06); }
    .cdc-send:disabled { opacity: .4; cursor: not-allowed; transform: none; }

    .cdc-mic { background: rgba(255,255,255,.08); color: #e7e9f5; position: relative; }
    .cdc-mic:hover { background: rgba(255,255,255,.16); }
    .cdc-mic.cdc-listening { background: #ef4444; color: #fff; }
    .cdc-mic.cdc-listening::before {
      content: ""; position: absolute; inset: -4px; border-radius: 14px;
      border: 2px solid #ef4444; animation: cdc-pulse-ring 1.3s ease-out infinite;
    }
    .cdc-mic:disabled { opacity: .3; cursor: not-allowed; }

    .cdc-footer-note {
      text-align: center; font-size: 10.5px; color: rgba(255,255,255,.35);
      padding: 6px 0 2px;
    }

    @media (max-width: 480px) {
      .cdc-root { bottom: 16px; right: 16px; }
      .cdc-panel { width: calc(100vw - 24px); height: calc(100vh - 120px); bottom: 76px; right: -8px; }
    }
  `;
  root.appendChild(style);

  const ICONS = {
    chat: `<svg viewBox="0 0 24 24" fill="none" class="cdc-icon-chat"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`,
    close: `<svg viewBox="0 0 24 24" fill="none" class="cdc-icon-close"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`,
    bot: `<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="8" width="16" height="12" rx="3" stroke="currentColor" stroke-width="2"/><path d="M12 8V4m-4 0h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="9" cy="14" r="1.3" fill="currentColor"/><circle cx="15" cy="14" r="1.3" fill="currentColor"/></svg>`,
    send: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 12 20 4l-6 16-3-7-7-1Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`,
    mic: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" stroke="currentColor" stroke-width="2"/><path d="M19 11a7 7 0 0 1-14 0M12 19v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    speaker: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 9v6h4l5 4V5L8 9H4Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M17.5 8.5a5 5 0 0 1 0 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    restart: `<svg viewBox="0 0 24 24" fill="none"><path d="M20 11A8 8 0 1 0 18.5 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M20 5v6h-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    menu: `<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2"/><rect x="13" y="4" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2"/><rect x="4" y="13" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2"/><rect x="13" y="13" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2"/></svg>`,
  };

  // Guided navigation menu — each leaf is either a known page `url` (looked
  // up exactly via /api/topic, no ambiguity) or a `query` for the one case
  // that's a section of a multi-topic page (the homepage) rather than a
  // page of its own, where search already resolves it reliably.
  const BASE = "https://cyberdudenetworks.com";
  const MENU_TREE = [
    {
      label: "Services & Solutions",
      children: [
        { label: "IoT & Edge Computing", url: `${BASE}/solutions/iot-edge` },
        { label: "AI-Native SaaS Platforms", url: `${BASE}/solutions/saas-ai` },
        { label: "Autonomous ERP Systems", url: `${BASE}/solutions/autonomous-erp` },
        { label: "Legacy Software Modernization", url: `${BASE}/solutions/ai-modernization` },
        { label: "Data Security & Governance", url: `${BASE}/solutions/data-governance` },
      ],
    },
    {
      label: "Engineering Expertise",
      children: [
        { label: "High-Performance Web", url: `${BASE}/engineering/high-performance-web` },
        { label: "Mobile Ecosystems", url: `${BASE}/engineering/mobile-ecosystems` },
        { label: "Product Design", url: `${BASE}/engineering/product-design` },
        { label: "AI & Data Pipelines", url: `${BASE}/engineering/ai-data-pipelines` },
        { label: "DevOps & Cloud Scale", url: `${BASE}/engineering/devops-cloud-scale` },
      ],
    },
    {
      label: "Our Work",
      children: [
        { label: "Technical Case Studies", url: `${BASE}/insights/technical-case-studies` },
        { label: "Industries We Serve", url: `${BASE}/work/industry` },
        { label: "Open Source Projects", url: `${BASE}/work/open-source-ip` },
      ],
    },
    {
      label: "Company",
      children: [
        { label: "About Us", url: `${BASE}/about` },
        { label: "How We Work", url: `${BASE}/about/how-we-work` },
        { label: "Awards & Partners", url: `${BASE}/about/awards-and-partners` },
      ],
    },
    {
      label: "Careers & Academy",
      children: [
        { label: "Open Roles", url: `${BASE}/careers` },
        { label: "Internships", url: `${BASE}/internships` },
        { label: "CyberDude Academy", url: `${BASE}/academy` },
      ],
    },
    { label: "Engagement Models", query: "What engagement models do you offer for new projects?" },
    { label: "Contact Us", url: `${BASE}/contact` },
  ];

  root.innerHTML += `
    <div class="cdc-root" id="cdc-root">
      <div class="cdc-panel" role="dialog" aria-label="${CFG.name}">
        <div class="cdc-header">
          <div class="cdc-avatar">${ICONS.bot}</div>
          <div class="cdc-header-text">
            <div class="cdc-header-name">${CFG.name}</div>
            <div class="cdc-header-status">Online</div>
          </div>
          <button class="cdc-header-btn" id="cdc-menu-btn" title="Browse topics" aria-label="Browse topics">${ICONS.menu}</button>
          <button class="cdc-header-btn" id="cdc-reset" title="Restart conversation" aria-label="Restart conversation">${ICONS.restart}</button>
        </div>
        <div class="cdc-messages" id="cdc-messages"></div>
        <div class="cdc-inputbar">
          <textarea class="cdc-input" id="cdc-input" rows="1" placeholder="Type your question..." aria-label="Message"></textarea>
          <button class="cdc-icon-btn cdc-mic" id="cdc-mic" title="${supportsSTT ? "Voice search" : "Voice not supported in this browser"}" ${supportsSTT ? "" : "disabled"}>${ICONS.mic}</button>
          <button class="cdc-icon-btn cdc-send" id="cdc-send" title="Send" disabled>${ICONS.send}</button>
        </div>
        <div class="cdc-footer-note" id="cdc-footer-note">Answers are based on our website content</div>
      </div>
      <button class="cdc-launch" id="cdc-launch" aria-label="Open chat">
        ${ICONS.chat}${ICONS.close}
        <span class="cdc-badge"></span>
      </button>
    </div>
  `;

  const el = {
    rootDiv: root.getElementById("cdc-root"),
    launch: root.getElementById("cdc-launch"),
    messages: root.getElementById("cdc-messages"),
    input: root.getElementById("cdc-input"),
    send: root.getElementById("cdc-send"),
    mic: root.getElementById("cdc-mic"),
    reset: root.getElementById("cdc-reset"),
    menuBtn: root.getElementById("cdc-menu-btn"),
    footerNote: root.getElementById("cdc-footer-note"),
  };

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  let history = [];
  let isListening = false;
  let isLocked = false;
  let audioCtx = null;

  try {
    const saved = JSON.parse(sessionStorage.getItem("cdc_history") || "[]");
    if (Array.isArray(saved)) history = saved.slice(-20);
  } catch {
    history = [];
  }

  function persistHistory() {
    try {
      sessionStorage.setItem("cdc_history", JSON.stringify(history.slice(-20)));
    } catch {
      /* storage unavailable — non-fatal */
    }
  }

  // ---------------------------------------------------------------------
  // Minimal markdown-ish renderer (escapes HTML first, then adds back a
  // small safe subset: bold, links, bullet lists, paragraphs).
  // ---------------------------------------------------------------------
  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function renderRichText(raw) {
    const escaped = escapeHtml(raw);
    const lines = escaped.split("\n");
    let html = "";
    let inList = false;

    const inline = (text) =>
      text
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\[(.+?)\]\(((?:https?:|tel:|mailto:)[^\s)]+)\)/g, (_, label, href) => {
          const external = /^https?:/.test(href);
          return `<a href="${href}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${label}</a>`;
        })
        .replace(/(^|[\s])((https?:\/\/)[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');

    for (const line of lines) {
      const trimmed = line.trim();
      if (/^[-*]\s+/.test(trimmed)) {
        if (!inList) { html += "<ul>"; inList = true; }
        html += `<li>${inline(trimmed.replace(/^[-*]\s+/, ""))}</li>`;
      } else {
        if (inList) { html += "</ul>"; inList = false; }
        if (trimmed) html += `<p>${inline(trimmed)}</p>`;
      }
    }
    if (inList) html += "</ul>";
    return html || "<p></p>";
  }

  function plainTextForSpeech(raw) {
    return raw
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\[(.+?)\]\(((?:https?:|tel:|mailto:)[^\s)]+)\)/g, "$1")
      .replace(/https?:\/\/\S+/g, "this link")
      .replace(/^[-*]\s+/gm, "")
      .trim();
  }

  // ---------------------------------------------------------------------
  // Messages UI
  // ---------------------------------------------------------------------
  function scrollToBottom() {
    el.messages.scrollTop = el.messages.scrollHeight;
  }

  function appendMessage(role, text) {
    const row = document.createElement("div");
    row.className = `cdc-row cdc-${role}`;

    if (role === "bot") {
      const avatar = document.createElement("div");
      avatar.className = "cdc-mini-avatar";
      avatar.innerHTML = ICONS.bot;
      row.appendChild(avatar);
    }

    const bubble = document.createElement("div");
    bubble.className = "cdc-bubble";
    bubble.innerHTML = renderRichText(text);
    row.appendChild(bubble);

    if (role === "bot" && supportsTTS) {
      const speakBtn = document.createElement("button");
      speakBtn.className = "cdc-speak-btn";
      speakBtn.title = "Read aloud";
      speakBtn.innerHTML = ICONS.speaker;
      speakBtn.addEventListener("click", () => speak(text));
      row.appendChild(speakBtn);
    }

    el.messages.appendChild(row);
    scrollToBottom();
    return row;
  }

  function showTyping() {
    const row = document.createElement("div");
    row.className = "cdc-row cdc-bot";
    row.id = "cdc-typing-row";
    row.innerHTML = `
      <div class="cdc-mini-avatar">${ICONS.bot}</div>
      <div class="cdc-bubble"><div class="cdc-typing"><span></span><span></span><span></span></div></div>
    `;
    el.messages.appendChild(row);
    scrollToBottom();
  }

  function hideTyping() {
    const row = root.getElementById("cdc-typing-row");
    if (row) row.remove();
  }

  // ---------------------------------------------------------------------
  // Guided menu (chip buttons) — lets a visitor browse topics instead of
  // typing, and guarantees an accurate answer for anything on the menu
  // since leaves resolve via a direct page lookup rather than search.
  // ---------------------------------------------------------------------
  function appendMenu(items, { back } = {}) {
    if (isLocked) return;
    const row = document.createElement("div");
    row.className = "cdc-menu-row";

    if (back) {
      const backChip = document.createElement("button");
      backChip.className = "cdc-chip cdc-chip-back";
      backChip.textContent = "← Main menu";
      backChip.addEventListener("click", () => {
        row.remove();
        appendMenu(MENU_TREE);
        scrollToBottom();
      });
      row.appendChild(backChip);
    }

    items.forEach((item) => {
      const chip = document.createElement("button");
      chip.className = back ? "cdc-chip" : "cdc-chip cdc-chip-primary";
      chip.textContent = item.label;
      chip.addEventListener("click", () => {
        row.remove();
        if (item.children) {
          appendMenu(item.children, { back: true });
        } else if (item.url) {
          fetchTopic(item.label, item.url);
        } else if (item.query) {
          sendMessage(item.query);
        }
        scrollToBottom();
      });
      row.appendChild(chip);
    });

    el.messages.appendChild(row);
    scrollToBottom();
  }

  // ---------------------------------------------------------------------
  // Speech synthesis (spoken replies)
  // ---------------------------------------------------------------------
  function speak(text) {
    if (!supportsTTS) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(plainTextForSpeech(text));
      utter.rate = 1;
      utter.pitch = 1;
      window.speechSynthesis.speak(utter);
    } catch {
      /* TTS not available right now — fail silently, text is still shown */
    }
  }

  // ---------------------------------------------------------------------
  // Mic on/off sound cues (generated tones, no audio files needed)
  // ---------------------------------------------------------------------
  function getAudioCtx() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    return audioCtx;
  }

  function playTone(freqFrom, freqTo, duration) {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freqFrom, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(freqTo, ctx.currentTime + duration);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  }

  const playMicOn = () => playTone(520, 880, 0.14);
  const playMicOff = () => playTone(780, 420, 0.14);

  // ---------------------------------------------------------------------
  // Speech recognition (voice search / mic input)
  // ---------------------------------------------------------------------
  let recognizer = null;
  if (supportsSTT) {
    recognizer = new SpeechRecognitionAPI();
    recognizer.lang = navigator.language || "en-US";
    recognizer.interimResults = true;
    recognizer.maxAlternatives = 1;

    recognizer.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      el.input.value = transcript;
      autoResizeInput();
      const lastResult = event.results[event.results.length - 1];
      if (lastResult.isFinal) {
        stopListening();
        if (transcript.trim()) sendMessage(transcript.trim());
      }
    };
    recognizer.onerror = () => stopListening();
    recognizer.onend = () => {
      if (isListening) stopListening();
    };
  }

  function startListening() {
    if (!supportsSTT || isListening) return;
    isListening = true;
    el.mic.classList.add("cdc-listening");
    playMicOn();
    try {
      recognizer.start();
    } catch {
      stopListening();
    }
  }

  function stopListening() {
    if (!isListening) return;
    isListening = false;
    el.mic.classList.remove("cdc-listening");
    playMicOff();
    try {
      recognizer.stop();
    } catch {
      /* already stopped */
    }
  }

  // ---------------------------------------------------------------------
  // Locking the chat after repeated guardrail violations (server is the
  // source of truth; this just reflects that state in the UI).
  // ---------------------------------------------------------------------
  function lockChat() {
    isLocked = true;
    el.input.disabled = true;
    el.input.placeholder = "This conversation has been paused.";
    el.send.disabled = true;
    el.mic.disabled = true;
    el.menuBtn.disabled = true;
    el.footerNote.textContent = "Chat paused — see the message above for details.";
    if (isListening) stopListening();
  }

  // ---------------------------------------------------------------------
  // Sending messages
  // ---------------------------------------------------------------------
  async function handleBotResponse(res, data) {
    hideTyping();

    if (data.reply) {
      appendMessage("bot", data.reply);
      history.push({ role: "assistant", content: data.reply });
      persistHistory();
    } else if (!res.ok) {
      appendMessage("bot", data.error || "Something went wrong. Please try again.");
    }

    if (data.locked) lockChat();
  }

  async function sendMessage(text) {
    if (!text.trim() || isLocked) return;
    el.input.value = "";
    autoResizeInput();
    updateSendState();

    appendMessage("user", text);
    history.push({ role: "user", content: text });
    persistHistory();

    showTyping();
    el.send.disabled = true;

    try {
      const res = await fetch(CFG.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: history.slice(0, -1) }),
      });
      const data = await res.json().catch(() => ({}));
      await handleBotResponse(res, data);
    } catch {
      hideTyping();
      appendMessage(
        "bot",
        "I couldn't reach the server just now. Please check your connection and try again."
      );
    } finally {
      updateSendState();
    }
  }

  // Guided-menu leaf click: shows the topic as a user bubble (consistent
  // with typing a question), then resolves via the deterministic lookup.
  async function fetchTopic(label, url) {
    if (isLocked) return;
    appendMessage("user", label);
    history.push({ role: "user", content: label });
    persistHistory();
    showTyping();

    try {
      const res = await fetch(CFG.topicApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      await handleBotResponse(res, data);
    } catch {
      hideTyping();
      appendMessage(
        "bot",
        "I couldn't reach the server just now. Please check your connection and try again."
      );
    }
  }

  // ---------------------------------------------------------------------
  // Input handling
  // ---------------------------------------------------------------------
  function autoResizeInput() {
    el.input.style.height = "auto";
    el.input.style.height = Math.min(el.input.scrollHeight, 90) + "px";
  }

  function updateSendState() {
    el.send.disabled = !el.input.value.trim();
  }

  el.input.addEventListener("input", () => {
    autoResizeInput();
    updateSendState();
  });

  el.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (el.input.value.trim()) sendMessage(el.input.value.trim());
    }
  });

  el.send.addEventListener("click", () => {
    if (el.input.value.trim()) sendMessage(el.input.value.trim());
  });

  el.mic.addEventListener("click", () => {
    if (isListening) stopListening();
    else startListening();
  });

  el.reset.addEventListener("click", () => {
    history = [];
    persistHistory();
    el.messages.innerHTML = "";
    isLocked = false;
    el.input.disabled = false;
    el.input.placeholder = "Type your question...";
    el.mic.disabled = !supportsSTT;
    el.menuBtn.disabled = false;
    el.footerNote.textContent = "Answers are based on our website content";
    appendMessage("bot", CFG.greeting);
    appendMenu(MENU_TREE);
    if (supportsTTS) window.speechSynthesis.cancel();
  });

  el.menuBtn.addEventListener("click", () => appendMenu(MENU_TREE));

  el.launch.addEventListener("click", () => {
    const opening = !el.rootDiv.classList.contains("cdc-open");
    el.rootDiv.classList.toggle("cdc-open");
    if (opening) setTimeout(() => el.input.focus(), 260);
  });

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------
  if (history.length) {
    history.forEach((m) => appendMessage(m.role === "user" ? "user" : "bot", m.content));
  } else {
    appendMessage("bot", CFG.greeting);
    appendMenu(MENU_TREE);
  }
})();
