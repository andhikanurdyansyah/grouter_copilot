/**
 * Mock upstream fetch for the isolated E2E backend.
 *
 * The backend routes ALL outbound traffic through a single injected `fetch`
 * (KlikQRIS create/status, gRouter chat completions, usage resolver). In the
 * isolated instance we replace it with this deterministic mock so:
 *   - no real network request ever leaves the machine,
 *   - no real credential is used,
 *   - responses are stable for assertions.
 *
 * Payment status defaults to PENDING (matching the specs, which deliberately do
 * NOT settle a payment). When E2E_PAY_SEAM=1 the mock reports SUCCESS, which
 * lets future specs exercise settle→license inside the isolated instance only —
 * the flag is ignored entirely unless the isolation guard already passed.
 */

const JSON_HEADERS = { 'content-type': 'application/json' };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export function createMockUpstream({ paySeam = false, log = () => {} } = {}) {
  let createdCount = 0;

  return async function mockFetch(url, init = {}) {
    const href = String(url);
    const method = (init.method || 'GET').toUpperCase();
    log(`[mock-upstream] ${method} ${href}`);

    // ── KlikQRIS: create QRIS ─────────────────────────────────────────────
    if (href.includes('/qris/create')) {
      const body = safeParse(init.body);
      const orderId = body.order_id ?? `mock_${++createdCount}`;
      const amount = Number(body.amount ?? 0);
      return json({
        status: true,
        message: 'ok (mock)',
        data: {
          order_id: orderId,
          nama_toko: 'E2E Mock Store',
          amount: String(amount),
          amount_uniq: '0',
          total_amount: String(amount),
          status: 'PENDING',
          qris_url: `https://mock.invalid/qris/${encodeURIComponent(orderId)}`,
          // Inline SVG QR placeholder — never a real provider payload.
          qris_image: 'data:image/svg+xml;base64,'
            + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#000"/></svg>').toString('base64'),
          expired_at: new Date(Date.now() + 15 * 60_000).toISOString().slice(0, 19).replace('T', ' '),
          signature: `mock-sig-${orderId}`,
          keterangan: body.keterangan ?? '',
        },
      });
    }

    // ── KlikQRIS: status ──────────────────────────────────────────────────
    if (href.includes('/qris/status/')) {
      const orderId = decodeURIComponent(href.split('/qris/status/')[1] || '');
      return json({
        status: true,
        data: {
          order_id: orderId,
          status: paySeam ? 'SUCCESS' : 'PENDING',
          amount: '0',
          paid_at: paySeam ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null,
        },
      });
    }

    // ── gRouter: chat completions ─────────────────────────────────────────
    if (href.includes('/v1/chat/completions')) {
      const body = safeParse(init.body);
      const lastUser = [...(body.messages || [])].reverse().find((m) => m.role === 'user');
      const content = `[mock] ${lastUser?.content ?? ''}`;
      const usage = { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 };
      if (body.stream) {
        const lines = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`
          + `data: ${JSON.stringify({ choices: [{ delta: {} }], usage })}\n\ndata: [DONE]\n\n`;
        return new Response(lines, { status: 200, headers: { 'content-type': 'text/event-stream' } });
      }
      return json({ choices: [{ message: { content } }], usage });
    }

    // ── gRouter: usage resolver (/check-usage) ────────────────────────────
    if (href.includes('/check-usage')) {
      return json({ status: true, data: { usage: 0, quota: 0, tokens: { input: 0, output: 0 } } });
    }

    // Any other outbound call is an isolation failure — fail loudly, never
    // silently succeed (a real provider call would otherwise slip through).
    throw new Error(`[mock-upstream] refused unexpected outbound request: ${method} ${href}`);
  };
}

function safeParse(s) {
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}
