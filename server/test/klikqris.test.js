import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { KlikQris, KlikQrisError } from '../src/klikqris.js';

function makeClient({ apiKey = 'sk_test', merchantId = '123', fetchImpl } = {}) {
  return new KlikQris({ apiKey, merchantId, mode: 'sandbox', fetchImpl });
}

test('createQris posts to /api/qris/create and returns normalized data', async () => {
  let captured;
  const fakeFetch = async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify({
      status: true,
      data: { order_id: 'o1', amount: 10000, qris_image: 'qr-image-string', qris_data: '000201...', expired_at: '2026-09-30T19:00:00Z' },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const client = makeClient({ fetchImpl: fakeFetch });
  const out = await client.createQris({ orderId: 'o1', amount: 10000, description: 'test' });

  assert.equal(captured.url, 'https://klikqris.com/api/qris/create');
  const body = JSON.parse(captured.init.body);
  assert.equal(body.order_id, 'o1');
  assert.equal(body.id_merchant, '123');
  assert.equal(out.orderId, 'o1');
  assert.equal(out.qrImage, 'qr-image-string');
});

test('createQris throws AUTH_FAILED on 401', async () => {
  const fakeFetch = async () => new Response(JSON.stringify({ status: false, message: 'Unauthorized: Invalid API Key or Account Inactive' }), { status: 401, headers: { 'content-type': 'application/json' } });
  const client = makeClient({ fetchImpl: fakeFetch });
  await assert.rejects(() => client.createQris({ orderId: 'o1', amount: 100 }), (e) => e instanceof KlikQrisError && e.code === 'AUTH_FAILED');
});

test('checkStatus returns payment_status', async () => {
  const fakeFetch = async () => new Response(JSON.stringify({ status: true, data: { payment_status: 'paid' } }), { status: 200, headers: { 'content-type': 'application/json' } });
  const client = makeClient({ fetchImpl: fakeFetch });
  const out = await client.checkStatus('o1');
  assert.equal(out.paymentStatus, 'paid');
});

test('verifyWebhookSignature validates HMAC-SHA256', async () => {
  const apiKey = 'secret-key';
  const client = new KlikQris({ apiKey, merchantId: '123', fetchImpl: async () => new Response('{}') });
  const payload = { order_id: 'o1', status: 'paid' };
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  const sig = crypto.createHmac('sha256', apiKey).update(canonical).digest('hex');
  assert.equal(client.verifyWebhookSignature(payload, sig), true);
  assert.equal(client.verifyWebhookSignature(payload, 'wrong'), false);
});
