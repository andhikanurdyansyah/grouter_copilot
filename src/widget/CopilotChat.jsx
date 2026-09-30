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
  theme = {},
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages]);

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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: '360px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        overflow: 'hidden',
        background: theme.background ?? '#ffffff',
        color: theme.foreground ?? '#111827',
      }}
      role="region"
      aria-label={title}
    >
      <header
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #e5e7eb',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>{title}</span>
        {status === 'retrieving' && <span aria-live="polite" style={{ fontSize: '0.8em', opacity: 0.7 }}>mengambil data…</span>}
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {messages.length === 0 && (
          <p style={{ opacity: 0.6, textAlign: 'center', marginTop: '24px' }}>{placeholder}</p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              marginBottom: '12px',
              display: 'flex',
              justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div
              style={{
                maxWidth: '85%',
                padding: '10px 14px',
                borderRadius: '12px',
                whiteSpace: 'pre-wrap',
                background: m.role === 'user' ? (theme.accent ?? '#2563eb') : '#f3f4f6',
                color: m.role === 'user' ? '#ffffff' : (theme.foreground ?? '#111827'),
              }}
            >
              {m.role === 'user' ? escapeHtml(m.content) : m.content}
              {m.sources?.length > 0 && (
                <div style={{ fontSize: '0.75em', opacity: 0.7, marginTop: '6px' }}>
                  {m.sources.map((s) => s.label || JSON.stringify(s)).join(' · ')}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div style={{ opacity: 0.6, fontSize: '0.9em' }}>…</div>
        )}
        {error && (
          <p role="alert" style={{ color: '#dc2626', fontSize: '0.9em' }}>{error}</p>
        )}
        <div ref={bottomRef} />
      </div>

      <footer style={{ borderTop: '1px solid #e5e7eb', padding: '8px', display: 'flex', gap: '8px' }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={1}
          style={{
            flex: 1,
            resize: 'none',
            padding: '10px 12px',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            fontFamily: 'inherit',
            fontSize: '0.95em',
          }}
          disabled={busy}
        />
        <button
          onClick={send}
          disabled={busy || !input.trim()}
          style={{
            padding: '0 16px',
            borderRadius: '8px',
            border: 'none',
            background: theme.accent ?? '#2563eb',
            color: '#ffffff',
            fontWeight: 600,
            cursor: busy ? 'not-allowed' : 'pointer',
            minWidth: '64px',
          }}
        >
          Kirim
        </button>
      </footer>
    </div>
  );
}

export default CopilotChat;
