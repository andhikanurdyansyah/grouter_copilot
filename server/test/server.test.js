import test from 'node:test';
import assert from 'node:assert/strict';

import { createCopilotServer } from '../src/server.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// The webhook tests inject a fake `fetch`; KlikQris still requires credentials
// to be "configured", so provide dummy values (never used — fetch is faked).
process.env.KLIKQRIS_API_KEY ||= 'test-key';
process.env.KLIKQRIS_MERCHANT_ID ||= 'test-merchant';

function startServer() {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-server-'));
  const dataFile = path.join(dir, 'store.json');
  const { server, service } = createCopilotServer({ dataFile });
  return new Promise((resolve) => {
    server.listen(0, () => {
      const { port } = server.address();
      resolve({ baseUrl: `http://127.0.0.1:${port}`, server, service });
    });
  });
}

async function req(baseUrl, method, p, body) {
  const res = await fetch(`${baseUrl}${p}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() };
}

test('issue → list → stats reflects the license', async () => {
  const { baseUrl, server } = await startServer();
  try {
    const issued = await req(baseUrl, 'POST', '/api/admin/licenses', { customer: 'Acme CRM', features: ['core'], expiresInDays: 30 });
    assert.equal(issued.status, 201);
    assert.ok(issued.json.token);

    const stats = await req(baseUrl, 'GET', '/api/admin/stats');
    assert.equal(stats.json.totalLicenses, 1);
    assert.equal(stats.json.activeLicenses, 1);

    const list = await req(baseUrl, 'GET', '/api/admin/licenses');
    assert.equal(list.json.licenses.length, 1);
    assert.equal(list.json.licenses[0].customer, 'Acme CRM');
    assert.equal(list.json.licenses[0].token, undefined); // raw token never listed
  } finally {
    server.close();
  }
});

test('heartbeat validates a real license and records an install', async () => {
  const { baseUrl, server } = await startServer();
  try {
    const issued = await req(baseUrl, 'POST', '/api/admin/licenses', { customer: 'POS X', features: ['core'] });
    const token = issued.json.token;

    const hb = await req(baseUrl, 'POST', '/api/heartbeat', { token, installId: 'install-1', baseUrl: 'https://api.grouter.io' });
    assert.equal(hb.status, 200);

    const stats = await req(baseUrl, 'GET', '/api/admin/stats');
    assert.equal(stats.json.totalInstalls, 1);
  } finally {
    server.close();
  }
});

test('heartbeat rejects a tampered token', async () => {
  const { baseUrl, server } = await startServer();
  try {
    const issued = await req(baseUrl, 'POST', '/api/admin/licenses', { customer: 'CRM', features: ['core'] });
    const parts = issued.json.token.split('.');
    const forged = `${parts[0]}.${Buffer.from('{"evil":true}').toString('base64url')}.${parts[2]}`;
    const hb = await req(baseUrl, 'POST', '/api/heartbeat', { token: forged, installId: 'x' });
    assert.equal(hb.status, 403);
  } finally {
    server.close();
  }
});

test('revoke flips the license to revoked and blocks heartbeat', async () => {
  const { baseUrl, server } = await startServer();
  try {
    const issued = await req(baseUrl, 'POST', '/api/admin/licenses', { customer: 'ERP', features: ['core'] });
    const id = issued.json.license.id;
    const token = issued.json.token;

    const revoke = await req(baseUrl, 'POST', `/api/admin/licenses/${id}/revoke`);
    assert.equal(revoke.status, 200);
    assert.ok(revoke.json.license.revokedAt);

    const hb = await req(baseUrl, 'POST', '/api/heartbeat', { token, installId: 'y' });
    assert.equal(hb.status, 403);
  } finally {
    server.close();
  }
});

test('admin console renders at /admin with placeholders replaced', async () => {
  const { baseUrl, server } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/admin`);
    const html = await res.text();
    assert.equal(res.status, 200);
    // Admin console shell + token gate must render.
    assert.match(html, /gRouter Copilot/);
    assert.match(html, /Admin/);
    assert.ok(!html.includes('__STATS_JSON__'));
  } finally {
    server.close();
  }
});

test('customer root is the intro page, while /copilot is the canonical landing', async () => {
  const { baseUrl, server } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/`);
    const html = await res.text();
    assert.equal(res.status, 200);
    assert.match(html, /Intelligent App Navigation/);
    assert.match(html, /location\.origin.*\/copilot/);
    const landing = await fetch(`${baseUrl}/copilot`);
    const landingHtml = await landing.text();
    assert.equal(landing.status, 200);
    assert.match(landingHtml, /Connect your existing tools/);
    assert.match(landingHtml, /Copilot Plans/);
  } finally {
    server.close();
  }
});

test('order access is session-scoped: unauthenticated requests are rejected', async () => {
  const { baseUrl, server } = await startServer();
  try {
    // No session cookie → /api/orders must not create, and reads must 401.
    // Body carries packageKey ONLY (A1): the amount is resolved server-side.
    const create = await req(baseUrl, 'POST', '/api/orders', { packageKey: 'basic' });
    assert.equal(create.status, 401);
    const latest = await req(baseUrl, 'GET', '/api/orders/latest');
    assert.equal(latest.status, 401);
    const one = await req(baseUrl, 'GET', '/api/orders/ord_whatever');
    assert.equal(one.status, 401);
  } finally {
    server.close();
  }
});

test('/success renders the payment landing page', async () => {
  const { baseUrl, server } = await startServer();
  try {
    const html = await (await fetch(`${baseUrl}/success`)).text();
    assert.match(html, /Memverifikasi pembayaran/);
    assert.match(html, /\/api\/orders\/latest/);
  } finally {
    server.close();
  }
});

test('/api/config advertises payment status (no secrets)', async () => {
  const { baseUrl, server } = await startServer();
  try {
    const res = await req(baseUrl, 'GET', '/api/config');
    assert.equal(res.status, 200);
    assert.ok(res.json.payment && typeof res.json.payment.enabled === 'boolean');
    assert.ok(['sandbox', 'production'].includes(res.json.payment.mode));
    const raw = JSON.stringify(res.json);
    assert.ok(!raw.includes('apiKey') && !raw.includes('api_key') && !raw.includes('merchantId'));
  } finally {
    server.close();
  }
});

test('webhook cannot forge a PAID: unverified order is ignored (no license)', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-forge-'));
  // Inject a KlikQRIS that reports PENDING — the source of truth says unpaid.
  const fakeFetch = async () => new Response(
    JSON.stringify({ status: true, data: { order_id: 'ord_forge', status: 'PENDING' } }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
  const { server } = createCopilotServer({ dataFile: path.join(dir, 'store.json'), fetch: fakeFetch });
  await new Promise((r) => server.listen(0, r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const res = await req(baseUrl, 'POST', '/api/payment/klikqris/webhook', { order_id: 'ord_forge', status: 'PAID' });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.match(String(res.json.ignored), /unverified/i); // forged PAID rejected
  } finally {
    server.close();
  }
});

test('webhook settles a verified SUCCESS (KlikQRIS uses SUCCESS, not PAID)', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-success-'));
  // Real KlikQRIS reports a completed payment as SUCCESS — accepting only PAID
  // would silently drop every real payment (no license issued).
  const fakeFetch = async () => new Response(
    JSON.stringify({ status: true, data: { order_id: 'ord_ok', status: 'SUCCESS', paid_at: '2026-10-01 11:27:35' } }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
  const { server, store } = createCopilotServer({ dataFile: path.join(dir, 'store.json'), fetch: fakeFetch });
  store.addOrder({ id: 'ord_ok', accountId: 'acc_y', packageKey: 'pro', amount: 249000, status: 'PENDING', createdAt: Date.now() });
  await new Promise((r) => server.listen(0, r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const res = await req(baseUrl, 'POST', '/api/payment/klikqris/webhook', { order_id: 'ord_ok', status: 'SUCCESS' });
    assert.equal(res.status, 200);
    assert.ok(res.json.licenseId, 'SUCCESS must issue a license');
    assert.equal(store.getOrder('ord_ok').status, 'PAID');
  } finally {
    server.close();
  }
});

test('webhook still twin-accepts legacy PAID claim', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-paid-'));
  // KlikQRIS is the source of truth: report the order PAID.
  const fakeFetch = async () => new Response(
    JSON.stringify({ status: true, data: { order_id: 'ord_paid', status: 'PAID', paid_at: '2026-10-01 11:27:35' } }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
  const { server, service, store } = createCopilotServer({ dataFile: path.join(dir, 'store.json'), fetch: fakeFetch });
  // Pre-seed the order (as if a customer had checked out).
  store.addOrder({ id: 'ord_paid', accountId: 'acc_x', packageKey: 'basic', amount: 99000, status: 'PENDING', createdAt: Date.now() });
  await new Promise((r) => server.listen(0, r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const first = await req(baseUrl, 'POST', '/api/payment/klikqris/webhook', { order_id: 'ord_paid', status: 'PAID' });
    assert.equal(first.status, 200);
    assert.equal(first.json.ok, true);
    assert.ok(first.json.licenseId, 'a license must be issued on verified payment');
    assert.equal(store.getOrder('ord_paid').status, 'PAID');

    // Second delivery of the same webhook must NOT issue a second license.
    const before = service.list().length;
    const second = await req(baseUrl, 'POST', '/api/payment/klikqris/webhook', { order_id: 'ord_paid', status: 'PAID' });
    assert.equal(second.status, 200);
    assert.equal(service.list().length, before, 'idempotent: no duplicate license');
  } finally {
    server.close();
  }
});
