import test from 'node:test';
import assert from 'node:assert/strict';

import { KlikQris, KlikQrisError } from '../src/klikqris.js';

function makeClient({ apiKey = 'sk_test', merchantId = '123', mode = 'sandbox', fetchImpl } = {}) {
  return new KlikQris({ apiKey, merchantId, mode, fetchImpl });
}

test('createQris posts to sandbox base and returns normalized data', async () => {
  let captured;
  const fakeFetch = async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify({
      status: true,
      message: 'Transaction Created Successfully',
      data: { order_id: 'o1', amount: '10000.00', total_amount: '10825.00', status: 'PENDING', qris_url: 'https://.../sample.png', qris_image: 'data:image/png;base64,...', expired_at: '2026-10-01 02:55:45', signature: 'SANDBOX_SIG_...' },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const client = makeClient({ fetchImpl: fakeFetch });
  const out = await client.createQris({ orderId: 'o1', amount: 10000, description: 'test' });

  assert.equal(captured.url, 'https://klikqris.com/api/sandbox/qris/create');
  const body = JSON.parse(captured.init.body);
  assert.equal(body.order_id, 'o1');
  assert.equal(body.id_merchant, '123');
  assert.equal(out.orderId, 'o1');
  assert.equal(out.status, 'PENDING');
  assert.equal(out.qrUrl, 'https://.../sample.png');
});

test('production mode uses /api base (not sandbox)', async () => {
  let captured;
  const fakeFetch = async (url) => {
    captured = url;
    return new Response(JSON.stringify({ status: true, data: { order_id: 'o1', status: 'PENDING' } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const client = makeClient({ mode: 'production', fetchImpl: fakeFetch });
  await client.createQris({ orderId: 'o1', amount: 100 });
  assert.equal(captured, 'https://klikqris.com/api/qris/create');
});

test('createQris throws AUTH_FAILED on 401', async () => {
  const fakeFetch = async () => new Response(JSON.stringify({ status: false, message: 'Unauthorized: Invalid API Key or Account Inactive' }), { status: 401, headers: { 'content-type': 'application/json' } });
  const client = makeClient({ fetchImpl: fakeFetch });
  await assert.rejects(() => client.createQris({ orderId: 'o1', amount: 100 }), (e) => e instanceof KlikQrisError && e.code === 'AUTH_FAILED');
});

test('checkStatus returns data.status', async () => {
  const fakeFetch = async () => new Response(JSON.stringify({ status: true, data: { order_id: 'o1', status: 'PAID', paid_at: '2026-10-01 02:00:00' } }), { status: 200, headers: { 'content-type': 'application/json' } });
  const client = makeClient({ fetchImpl: fakeFetch });
  const out = await client.checkStatus('o1');
  assert.equal(out.status, 'PAID');
  assert.ok(out.paidAt);
});
