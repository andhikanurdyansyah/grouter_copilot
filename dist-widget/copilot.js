/* gRouter Copilot — embed widget, framework-agnostic (vanilla JS, zero deps).
 * One <script src=".../copilot.js"> tag mounts a floating ✦ bubble + chat panel
 * on any site. Contract parity with the React widget: POST {message, history,
 * userId, token} to data-endpoint (default /api/copilot/chat, same-origin),
 * health GET for the first-run wizard. No credentials in the browser: token is
 * optional end-user token, never the license.
 */
(function () {
  'use strict';
  if (window.__grouterCopilotLoaded) return;
  window.__grouterCopilotLoaded = true;

  var script = document.currentScript;
  function cfg(key, fallback) {
    var v = script && script.getAttribute('data-' + key);
    return v !== null && v !== '' ? v : (window.GROUTER_COPILOT_CONFIG && window.GROUTER_COPILOT_CONFIG[key]) || fallback;
  }
  var endpoint = cfg('endpoint', null) || (script && sameDir('/api/copilot/chat')) || '/api/copilot/chat';
  var healthEndpoint = cfg('health-endpoint', null) || (script && sameDir('/api/copilot/health')) || '/api/copilot/health';
  var userId = cfg('user-id', null_emb());
  var token = cfg('token', '');
  var accent = cfg('accent', '#22d3ee');

  function null_emb() { return 'anon-' + Math.random().toString(36).slice(2, 8); }
  // Default both endpoints to the SAME origin that served this script (the
  // sidecar). Hosts that proxy /api/copilot/* can still override both via
  // data-endpoint / data-health-endpoint for a same-origin setup.
  function sameDir(p) {
    if (!script || !script.src) return null;
    try { return new URL(p, script.src).href; } catch (e) { return null; }
  }

  var L = {
    id: {
      setupTitle: 'Siapkan Copilot', setupBody: 'Pastikan server Copilot aktif berikut lisensinya. Klik Periksa untuk verifikasi.',
      check: 'Periksa', retry: 'Periksa ulang', start: 'Mulai bertanya', ok: 'Semua sistem siap',
      fail: 'Server belum siap', placeholder: 'Tanya apa saja…', send: 'Kirim', errorGeneric: 'Terjadi kesalahan. Coba lagi.',
      thinking: 'Menyusun jawaban…', sources: 'Sumber data'
    },
  };
  var lang = (function () { try { return localStorage.getItem('grouter-copilot-lang') || 'id'; } catch (e) { return 'id'; } })();
  var T = L[lang] || L.id;

  var style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = (script && script.src ? script.src.replace(/\/copilot\.js.*$/, '') : '') + '/copilot.css';
  document.head.appendChild(style);

  var bubble = el('button', 'grx-bubble');
  bubble.setAttribute('aria-label', 'Buka Copilot');
  bubble.innerHTML = '<span aria-hidden="true">✦</span>';
  var panelHost = el('div', 'grx-panel-host');
  document.body.appendChild(bubble);
  document.body.appendChild(panelHost);

  var open = false, setupDone = false, busy = false, messages = [], error = '';
  var panel;

  bubble.addEventListener('click', function () {
    open = !open;
    bubble.classList.toggle('is-open', open);
    if (open) render();
  });

  function el(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function render() {
    if (!panel) panel = buildPanel();
    panelHost.innerHTML = '';
    panelHost.appendChild(panel);
    if (!setupDone) renderSetup();
    else renderChat();
  }

  function buildPanel() {
    var p = el('div', 'grx-panel');
    var head = el('div', 'grx-head');
    head.innerHTML = '<div class="grx-head-bar"><strong>Copilot</strong><span class="grx-dot" aria-hidden="true"></span></div>';
    var close = el('button', 'grx-close');
    close.type = 'button';
    close.setAttribute('aria-label', 'Tutup');
    close.textContent = '×';
    close.addEventListener('click', function () { open = false; panelHost.innerHTML = ''; bubble.classList.remove('is-open'); });
    head.appendChild(close);
    p.appendChild(head);
    var body = el('div', 'grx-body');
    p.appendChild(body);
    return p;
  }

  function renderSetup() {
    var body = panel.querySelector('.grx-body');
    body.innerHTML = '<h3>' + esc(T.setupTitle) + '</h3><p class="grx-muted">' + esc(T.setupBody) + '</p>';
    var btn = el('button', 'grx-btn grx-btn-primary');
    btn.type = 'button';
    btn.textContent = T.check;
    btn.addEventListener('click', function () {
      btn.disabled = true;
      btn.textContent = '…';
      fetch(healthEndpoint, { cache: 'no-store' })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (r) {
          var checks = r.j && r.j.checks;
          if (r.ok && checks) {
            var bad = Object.keys(checks).filter(function (k) { return !checks[k]; });
            if (!bad.length) { setupDone = true; try { localStorage.setItem('grouter-copilot-setup-done', 'true'); } catch (e) {} render(); return; }
            throw new Error(T.fail + ': ' + bad.join(', '));
          }
          throw new Error(T.fail);
        })
        .catch(function (e) {
          btn.disabled = false;
          btn.textContent = T.retry;
          var m = body.querySelector('.grx-err');
          if (m) m.remove();
          var msg = el('p', 'grx-err');
          msg.textContent = e.message || T.fail;
          body.appendChild(msg);
        });
    });
    body.appendChild(btn);
    var err = el('p', 'grx-err');
    err.hidden = true;
    body.appendChild(err);
  }

  function renderChat() {
    var body = panel.querySelector('.grx-body');
    body.innerHTML = '';
    var log = el('div', 'grx-log');
    var form = el('div', 'grx-inputbar');
    var input = document.createElement('textarea');
    input.className = 'grx-input';
    input.rows = 1;
    input.placeholder = T.placeholder;
    var send = el('button', 'grx-btn grx-btn-primary');
    send.type = 'button';
    send.textContent = T.send;
    send.addEventListener('click', function () { submit(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    });
    form.appendChild(input);
    form.appendChild(send);
    body.appendChild(log);
    body.appendChild(form);
    drawLog();

    function scrollEnd() { log.scrollTop = log.scrollHeight; }
    function drawLog() {
      log.innerHTML = '';
      messages.forEach(function (m) {
        var row = el('div', 'grx-msg grx-msg-' + m.role);
        var label = el('div', 'grx-msg-label');
        label.textContent = m.role === 'user' ? 'Anda' : 'Copilot';
        var text = el('div', 'grx-msg-text');
        text.textContent = m.content;
        row.appendChild(label);
        row.appendChild(text);
        if (m.sources && m.sources.length) {
          var s = el('div', 'grx-src');
          s.textContent = T.sources + ': ' + m.sources.join(', ');
          row.appendChild(s);
        }
        log.appendChild(row);
      });
      if (busy) {
        var row = el('div', 'grx-msg grx-msg-assistant');
        row.innerHTML = '<div class="grx-msg-label">Copilot</div><div class="grx-msg-text grx-typing">' + esc(T.thinking) + '</div>';
        log.appendChild(row);
      }
      if (error) {
        var er = el('div', 'grx-err');
        er.textContent = error;
        log.appendChild(er);
      }
      scrollEnd();
    }

    function submit() {
      var text = input.value.trim();
      if (!text || busy) return;
      input.value = '';
      messages.push({ role: 'user', content: text });
      busy = true; error = '';
      drawLog();
      fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-10).slice(0, -1).map(function (m) { return { role: m.role, content: m.content }; }),
          userId: userId,
          token: token || undefined,
        }),
      })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (r) {
          busy = false;
          if (!r.ok || r.j.status === 'error') throw new Error(r.j.message || T.errorGeneric);
          messages.push({ role: 'assistant', content: r.j.answer, sources: r.j.sources });
          drawLog();
        })
        .catch(function (e) {
          busy = false;
          error = e.message || T.errorGeneric;
          drawLog();
        });
    }
  }
})();
