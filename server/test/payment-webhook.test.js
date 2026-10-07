import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NODE_ENV ||= 'test';
process.env.KLIKQRIS_API_KEY ||= 'webhook-test-key';
process.env.KLIKQRIS_MERCHANT_ID ||= 'webhook-test-merchant';

const { createCopilotServer } = await import('../src/server.js');

async function fixture(t, upstreamId = 'local-order', upstreamStatus = 'SUCCESS', upstreamAmount = '1000.00') {
  let statusCalls = 0;
  const fakeFetch = async () => {
    statusCalls += 1;
    return new Response(JSON.stringify({ status: true, data: { order_id: upstreamId, amount: upstreamAmount, status: upstreamStatus } }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
  const dataFile = path.join(mkdtempSync(path.join(tmpdir(), 'copilot-webhook-')), 'store.json');
  const app = createCopilotServer({ dataFile, fetch: fakeFetch });
  await new Promise((resolve) => app.server.listen(0, resolve));
  t.after(() => new Promise((resolve) => app.server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;
  app.store.addOrder({
    id: 'local-order', accountId: 'account-1', packageKey: 'basic', planName: 'Basic',
    amount: 1000, status: 'PENDING', createdAt: Date.now(), paidAt: null,
  });
  return { ...app, baseUrl, statusCalls: () => statusCalls };
}

async function webhook(baseUrl, orderId = 'local-order', status = 'SUCCESS') {
  const response = await fetch(`${baseUrl}/api/payment/klikqris/webhook`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ order_id: orderId, status }),
  });
  return { status: response.status, body: await response.json() };
}

async function adminSettle(baseUrl, orderId) {
  const response = await fetch(`${baseUrl}/api/admin/orders/${orderId}/settle`, {
    method: 'POST', headers: { authorization: 'Bearer admin-test' },
  });
  return { status: response.status, body: await response.json() };
}

test('admin settle rejects pending upstream payment', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-admin-settle-'));
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ status: true, data: { order_id: 'ord_pending', status: 'PENDING' } }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
  const { server, store } = createCopilotServer({ dataFile: path.join(dir, 'store.json'), fetch: fakeFetch, adminToken: 'admin-test' });
  store.addOrder({ id: 'ord_pending', accountId: 'acc_1', packageKey: 'basic', amount: 1000, status: 'PENDING', createdAt: Date.now() });
  await new Promise((r) => server.listen(0, r));
  try {
    const res = await adminSettle(`http://127.0.0.1:${server.address().port}`, 'ord_pending');
    assert.equal(res.status, 409);
    assert.equal(store.getOrder('ord_pending').status, 'PENDING');
    assert.equal(store.listLicenses().length, 0);
    assert.equal(calls, 1);
  } finally { server.close(); }
});

test('admin settle rejects upstream amount mismatch', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-admin-amount-mismatch-'));
  const fakeFetch = async () => new Response(JSON.stringify({ status: true, data: { order_id: 'ord_pending', amount: '1001.00', status: 'SUCCESS' } }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
  const { server, store } = createCopilotServer({ dataFile: path.join(dir, 'store.json'), fetch: fakeFetch, adminToken: 'admin-test' });
  store.addOrder({ id: 'ord_pending', accountId: 'acc_1', packageKey: 'basic', amount: 1000, status: 'PENDING', createdAt: Date.now() });
  await new Promise((r) => server.listen(0, r));
  try {
    const res = await adminSettle(`http://127.0.0.1:${server.address().port}`, 'ord_pending');
    assert.equal(res.status, 409);
    assert.equal(store.getOrder('ord_pending').status, 'PENDING');
    assert.equal(store.listLicenses().length, 0);
  } finally { server.close(); }
});

test('admin settle rejects upstream order mismatch', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-admin-mismatch-'));
  const fakeFetch = async () => new Response(JSON.stringify({ status: true, data: { order_id: 'other-order', status: 'SUCCESS' } }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
  const { server, store } = createCopilotServer({ dataFile: path.join(dir, 'store.json'), fetch: fakeFetch, adminToken: 'admin-test' });
  store.addOrder({ id: 'ord_pending', accountId: 'acc_1', packageKey: 'basic', amount: 1000, status: 'PENDING', createdAt: Date.now() });
  await new Promise((r) => server.listen(0, r));
  try {
    const res = await adminSettle(`http://127.0.0.1:${server.address().port}`, 'ord_pending');
    assert.equal(res.status, 409);
    assert.equal(store.listLicenses().length, 0);
  } finally { server.close(); }
});


test('webhook rejects a paid status response with an amount different from the local order', async (t) => {
  const app = await fixture(t, 'local-order', 'SUCCESS', '1001.00');
  const result = await webhook(app.baseUrl);
  assert.equal(result.status, 200);
  assert.equal(result.body.ignored, 'unverified:amount_mismatch');
  assert.equal(app.store.getOrder('local-order').status, 'PENDING');
  assert.equal(app.store.listLicenses().length, 0);
});

test('webhook ignores paid status response for a mismatched upstream order ID', async (t) => {
  const app = await fixture(t, 'different-order', 'SUCCESS');
  const result = await webhook(app.baseUrl);
  assert.equal(result.status, 200);
  assert.equal(result.body.ignored, 'unverified:order_id_mismatch');
  assert.equal(app.store.getOrder('local-order').status, 'PENDING');
  assert.equal(app.store.listLicenses().length, 0);
});

test('webhook rejects unknown local order before contacting KlikQRIS', async (t) => {
  const app = await fixture(t);
  const result = await webhook(app.baseUrl, 'unknown-order');
  assert.equal(result.status, 404);
  assert.equal(app.statusCalls(), 0);
  assert.equal(app.store.listLicenses().length, 0);
});

test('webhook follows documented status contract when status signature is absent', async (t) => {
  const app = await fixture(t);
  const result = await webhook(app.baseUrl);
  assert.equal(result.status, 200);
  assert.equal(app.store.getOrder('local-order').status, 'PAID');
  assert.equal(app.store.listLicenses().length, 1);
});

test('duplicate verified paid webhook is idempotent', async (t) => {
  const app = await fixture(t);
  const first = await webhook(app.baseUrl);
  const paidAt = app.store.getOrder('local-order').paidAt;
  const second = await webhook(app.baseUrl);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(app.store.getOrder('local-order').status, 'PAID');
  assert.equal(app.store.getOrder('local-order').paidAt, paidAt);
  assert.equal(app.store.listLicenses().length, 1);
});

test('non-paid webhook claim is ignored without upstream verification', async (t) => {
  const app = await fixture(t);
  const result = await webhook(app.baseUrl, 'local-order', 'PENDING');
  assert.equal(result.status, 200);
  assert.equal(result.body.ignored, 'PENDING');
  assert.equal(app.statusCalls(), 0);
  assert.equal(app.store.getOrder('local-order').status, 'PENDING');
  assert.equal(app.store.listLicenses().length, 0);
});