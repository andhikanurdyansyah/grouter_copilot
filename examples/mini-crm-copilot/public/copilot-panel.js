// public/copilot-panel.js — panel chat demo (vanilla JS, tanpa build step).
// Panel demo MINI-CRM: memanggil endpoint /api/copilot/chat yang SAMA dengan
// widget produk. Label wajib 'Copilot (demo panel)' (lihat CONTRACT.md).
// Fitur: bubble kanan-bawah, busy state, sources, error, blok proposal JSON
// -> tombol "Terapkan perubahan" (window.crmApplyLeadUpdate, guarded), Escape close.
(function () {
  'use strict';

  var PANEL_W = 360;
  var PANEL_H = 520;
  var RESPONSIVE_MAX = 390;

  var els = {};

  function ensurePanel() {
    if (els.panel) return els.panel;

    var bubble = document.createElement('button');
    bubble.id = 'crm-copilot-bubble';
    bubble.type = 'button';
    bubble.setAttribute('aria-label', 'Buka Copilot (demo panel)');
    bubble.style.cssText =
      'position:fixed;right:20px;bottom:20px;z-index:9999;padding:12px 16px;border-radius:999px;' +
      'border:1px solid #3a3a3a;background:#1c1c1c;color:#f2f2f2;font-size:13px;cursor:pointer;' +
      'box-shadow:0 4px 14px rgba(0,0,0,.45);';
    bubble.textContent = 'Copilot (demo panel)';

    var panel = document.createElement('div');
    panel.id = 'crm-copilot-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Copilot (demo panel)');
    panel.style.cssText =
      'position:fixed;right:20px;bottom:72px;z-index:10000;width:' + PANEL_W + 'px;height:' + PANEL_H + 'px;' +
      'display:none;flex-direction:column;border:1px solid #3a3a3a;border-radius:12px;background:#161616;color:#f2f2f2;' +
      'box-shadow:0 8px 28px rgba(0,0,0,.55);overflow:hidden;font-family:system-ui,Segoe UI,sans-serif;font-size:13px;';

    var header = document.createElement('div');
    header.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;padding:10px 12px;' +
      'border-bottom:1px solid #2c2c2c;background:#1c1c1c;font-weight:600;flex:0 0 auto;';
    var title = document.createElement('span');
    title.textContent = 'Copilot (demo panel)';
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Tutup panel (Escape)');
    closeBtn.style.cssText = 'background:none;border:none;color:#9a9a9a;font-size:16px;cursor:pointer;padding:2px 6px;';
    closeBtn.textContent = '\u00d7';
    closeBtn.addEventListener('click', function () { setOpen(false); });
    header.appendChild(title);
    header.appendChild(closeBtn);

    var log = document.createElement('div');
    log.id = 'crm-copilot-log';
    log.style.cssText = 'flex:1 1 auto;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:8px;';

    var form = document.createElement('div');
    form.style.cssText = 'flex:0 0 auto;display:flex;gap:6px;padding:10px;border-top:1px solid #2c2c2c;background:#1c1c1c;';
    var input = document.createElement('input');
    input.id = 'crm-copilot-input';
    input.type = 'text';
    input.placeholder = 'Tanya CRM\u2026';
    input.style.cssText =
      'flex:1;padding:8px 10px;border-radius:8px;border:1px solid #3a3a3a;background:#101010;color:#f2f2f2;font-size:13px;';
    var send = document.createElement('button');
    send.id = 'crm-copilot-send';
    send.type = 'button';
    send.style.cssText =
      'padding:8px 12px;border-radius:8px;border:1px solid #3a3a3a;background:#2a2a2a;color:#f2f2f2;cursor:pointer;';
    send.textContent = 'Kirim';
    send.addEventListener('click', function () { submit(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
    });
    form.appendChild(input);
    form.appendChild(send);

    panel.appendChild(header);
    panel.appendChild(log);
    panel.appendChild(form);
    document.body.appendChild(panel);
    document.body.appendChild(bubble); // bubble harus ter-mount (dipakai setOpen/toggle)

    // Responsive <= 390px: panel memenuhi lebar layar.
    var mq = window.matchMedia('(max-width: ' + RESPONSIVE_MAX + 'px)');
    function applyResponsive() {
      if (mq.matches) {
        panel.style.right = '10px';
        panel.style.left = '10px';
        panel.style.width = 'auto';
        panel.style.height = '70vh';
        bubble.style.right = '10px';
        bubble.style.bottom = '10px';
      } else {
        panel.style.right = '20px';
        panel.style.left = 'auto';
        panel.style.width = PANEL_W + 'px';
        panel.style.height = PANEL_H + 'px';
        bubble.style.right = '20px';
        bubble.style.bottom = '20px';
      }
    }
    if (mq.addEventListener) mq.addEventListener('change', applyResponsive);
    else mq.addListener(applyResponsive);
    applyResponsive();

    els = { bubble: bubble, panel: panel, log: log, input: input, send: send, closeBtn: closeBtn };
    return els;
  }

  function setOpen(open) {
    ensurePanel();
    els.panel.style.display = open ? 'flex' : 'none';
    if (open) {
      els.bubble.style.display = 'none';
      els.input.focus();
    } else {
      els.bubble.style.display = 'block';
      els.bubble.focus();
    }
  }

  function toggle() {
    ensurePanel();
    setOpen(els.panel.style.display === 'none' || els.panel.style.display === '');
  }

  function addBubble(text, opts) {
    ensurePanel();
    var who = opts && opts.who ? opts.who : 'copilot';
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-direction:column;' + (who === 'user' ? 'align-items:flex-end;' : 'align-items:flex-start;');
    var b = document.createElement('div');
    b.style.cssText =
      'max-width:88%;white-space:pre-wrap;word-break:break-word;padding:8px 10px;border-radius:10px;line-height:1.45;';
    if (who === 'user') {
      b.style.background = '#2f2f2f';
      b.textContent = text;
    } else if (who === 'error') {
      b.style.background = '#3a1f1f';
      b.style.border = '1px solid #7a2e2e';
      b.textContent = text;
    } else {
      b.style.background = '#202020';
      b.style.border = '1px solid #2f2f2f';
      b.textContent = text;
    }
    row.appendChild(b);

    if (who === 'copilot' && opts && opts.sources && opts.sources.length) {
      var src = document.createElement('div');
      src.style.cssText = 'max-width:88%;font-size:11px;color:#9a9a9a;margin-top:-2px;';
      src.textContent = 'Sumber: ' + opts.sources.map(function (s) { return (s && s.label) || String(s); }).join('; ');
      row.appendChild(src);
    }
    if (who === 'copilot' && opts && opts.proposal) {
      row.appendChild(renderProposalCard(opts.proposal));
    }
    els.log.appendChild(row);
    els.log.scrollTop = els.log.scrollHeight;
    return row;
  }

  function setBusy(busy) {
    ensurePanel();
    els.send.disabled = busy;
    els.input.disabled = busy;
    els.send.textContent = busy ? 'Mengetik\u2026' : 'Kirim';
  }

  // Blok proposal JSON dalam answer (leadId, newStatus, reason) -> kartu + tombol.
  function extractProposal(answer) {
    if (!answer || typeof answer !== 'string') return null;
    var re = /\{[^{}]*"leadId"[\s\S]*?\}/g;
    var m;
    while ((m = re.exec(answer)) !== null) {
      try {
        var obj = JSON.parse(m[0]);
        if (obj && obj.leadId && obj.newStatus) {
          return {
            leadId: String(obj.leadId),
            newStatus: String(obj.newStatus),
            reason: obj.reason ? String(obj.reason) : '',
          };
        }
      } catch (e) { /* coba kandidat berikutnya */ }
    }
    return null;
  }

  function renderProposalCard(proposal) {
    var card = document.createElement('div');
    card.style.cssText =
      'max-width:88%;margin-top:4px;padding:8px 10px;border:1px solid #4a4a2e;border-radius:10px;background:#222214;';
    var info = document.createElement('div');
    info.style.cssText = 'font-size:12px;margin-bottom:6px;';
    info.textContent = 'Proposal: ubah status ' + proposal.leadId + ' \u2192 "' + proposal.newStatus + '".';
    if (proposal.reason) {
      var reason = document.createElement('div');
      reason.style.cssText = 'font-size:11px;color:#b9b9a2;margin-bottom:6px;';
      reason.textContent = proposal.reason;
      card.appendChild(info);
      card.appendChild(reason);
    } else {
      card.appendChild(info);
    }
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.style.cssText =
      'padding:6px 10px;border-radius:8px;border:1px solid #5a5a3a;background:#2e2e1c;color:#f2f2e2;cursor:pointer;font-size:12px;';
    btn.textContent = 'Terapkan perubahan';
    btn.addEventListener('click', function () {
      // Guard: fungsi apply milik demo (app.js milik agent CRM) — bila ada.
      if (typeof window.crmApplyLeadUpdate === 'function') {
        window.crmApplyLeadUpdate(proposal.leadId, proposal.newStatus, function () {
          btn.disabled = true;
          btn.textContent = 'Terkirim';
        });
      } else {
        btn.disabled = true;
        btn.textContent = 'crmApplyLeadUpdate tidak tersedia';
      }
    });
    card.appendChild(btn);
    return card;
  }

  async function submit() {
    ensurePanel();
    var text = els.input.value.trim();
    if (!text || els.send.disabled) return;
    els.input.value = '';
    addBubble(text, { who: 'user' });
    setBusy(true);
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
        addBubble('Error: ' + msg, { who: 'error' });
      } else {
        var answer = typeof data.answer === 'string' ? data.answer : JSON.stringify(data.answer ?? null);
        var proposal = extractProposal(answer);
        addBubble(answer || '(jawaban kosong)', { who: 'copilot', sources: data.sources || [], proposal: proposal });
      }
    } catch (err) {
      addBubble('Error: tidak dapat menghubungi server (' + (err && err.message ? err.message : 'network') + ').', { who: 'error' });
    } finally {
      setBusy(false);
    }
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      ensurePanel();
      if (els.panel && els.panel.style.display !== 'none') setOpen(false);
    }
  });

  ensurePanel();
  els.bubble.addEventListener('click', toggle);
})();
