// public/copilot-panel.js — Copilot panel demo (vanilla JS, tanpa build step).
// Bahasa desain enterprise: accent cyan #22d3ee, dark default, restrained.
// Memanggil endpoint /api/copilot/chat + /api/copilot/health yang SAMA dengan
// widget produk. Label CONTRACT: aria-label panel tetap "Copilot (demo panel)";
// judul header tampil sebagai "Copilot".
//
// Fitur:
//   - Bubble lingkaran 56px ikon sparkle (aria-label "Buka Copilot"),
//     hover/focus/active, badge titik merah saat terjadi error chat.
//   - Header panel: avatar ikon + "Copilot" + dot status koneksi (dari
//     /api/copilot/health saat panel dibuka) + gear settings + close.
//   - Empty state: welcome singkat + 4 suggestion chips kontekstual CRM
//     (klik = langsung mengirim pesan).
//   - Hierarki pesan user vs assistant; markdown sederhana aman
//     (escape dulu: bold, code, list).
//   - Typing indicator 3 dots; error state + tombol "Coba lagi" (retry).
//   - Approval card: blok proposal JSON dirender sebagai KARTU TERSTRUKTUR
//     (aksi, leadId, currentStatus -> newStatus, reason) dengan tombol
//     "Terapkan perubahan" + "Batal". Status sukses di kartu diverifikasi
//     dari callback window.crmApplyLeadUpdate milik host (bukan asumsi).
//   - Settings popover: 3 health checks + toggle tema light/dark
//     (localStorage "grouter-copilot-theme", default dark) + toggle bahasa
//     ID/EN (localStorage "grouter-copilot-lang", default ID; semua label
//     tersedia dua bahasa).
//   - Responsive <480px: bottom sheet full-width, radius atas.
//   - A11y: aria-label semua kontrol, role="log" aria-live, focus ring.
(function () {
  'use strict';

  var STORAGE_THEME = 'grouter-copilot-theme';
  var STORAGE_LANG = 'grouter-copilot-lang';

  // ---------- i18n (default ID) ----------
  var STR = {
    id: {
      bubble: 'Buka Copilot',
      panel: 'Copilot (demo panel)',
      close: 'Tutup panel (Escape)',
      settings: 'Pengaturan Copilot',
      welcome: 'Hai! Saya Copilot untuk CRM Anda.',
      welcomeSub: 'Tanyakan apa saja tentang customers, leads, dan deals — saya jawab dari data Anda sendiri.',
      chip0: 'Ringkas data saya',
      chip1: 'Status pipeline',
      chip2: 'Draft follow-up',
      chip3: 'Cari customer',
      inputPh: 'Tanya CRM\u2026',
      send: 'Kirim',
      typing: 'Copilot sedang mengetik',
      retry: 'Coba lagi',
      errGeneric: 'Terjadi kesalahan. Coba lagi.',
      errNet: 'Tidak dapat menghubungi server',
      sources: 'Sumber',
      connOk: 'Terhubung',
      connDown: 'Tidak terhubung',
      connCheck: 'Memeriksa koneksi\u2026',
      health: 'Status sistem',
      hLicense: 'Lisensi',
      hSkills: 'Skills',
      hProvider: 'Provider',
      ok: 'OK',
      fail: 'Gagal',
      theme: 'Tema',
      tDark: 'Gelap',
      tLight: 'Terang',
      lang: 'Bahasa',
      proposal: 'Proposal perubahan status',
      fAction: 'Aksi',
      fLead: 'Lead',
      fChange: 'Perubahan',
      fReason: 'Alasan',
      actionChange: 'Ubah status lead',
      pending: 'Menunggu konfirmasi',
      applying: 'Menerapkan\u2026',
      applied: 'Diterapkan',
      applyFail: 'Gagal diterapkan',
      canceled: 'Dibatalkan',
      canceledNote: 'Tidak ada perubahan yang diterapkan.',
      apply: 'Terapkan perubahan',
      cancel: 'Batal',
      hostMissing: 'Aksi apply tidak tersedia di host (crmApplyLeadUpdate).',
    },
    en: {
      bubble: 'Open Copilot',
      panel: 'Copilot (demo panel)',
      close: 'Close panel (Escape)',
      settings: 'Copilot settings',
      welcome: "Hi! I'm your CRM Copilot.",
      welcomeSub: 'Ask anything about customers, leads, and deals — answered from your own data.',
      chip0: 'Summarize my data',
      chip1: 'Pipeline status',
      chip2: 'Draft follow-up',
      chip3: 'Find a customer',
      inputPh: 'Ask the CRM\u2026',
      send: 'Send',
      typing: 'Copilot is typing',
      retry: 'Try again',
      errGeneric: 'Something went wrong. Please try again.',
      errNet: 'Cannot reach the server',
      sources: 'Sources',
      connOk: 'Connected',
      connDown: 'Not connected',
      connCheck: 'Checking\u2026',
      health: 'System status',
      hLicense: 'License',
      hSkills: 'Skills',
      hProvider: 'Provider',
      ok: 'OK',
      fail: 'Failed',
      theme: 'Theme',
      tDark: 'Dark',
      tLight: 'Light',
      lang: 'Language',
      proposal: 'Status change proposal',
      fAction: 'Action',
      fLead: 'Lead',
      fChange: 'Change',
      fReason: 'Reason',
      actionChange: 'Update lead status',
      pending: 'Awaiting confirmation',
      applying: 'Applying\u2026',
      applied: 'Applied',
      applyFail: 'Failed to apply',
      canceled: 'Canceled',
      canceledNote: 'No changes were made.',
      apply: 'Apply changes',
      cancel: 'Cancel',
      hostMissing: 'Apply action unavailable in host (crmApplyLeadUpdate).',
    },
  };

  function t(key) {
    var d = STR[state.lang] || STR.id;
    if (d[key] !== undefined) return d[key];
    if (STR.id[key] !== undefined) return STR.id[key];
    return key;
  }

  function store(key, val) { try { window.localStorage.setItem(key, val); } catch (e) { /* ignore */ } }
  function loadPref(key, fallback) {
    try { return window.localStorage.getItem(key) || fallback; } catch (e) { return fallback; }
  }

  var state = {
    lang: loadPref(STORAGE_LANG, 'id') === 'en' ? 'en' : 'id',
    theme: loadPref(STORAGE_THEME, 'dark') === 'light' ? 'light' : 'dark',
    health: null,
    busy: false,
    lastFailed: null,
  };

  var SVG = {
    sparkle: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 3.1l2.1 5.85 5.85 2.1-5.85 2.1L12 19l-2.1-5.85L4.05 11.05l5.85-2.1z"/><circle fill="currentColor" cx="18.7" cy="4.8" r="1.5"/></svg>',
    sparkleSm: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 3.1l2.1 5.85 5.85 2.1-5.85 2.1L12 19l-2.1-5.85L4.05 11.05l5.85-2.1z"/></svg>',
    swap: '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 8.5h13.5l-3.2-3.2M20 15.5H6.5l3.2 3.2"/></svg>',
    gear: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false"><path fill="currentColor" d="M19.14 12.94a7.07 7.07 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.14.56-1.63.94l-2.39-.96a.5.5 0 0 0-.61.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.42.34.61.22l2.39-.96c.49.38 1.04.7 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.59-.24 1.14-.56 1.63-.94l2.39.96c.19.12.47.02.61-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/></svg>',
  };

  var els = {};

  var STYLE = `
/* ===== Copilot panel — enterprise: accent cyan #22d3ee, dark default ===== */
#crm-copilot-bubble{position:fixed;right:20px;bottom:20px;z-index:9999;width:56px;height:56px;border-radius:50%;display:grid;place-items:center;cursor:pointer;padding:0;background:linear-gradient(180deg,#151d25,#0f151b);border:1px solid #273340;color:#22d3ee;box-shadow:0 10px 30px rgba(0,0,0,.45),0 0 0 1px rgba(34,211,238,.06);transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease;}
#crm-copilot-bubble:hover{transform:translateY(-1px);border-color:rgba(34,211,238,.45);box-shadow:0 12px 34px rgba(0,0,0,.5),0 0 0 1px rgba(34,211,238,.18);}
#crm-copilot-bubble:active{transform:scale(.96);}
#crm-copilot-bubble:focus-visible{outline:2px solid #22d3ee;outline-offset:3px;}
#crm-copilot-bubble.grc-light{background:#ffffff;border-color:#dbe2e9;color:#0e7490;box-shadow:0 10px 30px rgba(15,23,42,.14);}
.grc-bubble-dot{position:absolute;top:1px;right:1px;width:13px;height:13px;border-radius:50%;background:#f87171;border:2px solid #0f151b;}
.grc-light .grc-bubble-dot{border-color:#ffffff;}

#crm-copilot-panel{--grc-bg:#0f151b;--grc-surface:#151d25;--grc-surface-2:#10171e;--grc-border:#26323d;--grc-border-soft:#1f2933;--grc-text:#e8edf2;--grc-dim:#8fa0ae;--grc-faint:#61707d;--grc-accent:#22d3ee;--grc-accent-strong:#0e7490;--grc-accent-soft:rgba(34,211,238,.12);--grc-ok:#34d399;--grc-err:#f87171;position:fixed;right:20px;bottom:88px;z-index:10000;width:360px;height:520px;display:none;flex-direction:column;background:var(--grc-bg);color:var(--grc-text);border:1px solid var(--grc-border);border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.5);overflow:hidden;font-family:-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:13px;line-height:1.5;text-align:left;animation:grc-in .16s ease;}
#crm-copilot-panel.grc-light{--grc-bg:#ffffff;--grc-surface:#f5f7fa;--grc-surface-2:#eef2f6;--grc-border:#dbe2e9;--grc-border-soft:#e6ecf1;--grc-text:#16202a;--grc-dim:#5b6b7a;--grc-faint:#8494a3;--grc-accent-soft:rgba(34,211,238,.14);box-shadow:0 24px 60px rgba(15,23,42,.16);}
@keyframes grc-in{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}

#crm-copilot-panel :focus-visible{outline:2px solid var(--grc-accent);outline-offset:2px;border-radius:4px;}

.grc-header{display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--grc-surface);border-bottom:1px solid var(--grc-border);flex:0 0 auto;}
.grc-avatar{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;background:var(--grc-accent-soft);color:var(--grc-accent);border:1px solid rgba(34,211,238,.25);flex:0 0 auto;}
.grc-title{font-weight:650;font-size:13.5px;letter-spacing:.2px;}
.grc-dot{width:8px;height:8px;border-radius:50%;background:var(--grc-faint);flex:0 0 auto;}
.grc-dot.grc-dot--ok{background:var(--grc-ok);}
.grc-dot.grc-dot--down{background:var(--grc-err);}
.grc-dot.grc-dot--check{background:var(--grc-faint);animation:grc-pulse 1s ease infinite alternate;}
@keyframes grc-pulse{from{opacity:.35;}to{opacity:1;}}
.grc-spacer{flex:1;}
.grc-header-btn{appearance:none;background:none;border:none;color:var(--grc-dim);width:26px;height:26px;border-radius:7px;display:grid;place-items:center;cursor:pointer;padding:0;}
.grc-header-btn:hover{background:var(--grc-surface-2);color:var(--grc-text);}

.grc-settings{position:absolute;top:50px;right:10px;width:292px;max-width:calc(100vw - 32px);background:var(--grc-surface);border:1px solid var(--grc-border);border-radius:12px;box-shadow:0 18px 44px rgba(0,0,0,.45);padding:12px;display:flex;flex-direction:column;gap:12px;z-index:3;}
.grc-settings[hidden]{display:none;}
.grc-set-title{font-size:10.5px;text-transform:uppercase;letter-spacing:.7px;color:var(--grc-faint);font-weight:650;margin:0 0 7px;}
.grc-hrow{display:flex;align-items:center;gap:8px;font-size:12px;padding:2px 0;}
.grc-hdot{width:7px;height:7px;border-radius:50%;background:var(--grc-faint);flex:0 0 auto;}
.grc-hdot.grc-hdot--ok{background:var(--grc-ok);}
.grc-hdot.grc-hdot--down{background:var(--grc-err);}
.grc-hval{margin-left:auto;font-size:11px;color:var(--grc-dim);}
.grc-seg{display:flex;background:var(--grc-surface-2);border:1px solid var(--grc-border);border-radius:9px;padding:2px;gap:2px;}
.grc-seg button{flex:1;appearance:none;background:none;border:none;color:var(--grc-dim);font:inherit;font-size:12px;font-weight:600;padding:6px 0;border-radius:7px;cursor:pointer;}
.grc-seg button.is-active{background:var(--grc-accent-soft);color:var(--grc-accent);}
.grc-light .grc-seg button.is-active{color:var(--grc-accent-strong);}

#crm-copilot-log{flex:1 1 auto;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px;background:var(--grc-bg);}
#crm-copilot-log::-webkit-scrollbar{width:8px;}
#crm-copilot-log::-webkit-scrollbar-thumb{background:var(--grc-border);border-radius:99px;}
.grc-row{display:flex;flex-direction:column;}
.grc-row--user{align-items:flex-end;}
.grc-row--copilot,.grc-row--error{align-items:flex-start;}
.grc-msg{max-width:86%;padding:8px 11px;border-radius:12px;word-break:break-word;overflow-wrap:anywhere;}
.grc-row--user .grc-msg{background:var(--grc-accent-soft);border:1px solid rgba(34,211,238,.32);border-radius:12px 12px 4px 12px;}
.grc-row--copilot .grc-msg{background:var(--grc-surface);border:1px solid var(--grc-border);border-radius:12px 12px 12px 4px;}
.grc-row--error .grc-msg{background:rgba(248,113,113,.10);border:1px solid rgba(248,113,113,.38);border-radius:12px 12px 12px 4px;}
.grc-msg p{margin:0 0 6px;}
.grc-msg p:last-child{margin-bottom:0;}
.grc-msg ul{margin:4px 0;padding-left:18px;}
.grc-msg code{background:var(--grc-surface-2);border:1px solid var(--grc-border-soft);padding:0 5px;border-radius:5px;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}
.grc-src{font-size:11px;color:var(--grc-faint);max-width:86%;margin-top:-3px;}
.grc-retry{align-self:flex-start;appearance:none;background:none;border:1px solid var(--grc-border);color:var(--grc-accent);font:inherit;font-size:12px;font-weight:600;padding:5px 11px;border-radius:8px;cursor:pointer;margin-top:2px;}
.grc-retry:hover{border-color:rgba(34,211,238,.5);background:var(--grc-accent-soft);}
.grc-light .grc-retry{color:var(--grc-accent-strong);}

.grc-typing{align-items:flex-start;}
.grc-typing-bubble{display:inline-flex;gap:4px;align-items:center;padding:11px 12px;background:var(--grc-surface);border:1px solid var(--grc-border);border-radius:12px 12px 12px 4px;}
.grc-typing-bubble i{width:6px;height:6px;border-radius:50%;background:var(--grc-dim);animation:grc-blink 1.2s ease infinite;}
.grc-typing-bubble i:nth-child(2){animation-delay:.15s;}
.grc-typing-bubble i:nth-child(3){animation-delay:.3s;}
@keyframes grc-blink{0%,80%,100%{opacity:.25;transform:translateY(0);}40%{opacity:1;transform:translateY(-2px);}}

.grc-empty{margin:auto;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;padding:12px;}
.grc-empty-icon{width:42px;height:42px;border-radius:12px;background:var(--grc-accent-soft);border:1px solid rgba(34,211,238,.25);display:grid;place-items:center;color:var(--grc-accent);margin-bottom:4px;}
.grc-empty-title{font-weight:650;font-size:14px;}
.grc-empty-sub{color:var(--grc-dim);font-size:12px;max-width:272px;}
.grc-chips{display:flex;flex-wrap:wrap;gap:7px;justify-content:center;margin-top:10px;}
.grc-chip{appearance:none;background:var(--grc-surface);border:1px solid var(--grc-border);color:var(--grc-text);font:inherit;font-size:12px;font-weight:500;padding:7px 11px;border-radius:999px;cursor:pointer;transition:border-color .15s ease,background .15s ease;}
.grc-chip:hover{border-color:rgba(34,211,238,.5);background:var(--grc-accent-soft);}

.grc-card{max-width:92%;margin-top:2px;background:linear-gradient(180deg,var(--grc-surface),var(--grc-surface-2));border:1px solid var(--grc-border);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;}
.grc-card--applied{border-color:rgba(52,211,153,.45);}
.grc-card--failed{border-color:rgba(248,113,113,.4);}
.grc-card--canceled{opacity:.72;}
.grc-card-head{display:flex;align-items:center;gap:7px;}
.grc-card-icon{width:22px;height:22px;border-radius:7px;background:var(--grc-accent-soft);color:var(--grc-accent);display:grid;place-items:center;border:1px solid rgba(34,211,238,.25);flex:0 0 auto;}
.grc-card-title{font-weight:650;font-size:12.5px;flex:1;}
.grc-card-badge{font-size:10.5px;font-weight:650;padding:2px 8px;border-radius:99px;border:1px solid var(--grc-border);color:var(--grc-dim);white-space:nowrap;}
.grc-badge--ok{color:var(--grc-ok);border-color:rgba(52,211,153,.4);}
.grc-badge--err{color:var(--grc-err);border-color:rgba(248,113,113,.4);}
.grc-kv{display:flex;flex-direction:column;gap:5px;font-size:12px;}
.grc-kv-row{display:flex;gap:8px;}
.grc-kv-label{color:var(--grc-faint);flex:0 0 76px;}
.grc-kv-value{color:var(--grc-text);font-weight:550;word-break:break-word;display:flex;align-items:center;gap:4px;flex-wrap:wrap;}
.grc-kv-value--plain{font-weight:400;color:var(--grc-dim);display:block;}
.grc-status-arrow{color:var(--grc-faint);}
.grc-chip-status{display:inline-block;font-size:11px;font-weight:600;padding:1px 8px;border-radius:99px;border:1px solid var(--grc-border);background:var(--grc-surface-2);color:var(--grc-dim);}
.grc-chip-status--target{border-color:rgba(34,211,238,.45);color:var(--grc-accent);background:var(--grc-accent-soft);}
.grc-light .grc-chip-status--target{color:var(--grc-accent-strong);}
.grc-card-status{font-size:12px;display:flex;align-items:center;gap:6px;}
.grc-card-status--ok{color:var(--grc-ok);}
.grc-card-status--err{color:var(--grc-err);}
.grc-card-status--muted{color:var(--grc-faint);}
.grc-card-status--busy{color:var(--grc-dim);}
.grc-card-actions{display:flex;gap:8px;}
.grc-card-actions[hidden]{display:none;}
.grc-btn-primary{flex:1;appearance:none;border:none;background:var(--grc-accent);color:#06222e;font-weight:650;font-size:12.5px;padding:8px 10px;border-radius:9px;cursor:pointer;font-family:inherit;}
.grc-btn-primary:hover{filter:brightness(1.07);}
.grc-btn-primary:disabled{opacity:.55;cursor:default;filter:none;}
.grc-btn-ghost{appearance:none;background:none;border:1px solid var(--grc-border);color:var(--grc-dim);font:inherit;font-size:12.5px;font-weight:550;padding:8px 12px;border-radius:9px;cursor:pointer;}
.grc-btn-ghost:hover{color:var(--grc-text);border-color:var(--grc-faint);}
.grc-btn-ghost:disabled{opacity:.55;cursor:default;}

.grc-composer{flex:0 0 auto;display:flex;gap:8px;padding:10px;border-top:1px solid var(--grc-border);background:var(--grc-surface);}
#crm-copilot-input{flex:1;min-width:0;background:var(--grc-surface-2);border:1px solid var(--grc-border);color:var(--grc-text);border-radius:10px;padding:9px 11px;font:inherit;font-size:13px;}
#crm-copilot-input::placeholder{color:var(--grc-faint);}
#crm-copilot-input:focus{outline:none;border-color:rgba(34,211,238,.6);box-shadow:0 0 0 3px rgba(34,211,238,.14);}
#crm-copilot-input:disabled{opacity:.6;}
#crm-copilot-send{appearance:none;border:1px solid rgba(34,211,238,.5);background:var(--grc-accent);color:#06222e;font-family:inherit;font-weight:650;font-size:13px;padding:0 14px;border-radius:10px;cursor:pointer;}
#crm-copilot-send:hover{filter:brightness(1.07);}
#crm-copilot-send:disabled{opacity:.55;cursor:default;filter:none;}

@media (max-width:480px){
  #crm-copilot-panel{left:0;right:0;bottom:0;top:auto;width:auto;height:78vh;border-radius:16px 16px 0 0;border-left:none;border-right:none;border-bottom:none;}
  #crm-copilot-bubble{right:14px;bottom:14px;}
}
@media (prefers-reduced-motion:reduce){
  #crm-copilot-panel{animation:none;}
  .grc-dot.grc-dot--check{animation:none;}
  .grc-typing-bubble i{animation:none;opacity:.6;}
}
`;

  // ---------- util ----------
  function el(tag, className, attrs) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (attrs) for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Markdown sederhana & aman: ESCAPE dulu, baru transform terbatas (bold, code, list).
  function mdInline(s) {
    return s
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }
  function mdToHtml(src) {
    var lines = escHtml(src).split(/\r?\n/);
    var out = [];
    var inList = false;
    var isRow = function (ln) { return /^\s*\|.+.\|\s*$/.test(ln) || /^\s*\|.+:\s*$/.test(ln); };
    var rowCells = function (ln) {
      return ln.trim().replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map(function (c) { return c.trim(); });
    };
    var i = 0;
    while (i < lines.length) {
      var ln = lines[i];
      // Tabel GFM sederhana: baris |a|b| + separator |---|---|
      if (isRow(ln) && i + 1 < lines.length && /^\s*\|[\s:-]*\|[\s:|-]*$/.test(lines[i + 1])) {
        if (inList) { out.push('</ul>'); inList = false; }
        var head = rowCells(ln);
        i += 2;
        var body = [];
        while (i < lines.length && isRow(lines[i])) { body.push(rowCells(lines[i])); i += 1; }
        out.push('<div class="md-table-wrap"><table><thead><tr>');
        for (var h = 0; h < head.length; h++) out.push('<th>' + mdInline(head[h]) + '</th>');
        out.push('</tr></thead><tbody>');
        for (var r = 0; r < body.length; r++) {
          out.push('<tr>');
          for (var c = 0; c < body[r].length; c++) out.push('<td>' + mdInline(body[r][c]) + '</td>');
          out.push('</tr>');
        }
        out.push('</tbody></table></div>');
        continue;
      }
      var li = ln.match(/^\s*[-*]\s+(.*)$/);
      if (li) {
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push('<li>' + mdInline(li[1]) + '</li>');
        i += 1;
        continue;
      }
      if (inList) { out.push('</ul>'); inList = false; }
      if (ln.trim() === '') { i += 1; continue; }
      out.push('<p>' + mdInline(ln) + '</p>');
      i += 1;
    }
    if (inList) out.push('</ul>');
    return out.join('');
  }

  function scrollLog() {
    els.log.scrollTop = els.log.scrollHeight;
  }

  function hideEmpty() {
    if (els.empty && els.empty.parentNode) els.empty.parentNode.removeChild(els.empty);
  }

  function showTyping() {
    hideTyping();
    var row = el('div', 'grc-row grc-typing');
    row.id = 'crm-copilot-typing';
    var b = el('span', 'grc-typing-bubble');
    b.setAttribute('role', 'status');
    b.setAttribute('aria-label', t('typing'));
    b.innerHTML = '<i></i><i></i><i></i>';
    row.appendChild(b);
    els.log.appendChild(row);
    scrollLog();
  }
  function hideTyping() {
    var x = document.getElementById('crm-copilot-typing');
    if (x && x.parentNode) x.parentNode.removeChild(x);
  }

  function setBusy(busy) {
    state.busy = busy;
    els.send.disabled = busy;
    els.input.disabled = busy;
  }

  // ---------- proposal -> approval card ----------
  function normalizeProposal(p) {
    p = p || {};
    return {
      leadId: p.leadId !== undefined ? String(p.leadId) : '',
      newStatus: p.newStatus !== undefined ? String(p.newStatus) : '',
      currentStatus: p.currentStatus !== undefined ? String(p.currentStatus) : '',
      reason: p.reason !== undefined ? String(p.reason) : '',
      leadName: p.leadName !== undefined ? String(p.leadName) : '',
    };
  }

  // Cari blok proposal JSON di dalam answer (fenced ```proposal/```json, inline JSON,
  // atau answer JSON penuh). Return { data: proposal|null, cleanAnswer }.
  function extractProposal(answer) {
    if (!answer || typeof answer !== 'string') return { data: null, cleanAnswer: answer || '' };
    var candidates = [];
    var fence = /```(?:proposal|json)\s*([\s\S]*?)```/i.exec(answer);
    if (fence) candidates.push({ raw: fence[0], json: fence[1] });
    var re = /\{[^{}]*"leadId"[\s\S]*?\}/g;
    var m;
    while ((m = re.exec(answer)) !== null) candidates.push({ raw: m[0], json: m[0] });
    if (/^\s*\{[\s\S]*\}\s*$/.test(answer)) candidates.push({ raw: answer.trim(), json: answer.trim() });

    for (var i = 0; i < candidates.length; i++) {
      try {
        var obj = JSON.parse(candidates[i].json);
        if (obj && obj.leadId && obj.newStatus) {
          var clean = answer.replace(candidates[i].raw, '').replace(/\n{3,}/g, '\n\n').trim();
          return { data: normalizeProposal(obj), cleanAnswer: clean };
        }
      } catch (e) { /* coba kandidat berikutnya */ }
    }
    return { data: null, cleanAnswer: answer };
  }

  function kvRow(labelKey, valueNode, valuePlain) {
    var r = el('div', 'grc-kv-row');
    var l = el('span', 'grc-kv-label');
    l.setAttribute('data-i18n', labelKey);
    l.textContent = t(labelKey);
    var v = el('span', 'grc-kv-value' + (valuePlain ? ' grc-kv-value--plain' : ''));
    if (typeof valueNode === 'string') v.textContent = valueNode;
    else v.appendChild(valueNode);
    r.appendChild(l);
    r.appendChild(v);
    return r;
  }

  function setCardState(card, st, extra) {
    var statusEl = card.querySelector('.grc-card-status');
    var badge = card.querySelector('.grc-card-badge');
    var actions = card.querySelector('.grc-card-actions');
    var apply = card.querySelector('.grc-btn-primary');
    card.classList.remove('grc-card--applied', 'grc-card--canceled', 'grc-card--failed');
    statusEl.hidden = false;
    var setStatus = function (text, cls) {
      statusEl.textContent = text;
      statusEl.className = 'grc-card-status' + (cls ? ' grc-card-status--' + cls : '');
    };
    var setBadge = function (text, cls) {
      badge.removeAttribute('data-i18n');
      badge.textContent = text;
      badge.className = 'grc-card-badge' + (cls ? ' ' + cls : '');
    };
    if (st === 'applying') {
      setStatus(t('applying'), 'busy');
      apply.disabled = true;
      card.querySelector('.grc-btn-ghost').disabled = true;
    } else if (st === 'applied') {
      card.classList.add('grc-card--applied');
      setBadge(t('applied'), 'grc-badge--ok');
      setStatus('\u2713 ' + t('applied') + ' \u2014 ' + card.dataset.leadId + ' \u2192 \u201c' + card.dataset.newStatus + '\u201d', 'ok');
      actions.hidden = true;
    } else if (st === 'failed') {
      card.classList.add('grc-card--failed');
      setBadge(t('applyFail'), 'grc-badge--err');
      setStatus('\u2717 ' + t('applyFail') + (extra ? ': ' + extra : ''), 'err');
      apply.disabled = false;
      card.querySelector('.grc-btn-ghost').disabled = false;
    } else if (st === 'canceled') {
      card.classList.add('grc-card--canceled');
      setBadge(t('canceled'), '');
      setStatus(t('canceledNote'), 'muted');
      actions.hidden = true;
    } else if (st === 'host-missing') {
      card.classList.add('grc-card--failed');
      setBadge(t('applyFail'), 'grc-badge--err');
      setStatus(t('hostMissing'), 'err');
      actions.hidden = true;
    }
  }

  function renderProposalCard(proposal) {
    var card = el('div', 'grc-card');
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', t('proposal'));
    card.dataset.leadId = proposal.leadId;
    card.dataset.newStatus = proposal.newStatus;

    // head: ikon + judul + badge status
    var head = el('div', 'grc-card-head');
    var icon = el('span', 'grc-card-icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = SVG.swap;
    var title = el('span', 'grc-card-title');
    title.setAttribute('data-i18n', 'proposal');
    title.textContent = t('proposal');
    var badge = el('span', 'grc-card-badge');
    badge.setAttribute('data-i18n', 'pending');
    badge.textContent = t('pending');
    head.appendChild(icon);
    head.appendChild(title);
    head.appendChild(badge);
    card.appendChild(head);

    // field terstruktur: aksi, lead, perubahan, alasan
    var kv = el('div', 'grc-kv');
    var actionVal = el('span');
    actionVal.setAttribute('data-i18n', 'actionChange');
    actionVal.textContent = t('actionChange');
    kv.appendChild(kvRow('fAction', actionVal));
    kv.appendChild(kvRow('fLead', proposal.leadId + (proposal.leadName ? ' \u00b7 ' + proposal.leadName : ''), true));

    var changeVal = el('span');
    var chipOld = el('span', 'grc-chip-status');
    chipOld.textContent = proposal.currentStatus || '\u2013';
    var arrow = el('span', 'grc-status-arrow');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '\u2192';
    var chipNew = el('span', 'grc-chip-status grc-chip-status--target');
    chipNew.textContent = proposal.newStatus;
    changeVal.appendChild(chipOld);
    changeVal.appendChild(arrow);
    changeVal.appendChild(chipNew);
    kv.appendChild(kvRow('fChange', changeVal));
    if (proposal.reason) kv.appendChild(kvRow('fReason', proposal.reason, true));
    card.appendChild(kv);

    // status line + actions
    var status = el('div', 'grc-card-status');
    status.hidden = true;
    card.appendChild(status);

    var actions = el('div', 'grc-card-actions');
    var applyBtn = el('button', 'grc-btn-primary', { type: 'button' });
    applyBtn.setAttribute('data-i18n', 'apply');
    applyBtn.textContent = t('apply');
    var cancelBtn = el('button', 'grc-btn-ghost', { type: 'button' });
    cancelBtn.setAttribute('data-i18n', 'cancel');
    cancelBtn.textContent = t('cancel');
    actions.appendChild(applyBtn);
    actions.appendChild(cancelBtn);
    card.appendChild(actions);

    var inFlight = false;
    var settled = false;
    applyBtn.addEventListener('click', function () {
      if (inFlight || settled) return;
      inFlight = true;
      setCardState(card, 'applying');
      if (typeof window.crmApplyLeadUpdate !== 'function') {
        inFlight = false;
        settled = true;
        setCardState(card, 'host-missing');
        return;
      }
      // Callback host = sumber kebenaran status (bukan asumsi UI).
      window.crmApplyLeadUpdate(proposal.leadId, proposal.newStatus, function (err) {
        inFlight = false;
        if (err) {
          setCardState(card, 'failed', (err && err.message) ? err.message : '');
        } else {
          settled = true;
          setCardState(card, 'applied');
        }
      });
    });
    cancelBtn.addEventListener('click', function () {
      if (inFlight || settled) return;
      settled = true; // tidak memanggil API apa pun — hanya menandai kartu ditolak
      setCardState(card, 'canceled');
    });

    return card;
  }

  // ---------- pesan ----------
  function addMessage(text, opts) {
    ensurePanel();
    var who = (opts && opts.who) || 'copilot';
    hideEmpty();
    var row = el('div', 'grc-row grc-row--' + who);
    if (text) {
      var b = el('div', 'grc-msg');
      if (who === 'user') b.textContent = text;
      else b.innerHTML = mdToHtml(text);
      row.appendChild(b);
    }
    if (who === 'copilot' && opts && opts.sources && opts.sources.length) {
      var src = el('div', 'grc-src');
      src.textContent = t('sources') + ': ' + opts.sources.map(function (s) { return (s && s.label) || String(s); }).join('; ');
      row.appendChild(src);
    }
    if (who === 'copilot' && opts && opts.proposal) {
      row.appendChild(renderProposalCard(opts.proposal));
    }
    els.log.appendChild(row);
    scrollLog();
    return row;
  }

  function clearError() {
    state.lastFailed = null;
    if (els.bubbleDot) els.bubbleDot.hidden = true;
  }

  function addError(msg, failedText) {
    ensurePanel();
    state.lastFailed = failedText || null;
    if (els.bubbleDot) els.bubbleDot.hidden = false; // badge titik error di bubble
    var row = el('div', 'grc-row grc-row--error');
    var b = el('div', 'grc-msg');
    b.textContent = msg;
    row.appendChild(b);
    if (state.lastFailed) {
      var btn = el('button', 'grc-retry', { type: 'button' });
      btn.setAttribute('data-i18n', 'retry');
      btn.textContent = t('retry');
      btn.addEventListener('click', function () { submit(state.lastFailed); });
      row.appendChild(btn);
    }
    els.log.appendChild(row);
    scrollLog();
    return row;
  }

  // ---------- health / status koneksi ----------
  function setDot(cls) {
    var d = els.statusDot;
    d.className = 'grc-dot' + (cls ? ' grc-dot--' + cls : '');
    var key = cls === 'ok' ? 'connOk' : cls === 'down' ? 'connDown' : 'connCheck';
    d.setAttribute('role', 'img');
    d.setAttribute('aria-label', t(key));
    d.setAttribute('title', t(key));
  }

  function setCheck(name, val) {
    var dot = els['h_' + name];
    var valEl = els['h_' + name + '_v'];
    if (!dot || !valEl) return;
    dot.className = 'grc-hdot' + (val === true ? ' grc-hdot--ok' : val === false ? ' grc-hdot--down' : '');
    valEl.textContent = val === true ? '\u2713 ' + t('ok') : val === false ? '\u2717 ' + t('fail') : '\u2026';
  }

  function renderHealth() {
    var h = state.health;
    if (!h) setDot('check');
    else setDot(h.status === 'ok' ? 'ok' : 'down');
    var c = (h && h.checks) || {};
    setCheck('license', c.license);
    setCheck('skills', c.skills);
    setCheck('provider', c.provider);
  }

  function refreshHealth() {
    state.health = null;
    setDot('check');
    fetch('/api/copilot/health')
      .then(function (r) { return r.json(); })
      .then(function (h) {
        state.health = (h && h.checks) ? h : { status: 'unavailable', checks: {} };
        renderHealth();
      })
      .catch(function () {
        state.health = { status: 'unavailable', checks: {} };
        renderHealth();
      });
  }

  // ---------- tema & bahasa ----------
  function applyTheme() {
    els.panel.classList.toggle('grc-light', state.theme === 'light');
    els.bubble.classList.toggle('grc-light', state.theme === 'light');
    els.themeDark.classList.toggle('is-active', state.theme === 'dark');
    els.themeLight.classList.toggle('is-active', state.theme === 'light');
  }
  function setTheme(theme) {
    state.theme = theme === 'light' ? 'light' : 'dark';
    store(STORAGE_THEME, state.theme);
    applyTheme();
  }

  function applyTexts() {
    els.root.querySelectorAll('[data-i18n]').forEach(function (n) {
      n.textContent = t(n.getAttribute('data-i18n'));
    });
    els.root.querySelectorAll('[data-i18n-ph]').forEach(function (n) {
      n.placeholder = t(n.getAttribute('data-i18n-ph'));
    });
    els.root.querySelectorAll('[data-i18n-aria]').forEach(function (n) {
      n.setAttribute('aria-label', t(n.getAttribute('data-i18n-aria')));
    });
    els.bubble.setAttribute('aria-label', t('bubble'));
    els.langId.classList.toggle('is-active', state.lang === 'id');
    els.langEn.classList.toggle('is-active', state.lang === 'en');
    renderHealth();
  }
  function setLang(lang) {
    if (!STR[lang]) return;
    state.lang = lang;
    store(STORAGE_LANG, state.lang);
    applyTexts();
  }

  // ---------- open/close ----------
  function setSettingsOpen(open) {
    els.settings.hidden = !open;
    els.gear.setAttribute('aria-expanded', String(open));
  }

  function setOpen(open) {
    ensurePanel();
    if (open) {
      els.panel.style.display = 'flex';
      els.bubble.style.display = 'none';
      els.input.focus();
      refreshHealth(); // status koneksi diperbarui setiap kali panel dibuka
    } else {
      els.panel.style.display = 'none';
      setSettingsOpen(false);
      els.bubble.style.display = '';
      els.bubble.focus();
    }
  }

  function toggle() {
    ensurePanel();
    setOpen(els.panel.style.display !== 'flex');
  }

  // ---------- kirim pesan ----------
  async function submit(presetText) {
    ensurePanel();
    if (state.busy) return;
    var text = (typeof presetText === 'string' ? presetText : els.input.value).trim();
    if (!text) return;
    if (typeof presetText !== 'string') els.input.value = '';
    addMessage(text, { who: 'user' });
    setBusy(true);
    showTyping();
    try {
      var res = await fetch('/api/copilot/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text, userId: 'demo-user' }),
      });
      var data = null;
      try { data = await res.json(); } catch (e) { /* non-JSON */ }
      if (!res.ok || !data || data.status === 'error') {
        var msg = (data && (data.message || data.code)) || ('HTTP ' + res.status);
        addError(t('errGeneric') + ' (' + msg + ')', text);
      } else {
        var answer = typeof data.answer === 'string' ? data.answer : JSON.stringify(data.answer ?? null);
        var ex = extractProposal(answer);
        addMessage(ex.data ? ex.cleanAnswer : (answer || ''), { who: 'copilot', sources: data.sources || [], proposal: ex.data });
        clearError();
      }
    } catch (err) {
      addError(t('errNet') + ' (' + ((err && err.message) || 'network') + ').', text);
    } finally {
      hideTyping();
      setBusy(false);
    }
  }

  // ---------- bangun DOM ----------
  function ensurePanel() {
    if (els.panel) return els.panel;

    if (!document.getElementById('crm-copilot-style')) {
      var style = document.createElement('style');
      style.id = 'crm-copilot-style';
      style.textContent = STYLE;
      document.head.appendChild(style);
    }

    // bubble 56px (sparkle) + badge titik error
    var bubble = el('button', null, { id: 'crm-copilot-bubble', type: 'button' });
    bubble.setAttribute('aria-label', t('bubble'));
    bubble.setAttribute('data-i18n-aria', 'bubble');
    bubble.innerHTML = SVG.sparkle;
    var bubbleDot = el('span', 'grc-bubble-dot');
    bubbleDot.hidden = true;
    bubble.appendChild(bubbleDot);

    var panel = el('div', null, { id: 'crm-copilot-panel' });
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', t('panel'));
    panel.setAttribute('data-i18n-aria', 'panel');
    panel.setAttribute('title', t('panel'));

    // header: avatar + judul + dot status + gear + close
    var header = el('div', 'grc-header');
    var avatar = el('span', 'grc-avatar');
    avatar.setAttribute('aria-hidden', 'true');
    avatar.innerHTML = SVG.sparkleSm;
    var title = el('span', 'grc-title');
    title.textContent = 'Copilot';
    var dot = el('span', 'grc-dot grc-dot--check');
    dot.id = 'crm-copilot-status-dot';
    var spacer = el('span', 'grc-spacer');
    var gear = el('button', 'grc-header-btn', { type: 'button', 'aria-expanded': 'false' });
    gear.id = 'crm-copilot-settings';
    gear.setAttribute('data-i18n-aria', 'settings');
    gear.setAttribute('title', t('settings'));
    gear.innerHTML = SVG.gear;
    var closeBtn = el('button', 'grc-header-btn', { type: 'button' });
    closeBtn.id = 'crm-copilot-close';
    closeBtn.setAttribute('data-i18n-aria', 'close');
    closeBtn.setAttribute('title', t('close'));
    closeBtn.innerHTML = SVG.close;
    header.appendChild(avatar);
    header.appendChild(title);
    header.appendChild(dot);
    header.appendChild(spacer);
    header.appendChild(gear);
    header.appendChild(closeBtn);

    // settings popover: health + tema + bahasa
    var settings = el('div', 'grc-settings');
    settings.id = 'crm-copilot-settings-pop';
    settings.hidden = true;
    settings.setAttribute('role', 'dialog');
    settings.setAttribute('data-i18n-aria', 'settings');

    var secHealth = el('div');
    var hTitle = el('div', 'grc-set-title');
    hTitle.setAttribute('data-i18n', 'health');
    hTitle.textContent = t('health');
    secHealth.appendChild(hTitle);
    ['license', 'skills', 'provider'].forEach(function (name) {
      var row = el('div', 'grc-hrow');
      var hd = el('span', 'grc-hdot');
      hd.id = 'grc-h-' + name;
      var lab = el('span');
      lab.setAttribute('data-i18n', 'h' + name.charAt(0).toUpperCase() + name.slice(1));
      lab.textContent = t('h' + name.charAt(0).toUpperCase() + name.slice(1));
      var val = el('span', 'grc-hval');
      val.id = 'grc-h-' + name + '-v';
      val.textContent = '\u2026';
      row.appendChild(hd);
      row.appendChild(lab);
      row.appendChild(val);
      secHealth.appendChild(row);
    });
    settings.appendChild(secHealth);

    var secTheme = el('div');
    var tTitle = el('div', 'grc-set-title');
    tTitle.setAttribute('data-i18n', 'theme');
    tTitle.textContent = t('theme');
    secTheme.appendChild(tTitle);
    var segTheme = el('div', 'grc-seg');
    segTheme.setAttribute('role', 'group');
    var themeDark = el('button', null, { type: 'button' });
    themeDark.id = 'grc-theme-dark';
    themeDark.setAttribute('data-i18n', 'tDark');
    themeDark.textContent = t('tDark');
    var themeLight = el('button', null, { type: 'button' });
    themeLight.id = 'grc-theme-light';
    themeLight.setAttribute('data-i18n', 'tLight');
    themeLight.textContent = t('tLight');
    segTheme.appendChild(themeDark);
    segTheme.appendChild(themeLight);
    secTheme.appendChild(segTheme);
    settings.appendChild(secTheme);

    var secLang = el('div');
    var lTitle = el('div', 'grc-set-title');
    lTitle.setAttribute('data-i18n', 'lang');
    lTitle.textContent = t('lang');
    secLang.appendChild(lTitle);
    var segLang = el('div', 'grc-seg');
    segLang.setAttribute('role', 'group');
    var langId = el('button', null, { type: 'button' });
    langId.id = 'grc-lang-id';
    langId.textContent = 'ID';
    var langEn = el('button', null, { type: 'button' });
    langEn.id = 'grc-lang-en';
    langEn.textContent = 'EN';
    segLang.appendChild(langId);
    segLang.appendChild(langEn);
    secLang.appendChild(segLang);
    settings.appendChild(secLang);

    // log (role log aria-live) + empty state + chips
    var log = el('div', null, { id: 'crm-copilot-log' });
    log.setAttribute('role', 'log');
    log.setAttribute('aria-live', 'polite');
    log.setAttribute('data-i18n-aria', 'panel');

    var empty = el('div', 'grc-empty');
    empty.id = 'crm-copilot-empty';
    var emptyIcon = el('div', 'grc-empty-icon');
    emptyIcon.setAttribute('aria-hidden', 'true');
    emptyIcon.innerHTML = SVG.sparkle;
    var emptyTitle = el('div', 'grc-empty-title');
    emptyTitle.setAttribute('data-i18n', 'welcome');
    emptyTitle.textContent = t('welcome');
    var emptySub = el('div', 'grc-empty-sub');
    emptySub.setAttribute('data-i18n', 'welcomeSub');
    emptySub.textContent = t('welcomeSub');
    var chips = el('div', 'grc-chips');
    for (var i = 0; i < 4; i++) {
      var chip = el('button', 'grc-chip', { type: 'button' });
      chip.setAttribute('data-i18n', 'chip' + i);
      chip.textContent = t('chip' + i);
      (function (idx) {
        chip.addEventListener('click', function () { submit(t('chip' + idx)); });
      })(i);
      chips.appendChild(chip);
    }
    empty.appendChild(emptyIcon);
    empty.appendChild(emptyTitle);
    empty.appendChild(emptySub);
    empty.appendChild(chips);
    log.appendChild(empty);

    // composer
    var form = el('form', 'grc-composer');
    form.id = 'crm-copilot-composer';
    var input = el('input', null, { id: 'crm-copilot-input', type: 'text', autocomplete: 'off' });
    input.setAttribute('data-i18n-ph', 'inputPh');
    input.placeholder = t('inputPh');
    input.setAttribute('aria-label', t('inputPh'));
    var send = el('button', null, { id: 'crm-copilot-send', type: 'submit' });
    send.setAttribute('data-i18n', 'send');
    send.textContent = t('send');
    form.appendChild(input);
    form.appendChild(send);

    panel.appendChild(header);
    panel.appendChild(settings);
    panel.appendChild(log);
    panel.appendChild(form);
    document.body.appendChild(panel);
    document.body.appendChild(bubble); // bubble harus ter-mount (dipakai setOpen/toggle)

    els = {
      root: panel,
      bubble: bubble,
      bubbleDot: bubbleDot,
      panel: panel,
      header: header,
      statusDot: dot,
      gear: gear,
      closeBtn: closeBtn,
      settings: settings,
      log: log,
      empty: empty,
      input: input,
      send: send,
      themeDark: themeDark,
      themeLight: themeLight,
      langId: langId,
      langEn: langEn,
      h_license: document.getElementById('grc-h-license'),
      h_license_v: document.getElementById('grc-h-license-v'),
      h_skills: document.getElementById('grc-h-skills'),
      h_skills_v: document.getElementById('grc-h-skills-v'),
      h_provider: document.getElementById('grc-h-provider'),
      h_provider_v: document.getElementById('grc-h-provider-v'),
    };

    // listeners
    bubble.addEventListener('click', toggle);
    closeBtn.addEventListener('click', function () { setOpen(false); });
    gear.addEventListener('click', function () { setSettingsOpen(els.settings.hidden); });
    themeDark.addEventListener('click', function () { setTheme('dark'); });
    themeLight.addEventListener('click', function () { setTheme('light'); });
    langId.addEventListener('click', function () { setLang('id'); });
    langEn.addEventListener('click', function () { setLang('en'); });
    form.addEventListener('submit', function (e) { e.preventDefault(); submit(); });
    document.addEventListener('click', function (e) {
      if (els.settings.hidden) return;
      var target = e.target;
      if (els.settings.contains(target)) return;
      if (target === els.gear || els.gear.contains(target)) return;
      setSettingsOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      ensurePanel();
      if (!els.settings.hidden) { setSettingsOpen(false); return; }
      if (els.panel.style.display !== 'none') setOpen(false);
    });

    return els.panel;
  }

  // ---------- init ----------
  ensurePanel();
  applyTheme();
  applyTexts();

  // Hook host/test: render kartu proposal & kontrol panel dari luar (terdokumentasi).
  window.crmCopilotPanel = {
    open: function () { setOpen(true); },
    close: function () { setOpen(false); },
    setLang: setLang,
    setTheme: setTheme,
    showProposalCard: function (p) {
      ensurePanel();
      var n = normalizeProposal(p);
      if (!n.leadId || !n.newStatus) return false;
      var row = el('div', 'grc-row grc-row--copilot');
      row.appendChild(renderProposalCard(n));
      hideEmpty();
      els.log.appendChild(row);
      scrollLog();
      return true;
    },
  };
})();
