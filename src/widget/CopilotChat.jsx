/**
 * CopilotChat — enterprise React chat widget for gRouter Copilot.
 *
 * Talks ONLY to the host app's own runtime endpoint (`/api/copilot/chat`)
 * and its health endpoint (`/api/copilot/health`). No credentials live in
 * the widget — the license and provider credentials stay server-side.
 *
 * Enterprise UX (single file, zero-dependency beyond React):
 *   - 56px round launcher bubble with sparkle icon (SVG), hover/focus/active
 *     states, error/health badge, safe-area positioning, drag to move.
 *   - Panel header: avatar icon + title + live connection dot (from health)
 *     + settings gear + close. Open/close transition: scale + fade, 180ms.
 *   - Empty state: welcome message + 4 contextual suggestion chips
 *     (click = send immediately); `suggestions` prop overridable.
 *   - Messages: user (accent) vs assistant (surface) bubbles; safe simple
 *     markdown renderer (escape FIRST: bold, inline code, fenced code,
 *     blockquote, lists, read-only proposal cards).
 *   - Typing indicator (3 dots), error state with "Coba lagi" retry,
 *     smart auto-scroll + "Ke pesan terbaru" jump button.
 *   - Composer: auto-expanding textarea (1-4 rows), Enter=send,
 *     Shift+Enter=newline, icon send button (disabled when empty/busy).
 *   - First-run wizard (3 steps) inside the panel, gated by a fresh host
 *     health check + user acknowledgment; completion persisted in
 *     localStorage ('grouter-copilot-setup-done'); "Periksa ulang" recovery.
 *   - Settings popover: 3 health checks, dark/light theme toggle
 *     (localStorage 'grouter-copilot-theme', default dark), ID/EN language
 *     toggle (localStorage 'grouter-copilot-lang', default ID; every UI
 *     label exists in both languages), version text.
 *   - Responsive: panel min(360px, 100vw - 32px) x min(560px, 100vh - 96px);
 *     under 480px it becomes a full-width bottom sheet; AA contrast;
 *     prefers-reduced-motion respected; visible focus rings everywhere.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import grxDefault, { tokens as grxTokenSet } from './design-tokens.js';

/* ------------------------------------------------------------------ */
/* Storage helpers (localStorage may be disabled — never throw).       */
/* ------------------------------------------------------------------ */

function readStored(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function store(key, value) {
  try { window.localStorage.setItem(key, value); } catch { /* Storage may be disabled. */ }
}

/* ------------------------------------------------------------------ */
/* Health                                                              */
/* ------------------------------------------------------------------ */

function isReadyHealth(data, responseOk) {
  const checks = data?.checks;
  return responseOk && data?.status === 'ok' &&
    checks?.license === true && checks?.skills === true && checks?.provider === true;
}

/* ------------------------------------------------------------------ */
/* Safe markdown (escape first, then add only our own tags).           */
/* ------------------------------------------------------------------ */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Inline transforms on ALREADY-escaped text — never on raw input. */
function mdInline(s) {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

/** Read-only proposal card for ```proposal fenced blocks (no actions here:
 *  approval is managed by the host app via its own window callback). */
function proposalCard(inner, label) {
  const text = String(inner || '').trim();
  let body = null;
  try {
    const obj = JSON.parse(text);
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const rows = [
        ['leadId', obj.leadId],
        ['currentStatus', obj.currentStatus],
        ['newStatus', obj.newStatus],
        ['reason', obj.reason],
      ].filter(([, v]) => v !== undefined && v !== null && v !== '');
      if (rows.length) {
        body = rows
          .map(([k, v]) => `<div class="grc-proposal-row"><span class="grc-proposal-key">${escapeHtml(k)}</span><span class="grc-proposal-val">${escapeHtml(String(v))}</span></div>`)
          .join('');
      }
    }
  } catch { /* not JSON — render the raw block below. */ }
  if (body === null) body = `<pre class="grc-pre">${escapeHtml(text)}</pre>`;
  return `<div class="grc-proposal"><div class="grc-proposal-title">${escapeHtml(label)}</div>${body}</div>`;
}

function markdownToHtml(src, proposalLabel) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(mdInline).join('<br/>')}</p>`);
    para = [];
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^\s*```(.*)$/);
    if (fence) {
      flushPara();
      const tag = (fence[1] || '').trim();
      const bodyLines = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) { bodyLines.push(lines[i]); i += 1; }
      i += 1; // skip the closing fence
      const inlinePayload = tag.match(/^proposal\b(.*)$/s);
      if (inlinePayload) {
        const rest = (inlinePayload[1] || '').trim();
        const content = rest ? `${rest}\n${bodyLines.join('\n')}` : bodyLines.join('\n');
        out.push(proposalCard(content, proposalLabel));
      } else {
        out.push(`<pre class="grc-pre"><code>${escapeHtml(bodyLines.join('\n'))}</code></pre>`);
      }
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      flushPara();
      const q = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { q.push(lines[i].replace(/^\s*>\s?/, '')); i += 1; }
      out.push(`<blockquote>${q.map((l) => mdInline(escapeHtml(l))).join('<br/>')}</blockquote>`);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      flushPara();
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, '')); i += 1; }
      out.push(`<ul>${items.map((it) => `<li>${mdInline(escapeHtml(it))}</li>`).join('')}</ul>`);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      flushPara();
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+[.)]\s+/, '')); i += 1; }
      out.push(`<ol>${items.map((it) => `<li>${mdInline(escapeHtml(it))}</li>`).join('')}</ol>`);
      continue;
    }
    // GFM table: |a|b| header + |---|---| separator + body rows (escape-first).
    const isRowLn = (ln) => /^\s*\|.\|/.test(ln) && ln.trim().endsWith('|');
    if (isRowLn(line) && i + 1 < lines.length && /^\s*\|[\s:-]*\|[\s:|-]*$/.test(lines[i + 1])) {
      flushPara();
      const splitRow = (ln) => ln.trim().replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
      const head = splitRow(line);
      i += 2;
      const bodyRows = [];
      while (i < lines.length && isRowLn(lines[i])) { bodyRows.push(splitRow(lines[i])); i += 1; }
      out.push(
        `<div class="grc-table-wrap"><table><thead><tr>${head.map((h) => `<th>${mdInline(escapeHtml(h))}</th>`).join('')}</tr></thead><tbody>${bodyRows
          .map((row) => `<tr>${row.map((c) => `<td>${mdInline(escapeHtml(c))}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`,
      );
      continue;
    }
    if (!line.trim()) { flushPara(); i += 1; continue; }
    para.push(escapeHtml(line));
    i += 1;
  }
  flushPara();
  return out.join('');
}

/* ------------------------------------------------------------------ */
/* Icons (inline SVG, currentColor, decorative).                       */
/* ------------------------------------------------------------------ */

const SparkIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 2.6c.7 4.4 2.7 6.6 7.4 7.4-4.7.8-6.7 3-7.4 7.4-.7-4.4-2.7-6.6-7.4-7.4 4.7-.8 6.7-3 7.4-7.4Z" fill="currentColor" />
    <path d="M18.6 14.6c.35 2.1 1.25 3.1 3.35 3.45-2.1.35-3 1.35-3.35 3.45-.35-2.1-1.25-3.1-3.35-3.45 2.1-.35 3-1.35 3.35-3.45Z" fill="currentColor" opacity=".72" />
  </svg>
);

const GearIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.8v3M12 18.2v3M21.2 12h-3M5.8 12h-3M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1M18.5 18.5l-2.1-2.1M7.6 7.6 5.5 5.5" />
  </svg>
);

const XIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

const CheckIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m5 12.5 4.2 4.2L19 7" />
  </svg>
);

const RefreshIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4" />
  </svg>
);

const ArrowDownIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 5v13m0 0-5-5m5 5 5-5" />
  </svg>
);

const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M3.4 20.4 20.9 12 3.4 3.6l.01 6.53L15 12 3.41 13.87l-.01 6.53Z" fill="currentColor" />
  </svg>
);

/* ------------------------------------------------------------------ */
/* Theme tokens — imported from ./design-tokens.js (single source of   */
/* truth), with a complete inline fallback of the same shape so the    */
/* widget still renders modern dark-first styles if the module shape   */
/* ever drifts.                                                        */
/* ------------------------------------------------------------------ */

const FALLBACK_DARK = {
  color: {
    bg: { canvas: '#06080b', surface: '#11161d', sunken: '#0b0f14' },
    fg: { primary: '#e8eef5', secondary: '#93a1b1', muted: '#7c8b9b' },
    accent: {
      base: '#22d3ee', hover: '#67e8f9', active: '#0e7490',
      soft: 'rgba(34, 211, 238, 0.14)', onAccent: '#04141a', asText: '#22d3ee',
    },
    success: { base: '#34d399', soft: 'rgba(52, 211, 153, 0.14)', asText: '#34d399' },
    warn: { base: '#fbbf24', soft: 'rgba(251, 191, 36, 0.14)', asText: '#fbbf24' },
    danger: { base: '#f87171', soft: 'rgba(248, 113, 113, 0.16)', asText: '#f87171' },
    border: { subtle: '#1a212b', strong: '#33404f' },
  },
  typography: {
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    fontFamilyMono: "ui-monospace, 'SFMono-Regular', 'Fira Code', Menlo, Consolas, monospace",
  },
  radius: { sm: 8, md: 12, lg: 16, full: 999 },
  shadow: {
    panel: '0 4px 16px -2px rgba(0, 0, 0, 0.5)',
    overlay: '0 12px 40px -8px rgba(0, 0, 0, 0.65)',
  },
  focus: { ring: '0 0 0 2px rgba(6, 8, 11, 1), 0 0 0 4px rgba(34, 211, 238, 0.55)' },
};

const FALLBACK_LIGHT = {
  color: {
    bg: { canvas: '#f5f8fa', surface: '#ffffff', sunken: '#e7edf2' },
    fg: { primary: '#0f1720', secondary: '#46586c', muted: '#5b6b7c' },
    accent: {
      base: '#22d3ee', hover: '#0aa8c4', active: '#0e7490',
      soft: 'rgba(14, 116, 144, 0.12)', onAccent: '#04141a', asText: '#0e7490',
    },
    success: { base: '#0d7a4f', soft: 'rgba(13, 122, 79, 0.12)', asText: '#0d7a4f' },
    warn: { base: '#92510a', soft: 'rgba(146, 81, 10, 0.12)', asText: '#92510a' },
    danger: { base: '#c02b2b', soft: 'rgba(192, 43, 43, 0.12)', asText: '#c02b2b' },
    border: { subtle: '#eef2f6', strong: '#c6d2dc' },
  },
  typography: FALLBACK_DARK.typography,
  radius: FALLBACK_DARK.radius,
  shadow: {
    panel: '0 4px 16px -2px rgba(15, 23, 32, 0.12)',
    overlay: '0 12px 40px -8px rgba(15, 23, 32, 0.24)',
  },
  focus: { ring: '0 0 0 2px rgba(255, 255, 255, 1), 0 0 0 4px rgba(14, 116, 144, 0.55)' },
};

function resolveTheme(mode) {
  const fallback = mode === 'light' ? FALLBACK_LIGHT : FALLBACK_DARK;
  let grx = null;
  try {
    if (grxTokenSet && grxTokenSet[mode] && grxTokenSet[mode].color) grx = grxTokenSet[mode];
    else if (mode === 'dark' && grxDefault && grxDefault.color) grx = grxDefault;
  } catch { grx = null; }
  return grx ? { ...fallback, ...grx } : fallback;
}

/* ------------------------------------------------------------------ */
/* i18n — every UI label in ID (default) and EN.                       */
/* ------------------------------------------------------------------ */

const DEFAULT_PLACEHOLDER_ID = 'Tanyakan sesuatu tentang data Anda…';

const STR = {
  id: {
    dragHint: 'Geser untuk memindahkan',
    close: 'Tutup Copilot',
    settings: 'Pengaturan Copilot',
    connected: 'Terhubung',
    unavailable: 'Tidak tersedia',
    checking: 'Memeriksa…',
    welcome: 'Halo! Saya Copilot Anda.',
    welcomeSub: 'Tanyakan apa saja tentang data Anda — saya menjawab dari sumber yang diizinkan server Anda.',
    suggestions: [
      { label: 'Ringkas data saya', prompt: 'Ringkas data saya: berapa total customer, leads aktif, dan deals terbuka?' },
      { label: 'Status pipeline', prompt: 'Bagaimana status pipeline deals saat ini?' },
      { label: 'Draft follow-up', prompt: 'Buatkan draft follow-up untuk customer yang belum merespons' },
      { label: 'Cari customer', prompt: 'Cari customer berdasarkan nama, perusahaan, atau keluhan' },
    ],
    placeholder: DEFAULT_PLACEHOLDER_ID,
    send: 'Kirim pesan',
    typing: 'Copilot sedang mengetik…',
    retry: 'Coba lagi',
    errorGeneric: 'Terjadi kesalahan. Coba lagi.',
    jump: 'Ke pesan terbaru',
    partial: 'Jawaban sebagian — beberapa data mungkin tidak lengkap.',
    sources: 'Sumber',
    proposal: 'Proposal',
    setupAria: 'Penyiapan pertama',
    stepLabel: 'Langkah',
    setupTitle: 'Selamat datang di Copilot',
    setupIntro: 'Asisten AI untuk data aplikasi Anda. Tiga hal yang perlu Anda tahu:',
    benefits: [
      'Jawaban dari data Anda sendiri, lewat skills read-only yang Anda daftarkan.',
      'License dan kredensial provider tetap di server aplikasi, bukan di browser.',
      'Tanpa setup tambahan di sisi klien — langsung bisa dipakai tim.',
    ],
    next: 'Lanjut',
    back: 'Kembali',
    setupCheckTitle: 'Periksa kesiapan',
    setupCheckText: 'Copilot memeriksa kesiapan server aplikasi Anda secara langsung.',
    server: 'Server',
    licenseLabel: 'Lisensi',
    skillsLabel: 'Skills',
    providerLabel: 'Provider',
    checkReady: 'Siap',
    checkFail: 'Belum',
    recheck: 'Periksa ulang',
    setupDoneTitle: 'Anda siap!',
    setupDoneText: 'Semua sistem siap. Mulai tanya apa saja tentang data Anda.',
    agree: 'Saya paham bahwa license dan kredensial provider tersimpan di server aplikasi, bukan di browser.',
    startAsking: 'Mulai bertanya',
    healthLabel: 'Status server',
    themeLabel: 'Tema',
    dark: 'Gelap',
    light: 'Terang',
    langLabel: 'Bahasa',
  },
  en: {
    dragHint: 'Drag to move',
    close: 'Close Copilot',
    settings: 'Copilot settings',
    connected: 'Connected',
    unavailable: 'Unavailable',
    checking: 'Checking…',
    welcome: 'Hi! I am your Copilot.',
    welcomeSub: 'Ask anything about your data — I answer from sources your server allows.',
    suggestions: [
      { label: 'Summarize my data', prompt: 'Summarize my data: how many customers, active leads, and open deals are there?' },
      { label: 'Pipeline status', prompt: 'What is the current status of the deals pipeline?' },
      { label: 'Draft follow-up', prompt: 'Draft a follow-up for customers that have not responded' },
      { label: 'Find customer', prompt: 'Find a customer by name, company, or complaint' },
    ],
    placeholder: 'Ask something about your data…',
    send: 'Send message',
    typing: 'Copilot is typing…',
    retry: 'Try again',
    errorGeneric: 'Something went wrong. Try again.',
    jump: 'Jump to latest',
    partial: 'Partial answer — some data may be incomplete.',
    sources: 'Sources',
    proposal: 'Proposal',
    setupAria: 'First-time setup',
    stepLabel: 'Step',
    setupTitle: 'Welcome to Copilot',
    setupIntro: 'An AI assistant for your app data. Three things to know:',
    benefits: [
      'Answers come from your own data via the read-only skills you register.',
      'The license and provider credentials stay on the app server, not in the browser.',
      'No extra client-side setup — your team can use it right away.',
    ],
    next: 'Next',
    back: 'Back',
    setupCheckTitle: 'Check readiness',
    setupCheckText: 'Copilot verifies your app server readiness live.',
    server: 'Server',
    licenseLabel: 'License',
    skillsLabel: 'Skills',
    providerLabel: 'Provider',
    checkReady: 'Ready',
    checkFail: 'Failed',
    recheck: 'Recheck',
    setupDoneTitle: 'You are all set!',
    setupDoneText: 'All systems ready. Start asking anything about your data.',
    agree: 'I understand the license and provider credentials stay on the app server, not in the browser.',
    startAsking: 'Start asking',
    healthLabel: 'Server status',
    themeLabel: 'Theme',
    dark: 'Dark',
    light: 'Light',
    langLabel: 'Language',
  },
};

/* ------------------------------------------------------------------ */
/* Styles — one static stylesheet, themed via CSS custom properties    */
/* set on the root element (dark default, light switchable).           */
/* ------------------------------------------------------------------ */

const CSS = `
.grc-root{font-family:var(--grc-font);font-size:14px}
.grc-root,.grc-root *{box-sizing:border-box}
.grc-root button{font-family:inherit}
/* ---- launcher bubble (56px circle, sparkle icon) ---- */
.grc-bubble{position:fixed;width:56px;height:56px;border-radius:50%;border:0;padding:0;display:flex;align-items:center;justify-content:center;background:var(--grc-accent);color:var(--grc-on-accent);cursor:grab;touch-action:none;box-shadow:var(--grc-shadow-overlay);transition:transform 160ms ease,background 160ms ease,box-shadow 160ms ease}
.grc-bubble:hover{background:var(--grc-accent-hover);transform:scale(1.06);box-shadow:var(--grc-shadow-overlay),0 0 0 6px var(--grc-accent-soft)}
.grc-bubble:active{transform:scale(.95);background:var(--grc-accent-active);cursor:grabbing}
.grc-bubble:focus-visible{outline:none;box-shadow:var(--grc-ring)}
.grc-bubble svg{width:26px;height:26px;display:block;pointer-events:none}
.grc-badge{position:absolute;top:1px;right:1px;width:12px;height:12px;border-radius:50%;background:var(--grc-err);border:2px solid var(--grc-canvas)}
/* ---- panel ---- */
.grc-panel{position:fixed;display:flex;flex-direction:column;overflow:hidden;background:var(--grc-canvas);color:var(--grc-fg);border:1px solid var(--grc-border-strong);border-radius:var(--grc-radius-lg);box-shadow:var(--grc-shadow-overlay);transform-origin:100% 100%;animation:grc-in 180ms cubic-bezier(0.16,1,0.3,1)}
.grc-panel.grc-out{animation:grc-out 180ms ease forwards;pointer-events:none}
@keyframes grc-in{from{opacity:0;transform:scale(.92) translateY(10px)}to{opacity:1;transform:none}}
@keyframes grc-out{from{opacity:1}to{opacity:0;transform:scale(.94) translateY(8px)}}
/* ---- header ---- */
.grc-header{display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--grc-surface);border-bottom:1px solid var(--grc-border);cursor:move;touch-action:none;user-select:none;-webkit-user-select:none}
.grc-avatar{width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:var(--grc-accent-soft);color:var(--grc-accent-as-text);flex:0 0 auto}
.grc-headtext{display:flex;flex-direction:column;line-height:1.25;min-width:0}
.grc-title{font-size:14px;font-weight:600;letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.grc-subtitle{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--grc-muted);white-space:nowrap}
.grc-dot{width:8px;height:8px;border-radius:50%;background:var(--grc-border-strong);flex:0 0 auto}
.grc-dot.ok{background:var(--grc-ok);box-shadow:0 0 0 3px var(--grc-ok-soft)}
.grc-dot.err{background:var(--grc-err);box-shadow:0 0 0 3px var(--grc-err-soft)}
.grc-dot.warn{background:var(--grc-warn)}
.grc-spacer{flex:1}
.grc-iconbtn{width:30px;height:30px;border-radius:8px;border:0;background:transparent;color:var(--grc-fg2);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background 140ms ease,color 140ms ease;flex:0 0 auto}
.grc-iconbtn:hover{background:var(--grc-sunken);color:var(--grc-fg)}
.grc-iconbtn:active{transform:scale(.94)}
.grc-iconbtn.active{background:var(--grc-accent-soft);color:var(--grc-accent-as-text)}
.grc-iconbtn:focus-visible{outline:none;box-shadow:var(--grc-ring)}
/* ---- settings popover ---- */
.grc-settings{position:absolute;top:54px;right:10px;width:242px;background:var(--grc-surface);border:1px solid var(--grc-border-strong);border-radius:12px;box-shadow:var(--grc-shadow-overlay);padding:12px;z-index:5;display:flex;flex-direction:column;gap:10px;animation:grc-pop 140ms ease}
@keyframes grc-pop{from{opacity:0;transform:translateY(-4px) scale(.98)}}
.grc-setrow{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;color:var(--grc-fg2)}
.grc-hrow{display:flex;align-items:center;gap:8px;font-size:12px;padding:3px 0}
.grc-hic{width:18px;height:18px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex:0 0 auto}
.grc-hic.ok{background:var(--grc-ok-soft);color:var(--grc-ok)}
.grc-hic.bad{background:var(--grc-err-soft);color:var(--grc-err)}
.grc-hrow span:nth-child(2){flex:1;color:var(--grc-fg2)}
.grc-hstate{font-size:11px;font-weight:600}
.grc-seg{display:inline-flex;border:1px solid var(--grc-border-strong);border-radius:8px;overflow:hidden}
.grc-seg button{border:0;background:transparent;color:var(--grc-muted);font-size:11px;font-weight:600;padding:4px 10px;cursor:pointer;transition:background 140ms ease,color 140ms ease}
.grc-seg button:hover{color:var(--grc-fg)}
.grc-seg button.on{background:var(--grc-accent-soft);color:var(--grc-accent-as-text)}
.grc-seg button:focus-visible{outline:none;box-shadow:var(--grc-ring);position:relative;z-index:1}
.grc-vers{font-size:11px;color:var(--grc-muted);border-top:1px solid var(--grc-border);padding-top:8px}
/* ---- empty state + chips ---- */
.grc-empty{padding:24px 18px 10px;display:flex;flex-direction:column;gap:8px}
.grc-empty-ic{width:40px;height:40px;border-radius:12px;background:var(--grc-accent-soft);color:var(--grc-accent-as-text);display:flex;align-items:center;justify-content:center}
.grc-empty-title{margin:2px 0 0;font-size:16px;font-weight:700;color:var(--grc-fg)}
.grc-empty-sub{margin:0;color:var(--grc-fg2);font-size:13px;line-height:1.55}
.grc-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px}
.grc-chip{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:999px;border:1px solid var(--grc-border-strong);background:var(--grc-sunken);color:var(--grc-fg2);font-size:12px;font-weight:500;cursor:pointer;text-align:left;transition:border-color 140ms ease,background 140ms ease,color 140ms ease,transform 120ms ease}
.grc-chip:hover{border-color:var(--grc-accent);color:var(--grc-fg);background:var(--grc-accent-soft)}
.grc-chip:active{transform:scale(.98)}
.grc-chip:focus-visible{outline:none;box-shadow:var(--grc-ring)}
.grc-chip:disabled{opacity:.55;cursor:not-allowed}
/* ---- message log ---- */
.grc-logwrap{position:relative;flex:1;display:flex;min-height:0}
.grc-log{flex:1;overflow-y:auto;padding:14px 14px 10px;display:flex;flex-direction:column;gap:10px;min-height:0;scroll-behavior:smooth}
.grc-log::-webkit-scrollbar{width:8px}
.grc-log::-webkit-scrollbar-thumb{background:var(--grc-border-strong);border-radius:4px}
.grc-msg{max-width:86%;padding:9px 12px;font-size:13px;line-height:1.5;border-radius:12px;word-break:break-word}
.grc-msg.user{align-self:flex-end;background:var(--grc-accent);color:var(--grc-on-accent);border-bottom-right-radius:4px;white-space:pre-wrap}
.grc-msg.assistant{align-self:flex-start;background:var(--grc-surface);color:var(--grc-fg);border:1px solid var(--grc-border);border-bottom-left-radius:4px}
.grc-md p{margin:0 0 6px}
.grc-md p:last-child{margin-bottom:0}
.grc-md code{font-family:var(--grc-mono);font-size:12px;background:var(--grc-sunken);border:1px solid var(--grc-border);border-radius:5px;padding:1px 5px}
.grc-pre{font-family:var(--grc-mono);font-size:12px;background:var(--grc-sunken);border:1px solid var(--grc-border);border-radius:8px;padding:10px;overflow-x:auto;margin:6px 0}
.grc-pre code{background:transparent;border:0;padding:0}
.grc-table-wrap{overflow-x:auto;margin:6px 0;border:1px solid var(--grc-border);border-radius:8px}
.grc-table-wrap table{width:100%;border-collapse:collapse;font-size:12px}
.grc-table-wrap th{text-align:left;font-weight:600;color:var(--grc-muted);padding:6px 10px;background:var(--grc-sunken);white-space:nowrap}
.grc-table-wrap td{padding:6px 10px;border-top:1px solid var(--grc-border)}
.grc-table-wrap tbody tr:first-child td{border-top:0}
.grc-md blockquote{margin:6px 0;padding:4px 10px;border-left:3px solid var(--grc-accent);color:var(--grc-fg2);background:var(--grc-accent-soft);border-radius:0 6px 6px 0}
.grc-md ul,.grc-md ol{margin:6px 0;padding-left:20px}
.grc-md li{margin:2px 0}
.grc-sources{margin-top:6px;font-size:11px;color:var(--grc-muted)}
.grc-partial{margin-top:6px;font-size:11px;color:var(--grc-warn)}
.grc-proposal{margin:6px 0 0;border:1px solid var(--grc-accent-active);border-left:3px solid var(--grc-accent);background:var(--grc-sunken);border-radius:8px;padding:8px 10px}
.grc-proposal-title{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--grc-accent-as-text);margin-bottom:4px}
.grc-proposal-row{display:flex;gap:8px;font-size:12px;padding:2px 0}
.grc-proposal-key{color:var(--grc-muted);min-width:88px;font-family:var(--grc-mono);flex:0 0 auto}
.grc-proposal-val{color:var(--grc-fg);word-break:break-word}
/* ---- typing indicator ---- */
.grc-typing{align-self:flex-start;background:var(--grc-surface);border:1px solid var(--grc-border);border-radius:12px;border-bottom-left-radius:4px;padding:11px 12px;display:inline-flex;gap:4px}
.grc-typing i{width:6px;height:6px;border-radius:50%;background:var(--grc-muted);animation:grc-blink 1.2s infinite ease-in-out}
.grc-typing i:nth-child(2){animation-delay:.15s}
.grc-typing i:nth-child(3){animation-delay:.3s}
@keyframes grc-blink{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}
/* ---- error + retry ---- */
.grc-error{align-self:stretch;display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;background:var(--grc-err-soft);border:1px solid var(--grc-err);color:var(--grc-err-as-text);font-size:12px}
.grc-error-text{flex:1;word-break:break-word}
.grc-retry{flex:0 0 auto;border:1px solid var(--grc-err);background:transparent;color:var(--grc-err-as-text);font-size:12px;font-weight:600;padding:4px 10px;border-radius:8px;cursor:pointer;transition:background 140ms ease}
.grc-retry:hover{background:var(--grc-err-soft)}
.grc-retry:focus-visible{outline:none;box-shadow:var(--grc-ring)}
.grc-retry:disabled{opacity:.6;cursor:not-allowed}
/* ---- jump to latest ---- */
.grc-jump{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);display:inline-flex;align-items:center;gap:6px;border:1px solid var(--grc-border-strong);background:var(--grc-surface);color:var(--grc-fg);font-size:12px;font-weight:500;padding:6px 12px;border-radius:999px;box-shadow:var(--grc-shadow-panel);cursor:pointer;z-index:2;transition:border-color 140ms ease,color 140ms ease}
.grc-jump:hover{border-color:var(--grc-accent);color:var(--grc-accent-as-text)}
.grc-jump:focus-visible{outline:none;box-shadow:var(--grc-ring)}
/* ---- composer ---- */
.grc-composer{flex:0 0 auto;display:flex;align-items:flex-end;gap:8px;padding:10px;border-top:1px solid var(--grc-border);background:var(--grc-surface)}
.grc-textarea{flex:1;resize:none;border:1px solid var(--grc-border-strong);background:var(--grc-sunken);color:var(--grc-fg);font-family:inherit;font-size:13px;line-height:20px;padding:9px 12px;border-radius:10px;max-height:100px;min-height:38px;overflow-y:hidden}
.grc-textarea:focus-visible{outline:none;border-color:var(--grc-accent);box-shadow:var(--grc-ring)}
.grc-textarea::placeholder{color:var(--grc-muted)}
.grc-textarea:disabled{opacity:.6}
.grc-send{flex:0 0 auto;width:38px;height:38px;border-radius:10px;border:0;background:var(--grc-accent);color:var(--grc-on-accent);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background 140ms ease,transform 120ms ease,opacity 140ms ease}
.grc-send:hover:not(:disabled){background:var(--grc-accent-hover)}
.grc-send:active:not(:disabled){transform:scale(.94);background:var(--grc-accent-active)}
.grc-send:disabled{opacity:.45;cursor:not-allowed}
.grc-send:focus-visible{outline:none;box-shadow:var(--grc-ring)}
/* ---- first-run wizard ---- */
.grc-setup{flex:1;overflow-y:auto;padding:18px 16px;display:flex;flex-direction:column;gap:12px}
.grc-steps{display:flex;gap:4px}
.grc-steps i{width:18px;height:4px;border-radius:2px;background:var(--grc-border-strong);transition:background 160ms ease}
.grc-steps i.on{background:var(--grc-accent)}
.grc-setup-count{font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--grc-muted)}
.grc-step-title{margin:0;font-size:16px;font-weight:700;color:var(--grc-fg)}
.grc-step-text{margin:0;font-size:13px;color:var(--grc-fg2);line-height:1.55}
.grc-benefits{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.grc-benefits li{display:flex;gap:8px;align-items:flex-start;font-size:13px;color:var(--grc-fg2);line-height:1.5}
.grc-benefits svg{flex:0 0 auto;margin-top:3px;color:var(--grc-ok)}
.grc-checks{display:flex;flex-direction:column;gap:8px}
.grc-check{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--grc-border);border-radius:10px;background:var(--grc-surface);font-size:13px}
.grc-check-ic{width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.grc-check.ok .grc-check-ic{background:var(--grc-ok-soft);color:var(--grc-ok)}
.grc-check.bad .grc-check-ic{background:var(--grc-err-soft);color:var(--grc-err)}
.grc-check.wait .grc-check-ic{background:var(--grc-sunken);color:var(--grc-muted)}
.grc-check-state{margin-left:auto;font-size:11px;font-weight:600;color:var(--grc-muted);flex:0 0 auto}
.grc-spin{width:12px;height:12px;border:2px solid var(--grc-border-strong);border-top-color:var(--grc-accent);border-radius:50%;animation:grc-rot 900ms linear infinite;display:block}
@keyframes grc-rot{to{transform:rotate(360deg)}}
.grc-agree{display:flex;gap:8px;align-items:flex-start;font-size:12px;color:var(--grc-fg2);line-height:1.5;cursor:pointer}
.grc-agree input{accent-color:var(--grc-accent);width:15px;height:15px;margin:2px 0 0;flex:0 0 auto}
.grc-agree input:focus-visible{outline:2px solid var(--grc-accent);outline-offset:2px}
.grc-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;font-size:13px;font-weight:600;border-radius:10px;padding:9px 16px;cursor:pointer;transition:background 140ms ease,color 140ms ease,border-color 140ms ease,transform 120ms ease;align-self:flex-start}
.grc-btn:active{transform:scale(.98)}
.grc-btn:focus-visible{outline:none;box-shadow:var(--grc-ring)}
.grc-btn.primary{border:0;background:var(--grc-accent);color:var(--grc-on-accent)}
.grc-btn.primary:hover:not(:disabled){background:var(--grc-accent-hover)}
.grc-btn.primary:disabled{opacity:.5;cursor:not-allowed}
.grc-btn.ghost{background:transparent;border:1px solid var(--grc-border-strong);color:var(--grc-fg2)}
.grc-btn.ghost:hover:not(:disabled){background:var(--grc-sunken);color:var(--grc-fg)}
.grc-btn.ghost:disabled{opacity:.6;cursor:not-allowed}
/* ---- responsive: bottom sheet under 480px, safe-area aware ---- */
@media (max-width:479px){
  .grc-panel{left:0!important;right:0!important;top:auto!important;bottom:0!important;width:100%!important;border-radius:16px 16px 0 0;border-left:0;border-right:0;border-bottom:0;transform-origin:50% 100%}
  .grc-bubble{left:auto!important;right:calc(16px + env(safe-area-inset-right,0px))!important;top:auto!important;bottom:calc(16px + env(safe-area-inset-bottom,0px))!important}
  .grc-composer{padding-bottom:calc(10px + env(safe-area-inset-bottom,0px))}
}
@media (prefers-reduced-motion:reduce){
  .grc-panel,.grc-panel.grc-out,.grc-settings{animation:none!important}
  .grc-typing i{animation:none!important;opacity:.6}
  .grc-log{scroll-behavior:auto}
  .grc-bubble,.grc-btn,.grc-chip,.grc-send{transition:none}
}
`;

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

const DEFAULT_VIEWPORT = { innerWidth: 360, innerHeight: 640 };
const BUBBLE_SIZE = 56;
const COMPOSER_MAX_HEIGHT = 100; // 4 lines x 20px + padding/border

export function CopilotChat({
  endpoint = '/api/copilot/chat',
  userId,
  token,
  placeholder = DEFAULT_PLACEHOLDER_ID,
  title = 'Copilot',
  welcomeMessage = '',
  firstUseSetup = false,
  healthEndpoint = '/api/copilot/health',
  theme = {},
  suggestions = null,
  version = '0.1.0',
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  // Stored completion is trusted only after a fresh host-health check.
  const [setupDone, setSetupDone] = useState(!firstUseSetup);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupStep, setSetupStep] = useState(1);
  const [health, setHealth] = useState(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const healthCheckRef = useRef(false);
  const [bubblePos, setBubblePos] = useState(null);
  const [panelPos, setPanelPos] = useState(null);
  const dragRef = useRef(null);
  const [mode, setMode] = useState(() => (readStored('grouter-copilot-theme') === 'light' ? 'light' : 'dark'));
  const [lang, setLang] = useState(() => (readStored('grouter-copilot-lang') === 'en' ? 'en' : 'id'));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [, setViewportTick] = useState(0);
  const logRef = useRef(null);
  const nearBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const lastPromptRef = useRef('');
  const inputRef = useRef(null);
  const setupRef = useRef(null);
  const bubbleRef = useRef(null);
  const wasOpenRef = useRef(false);

  const t = STR[lang] || STR.id;
  const viewport = typeof window === 'undefined' ? DEFAULT_VIEWPORT : window;

  /* Geometry (contract-anchored math, always clamped to a safe area). */
  const panelW = Math.min(360, viewport.innerWidth - 32);
  const panelH = Math.min(560, viewport.innerHeight - 96);
  const bubbleDefault = {
    x: Math.max(8, viewport.innerWidth - 58 - 24),
    y: Math.max(8, viewport.innerHeight - 58 - 24),
  };
  const panelDefault = {
    x: Math.max(8, viewport.innerWidth - panelW - 8),
    y: Math.max(8, viewport.innerHeight - panelH - 8),
  };
  const bubbleX = Math.min(Math.max(8, (bubblePos || bubbleDefault).x), Math.max(8, viewport.innerWidth - BUBBLE_SIZE - 8));
  const bubbleY = Math.min(Math.max(8, (bubblePos || bubbleDefault).y), Math.max(8, viewport.innerHeight - BUBBLE_SIZE - 8));
  const panelX = Math.min(Math.max(8, (panelPos || panelDefault).x), Math.max(8, viewport.innerWidth - panelW - 8));
  const panelY = Math.min(Math.max(8, (panelPos || panelDefault).y), Math.max(8, viewport.innerHeight - panelH - 8));

  const ph = placeholder && placeholder !== DEFAULT_PLACEHOLDER_ID ? placeholder : (lang === 'en' ? t.placeholder : DEFAULT_PLACEHOLDER_ID);
  const chips = (Array.isArray(suggestions) && suggestions.length ? suggestions : t.suggestions)
    .map((s) => (typeof s === 'string' ? { label: s, prompt: s } : s));

  const healthReady = isReadyHealth(health, true);
  const dotClass = healthReady ? 'ok' : (health ? 'err' : (checkingHealth ? 'warn' : ''));
  const dotText = healthReady ? t.connected : (health ? t.unavailable : t.checking);

  /* ---------------- effects ---------------- */

  // Keep clamps fresh on resize (debounced tick also re-renders
  // dependents like the jump button's floating position).
  useEffect(() => {
    let timer = 0;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setViewportTick((n) => n + 1), 120);
    };
    window.addEventListener('resize', onResize);
    return () => { window.clearTimeout(timer); window.removeEventListener('resize', onResize); };
  }, []);

  // First-use setup: fetch host health once and only trust a stored
  // completion after a complete, fresh response.
  useEffect(() => {
    if (!firstUseSetup || setupDone) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(healthEndpoint);
        const data = await res.json();
        if (cancelled) return;
        const ready = isReadyHealth(data, res.ok);
        setHealth(ready ? data : { status: 'unavailable', checks: data?.checks });
        if (ready) {
          try { if (window.localStorage.getItem('grouter-copilot-setup-done') === 'true') setSetupDone(true); } catch { /* Storage may be disabled. */ }
        }
      } catch { if (!cancelled) setHealth({ status: 'unavailable' }); }
    })();
    return () => { cancelled = true; };
  }, [firstUseSetup, setupDone, healthEndpoint]);

  // Connection dot: refresh health whenever the panel opens without one.
  const checkHealth = useCallback(async () => {
    if (healthCheckRef.current) return;
    healthCheckRef.current = true;
    setCheckingHealth(true);
    try {
      const res = await fetch(healthEndpoint, { cache: 'no-store' });
      const data = await res.json();
      if (!isReadyHealth(data, res.ok)) { setHealth({ status: 'unavailable', checks: data?.checks }); return; }
      setHealth(data);
    } catch { setHealth({ status: 'unavailable' }); }
    finally { healthCheckRef.current = false; setCheckingHealth(false); }
  }, [healthEndpoint]);

  useEffect(() => {
    if (open && !health && !healthCheckRef.current) checkHealth();
  }, [open, health, checkHealth]);

  // Drag handling for bubble and panel header.
  useEffect(() => {
    if (!open) return undefined;
    const onMove = (event) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (drag.mode === 'bubble') {
        setBubblePos({
          x: Math.min(Math.max(8, drag.left + dx), Math.max(8, window.innerWidth - BUBBLE_SIZE - 8)),
          y: Math.min(Math.max(8, drag.top + dy), Math.max(8, window.innerHeight - BUBBLE_SIZE - 8)),
        });
      } else {
        const width = Math.min(360, window.innerWidth - 32);
        const height = Math.min(560, window.innerHeight - 96);
        setPanelPos({
          x: Math.min(Math.max(8, drag.left + dx), Math.max(8, window.innerWidth - width - 8)),
          y: Math.min(Math.max(8, drag.top + dy), Math.max(8, window.innerHeight - height - 8)),
        });
      }
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [open]);

  const startDrag = (event) => {
    if (event.target.closest('button')) return;
    const dragMode = event.currentTarget.getAttribute('data-grc-drag') === 'panel' ? 'panel' : 'bubble';
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, mode: dragMode };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const closePanel = useCallback(() => {
    setSettingsOpen(false);
    setClosing(true);
    window.setTimeout(() => { setClosing(false); setOpen(false); }, 185);
  }, []);

  // Escape closes the settings popover first, then the panel.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      if (settingsOpen) { setSettingsOpen(false); return; }
      if (!setupOpen) closePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, settingsOpen, setupOpen, closePanel]);

  // Focus management: into the panel on open, back to the bubble on close.
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      wasOpenRef.current = true;
      const id = window.setTimeout(() => { (inputRef.current || setupRef.current)?.focus?.(); }, 210);
      return () => window.clearTimeout(id);
    }
    if (!open && wasOpenRef.current) {
      wasOpenRef.current = false;
      bubbleRef.current?.focus?.({ preventScroll: true });
    }
    return undefined;
  }, [open]);

  // Auto-scroll only while the user is already near the bottom.
  useEffect(() => {
    const el = logRef.current;
    if (el && nearBottomRef.current) el.scrollTo?.({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, open]);

  // Auto-expand composer textarea (1-4 rows).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
    el.style.overflowY = el.scrollHeight > COMPOSER_MAX_HEIGHT ? 'auto' : 'hidden';
  }, [input, open]);

  /* ---------------- chat actions ---------------- */

  const runRequest = useCallback(async (text, { addUser }) => {
    if (!text || busy) return;
    lastPromptRef.current = text;
    if (addUser) setInput('');
    setBusy(true);
    setError('');
    setStatus('retrieving');
    if (addUser) setMessages((m) => [...m, { role: 'user', content: text }]);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: text,
          userId,
          token,
          history: messages
            .slice(-10)
            .filter((m, i, all) => addUser || i !== all.length - 1 || m.role !== 'user' || m.content !== text)
            .map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.status === 'error') {
        throw new Error(data.message || t.errorGeneric);
      }
      setStatus(data.status === 'partial' ? 'partial' : '');
      setMessages((m) => [...m, { role: 'assistant', content: data.answer, sources: data.sources }]);
    } catch (e) {
      setError(e.message || t.errorGeneric);
    } finally {
      setBusy(false);
    }
  }, [busy, endpoint, userId, token, messages, t.errorGeneric]);

  const send = () => runRequest(input.trim(), { addUser: true });
  const retry = () => runRequest(lastPromptRef.current, { addUser: false });

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!e.nativeEvent?.isComposing) send();
    }
  };

  const onLogScroll = () => {
    const el = logRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    nearBottomRef.current = nearBottom;
    setShowJump(!nearBottom);
  };

  const jumpToBottom = () => {
    const el = logRef.current;
    nearBottomRef.current = true;
    setShowJump(false);
    el?.scrollTo?.({ top: el.scrollHeight, behavior: 'smooth' });
  };

  const switchMode = (next) => { setMode(next); store('grouter-copilot-theme', next); };
  const switchLang = (next) => { setLang(next); store('grouter-copilot-lang', next); };

  /* ---------------- theme tokens -> CSS variables ---------------- */

  const tokens = resolveTheme(mode);
  const cssVars = {
    '--grc-font': tokens.typography.fontFamily,
    '--grc-mono': tokens.typography.fontFamilyMono,
    '--grc-canvas': theme.background ?? tokens.color.bg.canvas,
    '--grc-surface': tokens.color.bg.surface,
    '--grc-sunken': tokens.color.bg.sunken,
    '--grc-fg': theme.foreground ?? tokens.color.fg.primary,
    '--grc-fg2': tokens.color.fg.secondary,
    '--grc-muted': tokens.color.fg.muted,
    '--grc-accent': theme.accent ?? tokens.color.accent.base,
    '--grc-accent-hover': theme.accent ?? tokens.color.accent.hover,
    '--grc-accent-active': tokens.color.accent.active,
    '--grc-accent-soft': tokens.color.accent.soft,
    '--grc-accent-as-text': theme.accent ?? tokens.color.accent.asText,
    '--grc-accent-active-dim': tokens.color.accent.active,
    '--grc-on-accent': tokens.color.accent.onAccent,
    '--grc-ok': tokens.color.success.base,
    '--grc-ok-soft': tokens.color.success.soft,
    '--grc-warn': tokens.color.warn.base,
    '--grc-err': tokens.color.danger.base,
    '--grc-err-soft': tokens.color.danger.soft,
    '--grc-err-as-text': tokens.color.danger.asText,
    '--grc-border': tokens.color.border.subtle,
    '--grc-border-strong': tokens.color.border.strong,
    '--grc-ring': tokens.focus.ring,
    '--grc-shadow-panel': tokens.shadow.panel,
    '--grc-shadow-overlay': tokens.shadow.overlay,
    '--grc-radius-lg': `${tokens.radius.lg}px`,
  };

  /* ---------------- health rows ---------------- */

  const checks = health?.checks || {};
  const checkRows = [
    { key: 'license', label: t.licenseLabel, ok: checks.license === true },
    { key: 'skills', label: t.skillsLabel, ok: checks.skills === true },
    { key: 'provider', label: t.providerLabel, ok: checks.provider === true },
  ];
  const wizardRows = [
    { key: 'server', label: t.server, ok: healthReady },
    ...checkRows,
  ];

  /* ---------------- settings popover ---------------- */

  const settingsPopover = settingsOpen ? (
    <div className="grc-settings" role="group" aria-label={t.settings}>
      <div className="grc-setrow"><span>{t.healthLabel}</span></div>
      <div>
        {checkRows.map((r) => (
          <div className="grc-hrow" key={r.key}>
            <span className={`grc-hic ${r.ok ? 'ok' : 'bad'}`} aria-hidden="true">{r.ok ? '✓' : '✕'}</span>
            <span>{r.label}</span>
            <span className="grc-hstate" style={{ color: r.ok ? 'var(--grc-ok)' : 'var(--grc-err)' }}>{r.ok ? t.checkReady : t.checkFail}</span>
          </div>
        ))}
      </div>
      <div className="grc-setrow">
        <span>{t.themeLabel}</span>
        <span className="grc-seg" role="group" aria-label={t.themeLabel}>
          <button type="button" className={mode === 'dark' ? 'on' : ''} aria-pressed={mode === 'dark'} onClick={() => switchMode('dark')}>{t.dark}</button>
          <button type="button" className={mode === 'light' ? 'on' : ''} aria-pressed={mode === 'light'} onClick={() => switchMode('light')}>{t.light}</button>
        </span>
      </div>
      <div className="grc-setrow">
        <span>{t.langLabel}</span>
        <span className="grc-seg" role="group" aria-label={t.langLabel}>
          <button type="button" className={lang === 'id' ? 'on' : ''} aria-pressed={lang === 'id'} onClick={() => switchLang('id')}>ID</button>
          <button type="button" className={lang === 'en' ? 'on' : ''} aria-pressed={lang === 'en'} onClick={() => switchLang('en')}>EN</button>
        </span>
      </div>
      <div className="grc-vers">Copilot v{version}</div>
    </div>
  ) : null;

  /* ---------------- first-run wizard (3 steps) ---------------- */

  const setupWizard = (
    <div className="grc-setup" ref={setupRef} tabIndex={-1} aria-label={t.setupAria}>
      <div className="grc-steps" aria-hidden="true">
        <i className={setupStep >= 1 ? 'on' : ''} /><i className={setupStep >= 2 ? 'on' : ''} /><i className={setupStep >= 3 ? 'on' : ''} />
      </div>
      <span className="grc-setup-count">{t.stepLabel} {setupStep}/3</span>

      {setupStep === 1 ? (
        <>
          <h3 className="grc-step-title">{t.setupTitle}</h3>
          <p className="grc-step-text">{t.setupIntro}</p>
          <ul className="grc-benefits">
            {t.benefits.map((b, idx) => <li key={idx}><CheckIcon size={14} /><span>{b}</span></li>)}
          </ul>
          <button type="button" className="grc-btn primary" onClick={() => setSetupStep(2)}>{t.next}</button>
        </>
      ) : null}

      {setupStep === 2 ? (
        <>
          <h3 className="grc-step-title">{t.setupCheckTitle}</h3>
          <p className="grc-step-text">{t.setupCheckText}</p>
          <div className="grc-checks">
            {wizardRows.map((r) => (
              <div key={r.key} className={`grc-check ${r.ok ? 'ok' : (health ? 'bad' : 'wait')}`}>
                <span className="grc-check-ic" aria-hidden="true">
                  {r.ok ? <CheckIcon size={12} /> : (health ? <XIcon size={11} /> : <span className="grc-spin" />)}
                </span>
                <span>{r.label}</span>
                <span className="grc-check-state">{r.ok ? t.checkReady : (health ? t.checkFail : t.checking)}</span>
              </div>
            ))}
          </div>
          {!healthReady ? (
            <button type="button" className="grc-btn ghost" onClick={checkHealth} disabled={checkingHealth}>
              <RefreshIcon /> {checkingHealth ? t.checking : t.recheck}
            </button>
          ) : null}
          <button type="button" className="grc-btn ghost" onClick={() => setSetupStep(1)}>{t.back}</button>
          <button type="button" className="grc-btn primary" onClick={() => setSetupStep(3)}>{t.next}</button>
        </>
      ) : null}

      {setupStep === 3 ? (
        <>
          <h3 className="grc-step-title">{t.setupDoneTitle}</h3>
          <p className="grc-step-text">{t.setupDoneText}</p>
          <label className="grc-agree">
            <input type="checkbox" required />
            <span>{t.agree}</span>
          </label>
          <button type="button" className="grc-btn ghost" onClick={() => setSetupStep(2)}>{t.back}</button>
          <button
            type="button"
            className="grc-btn primary"
            disabled={checkingHealth}
            onClick={async (event) => {
              if (healthCheckRef.current || !event.currentTarget.parentElement.querySelector('input').checked) return;
              healthCheckRef.current = true;
              setCheckingHealth(true);
              try {
                const res = await fetch(healthEndpoint, { cache: 'no-store' });
                const data = await res.json();
                if (!isReadyHealth(data, res.ok)) { setHealth({ status: 'unavailable', checks: data?.checks }); setSetupStep(2); return; }
                setHealth(data);
              } catch { setHealth({ status: 'unavailable' }); setSetupStep(2); return; }
              finally { healthCheckRef.current = false; setCheckingHealth(false); }
              try { window.localStorage.setItem('grouter-copilot-setup-done', 'true'); } catch { /* Storage may be disabled. */ }
              setSetupDone(true); setSetupOpen(false);
            }}
          >
            {checkingHealth ? t.checking : t.startAsking}
          </button>
        </>
      ) : null}
    </div>
  );

  /* ---------------- chat body ---------------- */

  const chatBody = (
    <>
      {messages.length === 0 ? (
        <div className="grc-empty">
          <span className="grc-empty-ic" aria-hidden="true"><SparkIcon size={20} /></span>
          <h3 className="grc-empty-title">{welcomeMessage || t.welcome}</h3>
          <p className="grc-empty-sub">{t.welcomeSub}</p>
          <div className="grc-chips">
            {chips.map((c, idx) => (
              <button
                key={`${c.label}-${idx}`}
                type="button"
                className="grc-chip"
                disabled={busy}
                onClick={() => runRequest(c.prompt || c.label, { addUser: true })}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="grc-logwrap">
        <div className="grc-log" role="log" aria-live="polite" ref={logRef} onScroll={onLogScroll}>
          {messages.map((m, i) => (
            <div key={i} className={`grc-msg ${m.role === 'user' ? 'user' : 'assistant'}`}>
              {m.role === 'user'
                ? m.content
                : <div className="grc-md" dangerouslySetInnerHTML={{ __html: markdownToHtml(m.content, t.proposal) }} />}
              {m.sources && m.sources.length > 0 ? (
                <div className="grc-sources">{t.sources}: {m.sources.map((s) => (s && s.label) || JSON.stringify(s)).join(' · ')}</div>
              ) : null}
              {m.role === 'assistant' && status === 'partial' && i === messages.length - 1 ? (
                <div className="grc-partial">{t.partial}</div>
              ) : null}
            </div>
          ))}
          {busy ? <div className="grc-typing" role="status" aria-label={t.typing}><i /><i /><i /></div> : null}
          {error ? (
            <div className="grc-error" role="alert">
              <span className="grc-error-text">{error}</span>
              {lastPromptRef.current ? (
                <button type="button" className="grc-retry" onClick={retry} disabled={busy}>{t.retry}</button>
              ) : null}
            </div>
          ) : null}
        </div>
        {showJump && messages.length > 0 ? (
          <button type="button" className="grc-jump" onClick={jumpToBottom}>
            <ArrowDownIcon /> {t.jump}
          </button>
        ) : null}
      </div>
      <footer className="grc-composer">
        <textarea
          ref={inputRef}
          className="grc-textarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={ph}
          rows={1}
          aria-label={ph}
          disabled={busy}
        />
        <button type="button" className="grc-send" onClick={send} disabled={busy || !input.trim()} aria-label={t.send}>
          <SendIcon />
        </button>
      </footer>
    </>
  );

  return (
    <div className={`grc-root ${mode === 'light' ? 'grc-light' : 'grc-dark'}`} style={cssVars}>
      <style>{CSS}</style>
      {open ? (
        <section role="dialog" aria-label={title}
          className={`grc-panel${closing ? ' grc-out' : ''}`}
          style={{ left: panelX, top: panelY, width: 'min(360px, calc(100vw - 32px))', height: 'min(560px, calc(100vh - 96px))', zIndex: 2147483000 }}
        >
          <header className="grc-header" data-grc-drag="panel" onPointerDown={startDrag}>
            <span className="grc-avatar" aria-hidden="true"><SparkIcon size={17} /></span>
            <span className="grc-headtext">
              <span className="grc-title">{title}</span>
              <span className="grc-subtitle">
                <i className={`grc-dot ${dotClass}`} aria-hidden="true" />
                {dotText}
              </span>
            </span>
            <span className="grc-spacer" />
            <button
              type="button"
              className={`grc-iconbtn${settingsOpen ? ' active' : ''}`}
              onClick={() => setSettingsOpen((s) => !s)}
              aria-label={t.settings}
              aria-expanded={settingsOpen}
              aria-haspopup="true"
            >
              <GearIcon />
            </button>
            <button type="button" className="grc-iconbtn" onClick={closePanel} aria-label={t.close}>
              <XIcon />
            </button>
          </header>
          {settingsPopover}
          {setupOpen && !setupDone ? setupWizard : chatBody}
        </section>
      ) : (
        <button
          type="button"
          ref={bubbleRef}
          className="grc-bubble"
          onClick={() => { setOpen(true); if (!setupDone) setSetupOpen(true); }}
          onPointerDown={startDrag}
          aria-label={`Buka ${title}`}
          title={t.dragHint}
          data-grc-drag="bubble"
          style={{ left: bubbleX, top: bubbleY, zIndex: 2147483000 }}
        >
          <SparkIcon size={26} />
          {(error || (health && !healthReady)) ? <span className="grc-badge" aria-hidden="true" /> : null}
        </button>
      )}
    </div>
  );
}

export default CopilotChat;
