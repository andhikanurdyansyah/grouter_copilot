/**
 * CopilotChat — React widget for gRouter Copilot.
 * Talks to the host app's own runtime endpoint (`/api/copilot/chat`),
 * never to gRouter directly (no key here).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function CopilotChat({
  endpoint = '/api/copilot/chat',
  userId,
  placeholder = 'Tanyakan sesuatu tentang data Anda…',
  title = 'Copilot',
  welcomeMessage = '',
  firstUseSetup = false,
  theme = {},
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);
  const [setupDone, setSetupDone] = useState(!firstUseSetup);
  const [setupOpen, setSetupOpen] = useState(firstUseSetup);
  const [position, setPosition] = useState({ x: 24, y: 24 });
  const dragRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!open) return undefined;
    const onMove = (event) => {
      if (!dragRef.current) return;
      const dx = event.clientX - dragRef.current.x;
      const dy = event.clientY - dragRef.current.y;
      const width = Math.min(360, window.innerWidth - 32);
      const height = Math.min(520, window.innerHeight - 48);
      setPosition({
        x: Math.min(Math.max(8, dragRef.current.left + dx), Math.max(8, window.innerWidth - width - 8)),
        y: Math.min(Math.max(8, dragRef.current.top + dy), Math.max(8, window.innerHeight - height - 8)),
      });
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
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setBusy(true);
    setError('');
    setStatus('retrieving');
    setMessages((m) => [...m, { role: 'user', content: text }]);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text, userId }),
      });
      const data = await res.json();
      if (!res.ok || data.status === 'error') {
        throw new Error(data.message || 'Request failed');
      }
      setStatus(data.status === 'partial' ? 'partial' : '');
      setMessages((m) => [...m, { role: 'assistant', content: data.answer, sources: data.sources }]);
    } catch (e) {
      setError(e.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }, [input, busy, endpoint, userId]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div style={{ position: 'fixed', left: position.x, top: position.y, zIndex: 2147483000, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {open ? (
        <section style={{ width: 'min(360px, calc(100vw - 32px))', height: 'min(520px, calc(100vh - 48px))', display: 'flex', flexDirection: 'column', border: '1px solid #d8e1e8', borderRadius: 16, overflow: 'hidden', background: theme.background ?? '#ffffff', color: theme.foreground ?? '#111827', boxShadow: '0 18px 54px rgba(15, 23, 42, .2)' }} role="dialog" aria-label={title}>
          <header onPointerDown={startDrag} style={{ touchAction: 'none', cursor: 'move', padding: '12px 16px', borderBottom: '1px solid #e5e7eb', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>{title}</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Tutup Copilot">×</button>
          </header>
          {setupOpen && !setupDone ? (
            <div role="dialog" aria-modal="true" aria-label="Penyiapan pertama" style={{ padding: 20, overflowY: 'auto' }}>
              <h2>Siapkan Copilot</h2>
              <p>Pastikan license aktif, route chat sudah dipasang di server aplikasi, dan minimal satu skill baca-saja sudah terdaftar.</p>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}><input type="checkbox" /> <span>Saya sudah menambahkan license ke environment server, bukan browser.</span></label>
              <p>Welcome message: {welcomeMessage || 'Halo! Apa yang ingin Anda cari?'}</p>
              <button type="button" onClick={() => { setSetupDone(true); setSetupOpen(false); }} style={{ marginTop: 16 }}>Selesai</button>
            </div>
          ) : (
            <>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid #eef1f4' }} aria-live="polite">{messages.length === 0 && (welcomeMessage || placeholder)}</div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                {messages.map((m, i) => (
                  <div key={i} style={{ marginBottom: 12, display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{ maxWidth: '85%', padding: '10px 14px', borderRadius: 12, whiteSpace: 'pre-wrap', background: m.role === 'user' ? (theme.accent ?? '#2563eb') : '#f3f4f6', color: m.role === 'user' ? '#fff' : (theme.foreground ?? '#111827') }}>
                      {m.content}
                      {m.sources?.length > 0 && <div style={{ fontSize: '0.75em', opacity: 0.7, marginTop: 6 }}>{m.sources.map((s) => s.label || JSON.stringify(s)).join(' · ')}</div>}
                    </div>
                  </div>
                ))}
                {busy && <div aria-live="polite" style={{ opacity: 0.6 }}>Mengambil data…</div>}
                {error && <p role="alert" style={{ color: '#dc2626', fontSize: '0.9em' }}>{error}</p>}
                <div ref={bottomRef} />
              </div>
              <footer style={{ borderTop: '1px solid #e5e7eb', padding: 8, display: 'flex', gap: 8 }}>
                <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} placeholder={placeholder} rows={1} aria-label={placeholder} style={{ flex: 1, resize: 'none', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontFamily: 'inherit', fontSize: '0.95em' }} disabled={busy} />
                <button onClick={send} disabled={busy || !input.trim()} style={{ padding: '0 16px', borderRadius: 8, border: 'none', background: theme.accent ?? '#2563eb', color: '#fff', fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', minWidth: 64 }}>Kirim</button>
              </footer>
            </>
          )}
        </section>
      ) : (
        <button type="button" onClick={() => { setOpen(true); if (!setupDone) setSetupOpen(true); }} onPointerDown={startDrag} aria-label={`Buka ${title}`} title="Geser untuk memindahkan" style={{ position: 'fixed', left: position.x, top: position.y, width: 58, height: 58, borderRadius: '50%', border: 0, background: theme.accent ?? '#2563eb', color: '#fff', fontSize: 24, boxShadow: '0 10px 30px rgba(15,23,42,.24)', cursor: 'grab', touchAction: 'none' }}>✦</button>
      )}
    </div>
  );
}

export default CopilotChat;
