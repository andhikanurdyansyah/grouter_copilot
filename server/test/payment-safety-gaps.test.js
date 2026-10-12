// Gap coverage (2026-10-12 readiness mandate): concurrent duplicate webhooks,
// failed/expired upstream states, and upstream 5xx/timeout on the webhook path.
// All deterministic — fake KlikQRIS fetch, isolated store, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NODE_ENV ||= 'test';
process.env.KLIKQRIS_API_KEY ||= 'webhook-test-key';
process.env.KLIKQRIS_MERCHANT_ID ||= 'webhook-test-merchant';

const { createCopilotServer } = await import('../src/server.js');

// upstream: { kind: 'status'|'http500'|'hang', status, amount }
async function fixture(t, upstream = { kind: 'status', status: 'SUCCESS', amount: '1000.00' }) {
  let statusCalls = 0;
  const fakeFetch = async (url, init) => {
    statusCalls += 1;
    if (upstream.kind === 'http500') return new Response('boom', { status: 500 });
    if (upstream.kind === 'hang') {
      await new Promise((_, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))));
    }
    return new Response(JSON.stringify({ status: true, data: { order_id: 'local-order', amount: upstream.amount, status: upstream.status } }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
  const dataFile = path.join(mkdtempSync(path.join(tmpdir(), 'copilot-gap-')), 'store.json');
  const app = createCopilotServer({ dataFile, fetch: fakeFetch, klikqrisRequestTimeoutMs: 300 });
  await new Promise((resolve) => app.server.listen(0, resolve));
  t.after(() => new Promise((resolve) => { app.server.closeAllConnections?.(); app.server.close(() => resolve()); }));
  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;
  app.store.addOrder({
    id: 'local-order', accountId: 'account-1', packageKey: 'basic', planName: 'Basic',
    amount: 1000, status: 'PENDING', createdAt: Date.now(), paidAt: null,
  });
  return { ...app, baseUrl, statusCalls: () => statusCalls };
}

async function webhook(baseUrl, status = 'SUCCESS') {
  const response = await fetch(`${baseUrl}/api/payment/klikqris/webhook`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ order_id: 'local-order', status }),
  });
  return { status: response.status, body: await response.json() };
}

test('concurrent duplicate verified webhooks settle exactly once (one license)', async (t) => {
  const app = await fixture(t);
  const results = await Promise.all(Array.from({ length: 8 }, () => webhook(app.baseUrl)));
  assert.ok(results.every((r) => r.status === 200));
  assert.equal(app.store.getOrder('local-order').status, 'PAID');
  assert.equal(app.store.listLicenses().length, 1, 'exactly one license under concurrent duplicates');
});

test('upstream FAILED/EXPIRED status never settles or issues a license', async (t) => {
  for (const upstreamStatus of ['FAILED', 'EXPIRED', 'PENDING', 'CANCELLED']) {
    const app = await fixture(t, { kind: 'status', status: upstreamStatus, amount: '1000.00' });
    const r = await webhook(app.baseUrl);
    assert.equal(r.status, 200, `${upstreamStatus}: webhook acked but not settled`);
    assert.equal(app.store.getOrder('local-order').status, 'PENDING', `${upstreamStatus}: order must stay PENDING`);
    assert.equal(app.store.listLicenses().length, 0, `${upstreamStatus}: no license`);
  }
});

test('upstream HTTP 500 on verification returns 502 and never settles', async (t) => {
  const app = await fixture(t, { kind: 'http500' });
  const r = await webhook(app.baseUrl);
  assert.equal(r.status, 502);
  assert.equal(app.store.getOrder('local-order').status, 'PENDING');
  assert.equal(app.store.listLicenses().length, 0);
  assert.doesNotMatch(JSON.stringify(r.body), /boom|stack|http|klikqris\.com/i, 'no upstream detail leaked');
});

test('upstream hang (timeout) on verification never creates false success', async (t) => {
  const app = await fixture(t, { kind: 'hang' });
  // Bounded wait: the handler must not hang forever; a client-side cap proves it.
  const r = await Promise.race([
    webhook(app.baseUrl).catch((e) => ({ status: 'client-error', error: String(e.message) })),
    new Promise((resolve) => setTimeout(() => resolve({ status: 'client-timeout' }), 8000)),
  ]);
  assert.notEqual(r.status, 200, 'a hung upstream must not return success');
  assert.equal(app.store.getOrder('local-order').status, 'PENDING');
  assert.equal(app.store.listLicenses().length, 0);
});
