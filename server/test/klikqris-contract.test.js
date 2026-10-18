/**
 * Wire-level contract test for the KlikQRIS HTTP client (server/src/klikqris.js).
 *
 * Unlike test/klikqris.test.js (injects `fetchImpl` — a fake `fetch`) and
 * test/payment-*.test.js / customer-register-to-chat.e2e (fake the whole
 * upstream inside the server), this suite lets the REAL client run its real
 * code path — URL construction, AbortSignal timeout, JSON serialization,
 * `res.json()` parsing, status mapping, KlikQrisError taxonomy — against a
 * local `http.createServer()` stub that speaks the provider's documented
 * wire format:
 *
 *   POST {base}/qris/create             { order_id, amount, id_merchant, keterangan }
 *   GET  {base}/qris/status/{order_id}
 *   Headers: x-api-key, id_merchant, Content-Type/Accept: application/json
 *   Envelope: { status: true|false, message, data: { order_id, nama_toko,
 *              amount, amount_uniq, total_amount, status, qris_url,
 *              qris_image, expired_at, paid_at, signature, keterangan } }
 *
 * KlikQRIS authenticates with the x-api-key header only — there is NO
 * request signing/HMAC in klikqris.js, and `signature` is a per-transaction
 * value RETURNED in the response envelope (document transactions carry one;
 * a missing inbound signature is deliberately not a decision input anywhere
 * in server.js). Test 1 therefore pins the exact auth headers determinism
 * instead of a signature.
 *
 * The stub asserts the exact outgoing request (method, path, headers,
 * JSON field names/values) and drives response handling for paid/pending/
 * unknown/malformed/timeout/order-id-mismatch cases. Nothing touches the
 * network, the store, or production data: the client is constructed
 * standalone with a 127.0.0.1 base URL.
 *
 * Run: NODE_ENV=test node --test test/klikqris-contract.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { KlikQris, KlikQrisError, PAID_STATES, TERMINAL_STATES, isPaidStatus } from '../src/klikqris.js';

const API_KEY = 'sk_contract_test';
const MERCHANT_ID = 'MCH-0042';
const ORDER_ID = 'ord_wire_contract_123';
// SHA-256('') — a stable per-transaction signature stand-in.
const STUB_SIGNATURE = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function closeServer(server) {
  return new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}

/**
 * Local stub speaking the KlikQRIS wire format. Captures every request's
 * method/url/headers/raw body BEFORE responding so tests assert the exact
 * bytes the client put on the wire.
 */
function startStub(handler) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const record = {
        method: req.method,
        url: req.url,
        headers: req.headers,
        rawBody: Buffer.concat(chunks).toString('utf8'),
      };
      requests.push(record);
      Promise.resolve(handler(req, res, record)).catch((err) => {
        console.error('klikqris-contract stub handler failed:', err);
        if (!res.headersSent && !res.writableEnded) {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ status: false, message: 'stub handler error' }));
        }
      });
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({
      server,
      requests,
      base: `http://127.0.0.1:${server.address().port}`,
      close: () => closeServer(server),
    }));
  });
}

function respondJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, { 'content-type': 'application/json', ...extraHeaders });
  res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
}

/** Real provider-shaped `data` object; `status: undefined` omits the field entirely. */
function statusData(status, overrides = {}) {
  const data = {
    order_id: ORDER_ID,
    nama_toko: 'gRouter Test Store',
    amount: '99000.00',
    amount_uniq: '825',
    total_amount: '99825.00',
    qris_url: 'https://sandbox.qris.example/qr/ord_wire_contract_123.png',
    qris_image: 'data:image/png;base64,iVBORw0KGgo=',
    expired_at: '2026-10-18 12:00:00',
    paid_at: null,
    signature: STUB_SIGNATURE,
    keterangan: 'gRouter Copilot Starter',
    ...overrides,
  };
  if (status !== undefined) data.status = status;
  return data;
}

function envelope(data, { ok = true, message = 'Transaction Created Successfully' } = {}) {
  return { status: ok, message, data };
}

function clientFor(base, overrides = {}) {
  return new KlikQris({ apiKey: API_KEY, merchantId: MERCHANT_ID, mode: 'sandbox', baseUrl: base, ...overrides });
}

/**
 * The caller's settlement guard, mirrored verbatim from server.js:
 *   webhook: `status.orderId !== orderId || !isPaidStatus(status.status)` → ignore
 *   admin settle: same pair of checks. A `true` here = license would issue.
 */
function wouldSettle(result, requestedOrderId) {
  return result.orderId === requestedOrderId && isPaidStatus(result.status);
}

test('wire contract: createQris sends exact POST /api/sandbox/qris/create request and maps PENDING envelope', async (t) => {
  const stub = await startStub(async (req, res) => respondJson(res, 200, envelope(statusData('PENDING'))));
  t.after(() => stub.close());

  const client = clientFor(stub.base);
  const out = await client.createQris({ orderId: ORDER_ID, amount: 99000, description: 'gRouter Copilot Starter' });

  // The request actually crossed a real HTTP socket.
  assert.equal(stub.requests.length, 1, 'exactly one request must reach the stub');
  const req0 = stub.requests[0];
  assert.equal(req0.method, 'POST');
  assert.equal(req0.url, '/api/sandbox/qris/create');

  // Auth is by header only (no HMAC signing exists in klikqris.js) and must
  // be identical on every call for fixed credentials — the deterministic
  // credential contract. `id_merchant` is sent both as a header and in body.
  assert.equal(req0.headers['x-api-key'], API_KEY);
  assert.equal(req0.headers.id_merchant, MERCHANT_ID);
  assert.equal(req0.headers['content-type'], 'application/json');
  assert.equal(req0.headers.accept, 'application/json');
  assert.equal(req0.headers.host, new URL(stub.base).host);
  assert.equal(Number(req0.headers['content-length']), Buffer.byteLength(req0.rawBody));

  // Exact wire body: provider field names, amount stays a JSON number.
  assert.deepEqual(JSON.parse(req0.rawBody), {
    order_id: ORDER_ID,
    amount: 99000,
    id_merchant: MERCHANT_ID,
    keterangan: 'gRouter Copilot Starter',
  });
  assert.equal(
    req0.rawBody,
    '{"order_id":"ord_wire_contract_123","amount":99000,"id_merchant":"MCH-0042","keterangan":"gRouter Copilot Starter"}',
  );

  // Response envelope -> normalized mapping (data.status is the status field,
  // amounts stay provider-shaped strings, paid_at passes through).
  assert.equal(out.orderId, ORDER_ID);
  assert.equal(out.status, 'PENDING');
  assert.equal(isPaidStatus(out.status), false, 'PENDING must never be treated as paid');
  assert.equal(out.amount, '99000.00');
  assert.equal(out.totalAmount, '99825.00');
  assert.equal(out.qrUrl, 'https://sandbox.qris.example/qr/ord_wire_contract_123.png');
  assert.equal(out.qrImage, 'data:image/png;base64,iVBORw0KGgo=');
  assert.equal(out.expiredAt, '2026-10-18 12:00:00');
  assert.equal(out.signature, STUB_SIGNATURE);
});

test('wire contract: status mapping — PAID/SUCCESS/SETTLEMENT are paid, PENDING/unknown/absent are not', async (t) => {
  const paidAt = '2026-10-18 09:30:00';
  const cases = [
    { wireStatus: 'SUCCESS', paid: true },
    { wireStatus: 'PAID', paid: true },
    { wireStatus: 'SETTLEMENT', paid: true },
    { wireStatus: 'PENDING', paid: false },
    { wireStatus: 'EXPIRED', paid: false },
    { wireStatus: 'FAILED', paid: false },
    { wireStatus: 'CANCELLED', paid: false },
    { wireStatus: 'SOMETHING_UNKNOWN', paid: false },
    { wireStatus: undefined, paid: false }, // provider omits data.status entirely
  ];
  for (const { wireStatus, paid } of cases) {
    const stub = await startStub(async (req, res) => respondJson(res, 200, envelope(statusData(wireStatus, { paid_at: paid ? paidAt : null }))));
    const client = clientFor(stub.base);
    try {
      const out = await client.checkStatus(ORDER_ID);
      assert.equal(stub.requests.length, 1, `${wireStatus}: request must reach the stub`);
      assert.equal(stub.requests[0].method, 'GET');
      assert.equal(stub.requests[0].url, `/api/sandbox/qris/status/${ORDER_ID}`);
      // klikqris.js: checkStatus maps data.status ?? 'UNKNOWN' (verbatim, no case folding).
      assert.equal(out.status, wireStatus ?? 'UNKNOWN', `${wireStatus}: normalized status`);
      assert.equal(isPaidStatus(out.status), paid, `${wireStatus}: paid-equivalence`);
      assert.equal(out.orderId, ORDER_ID);
      assert.equal(out.paidAt, paid ? paidAt : null);
      assert.equal(out.raw.status, wireStatus, `${wireStatus}: raw data.status passes through`);
      assert.equal(out.raw.order_id, ORDER_ID);
      assert.equal(wouldSettle(out, ORDER_ID), paid, `${wireStatus}: settlement guard`);
    } finally {
      await stub.close();
    }
  }
  // The paid/terminal vocabularies the webhook + poller rely on.
  assert.deepEqual([...PAID_STATES].sort(), ['PAID', 'SETTLEMENT', 'SUCCESS']);
  assert.ok(TERMINAL_STATES.has('EXPIRED') && TERMINAL_STATES.has('FAILED') && TERMINAL_STATES.has('CANCELLED'));
});

test('wire contract: checkStatus sends GET with no body and URL-encodes the order id', async (t) => {
  const stub = await startStub(async (req, res) => respondJson(res, 200, envelope(statusData('SUCCESS', { paid_at: '2026-10-18 09:30:00' }))));
  t.after(() => stub.close());

  const client = clientFor(stub.base);
  const out = await client.checkStatus('ord test/123?x');

  assert.equal(stub.requests.length, 1);
  const req0 = stub.requests[0];
  assert.equal(req0.method, 'GET');
  // encodeURIComponent is applied (klikqris.js:159): '/', '?' and ' ' must be
  // escaped or a crafted order id could smuggle path/query segments.
  assert.equal(req0.url, '/api/sandbox/qris/status/ord%20test%2F123%3Fx');
  assert.ok(!req0.url.includes('ord test'), 'order id must not appear unescaped on the wire');
  assert.equal(req0.rawBody, '', 'GET status check must send no body');
  assert.equal(req0.headers['content-length'], undefined);
  assert.equal(req0.headers['x-api-key'], API_KEY);

  assert.equal(out.status, 'SUCCESS');
  assert.equal(isPaidStatus(out.status), true);
  // Response echoes the real order_id, so it cannot settle the odd input id.
  assert.equal(out.orderId, ORDER_ID);
  assert.equal(wouldSettle(out, 'ord test/123?x'), false);
});

test('wire contract: a 2xx with an unparseable body throws instead of reporting UNKNOWN', async (t) => {
  const stub = await startStub(async (req, res) => respondJson(res, 200, 'this is {{ not json'));
  t.after(() => stub.close());

  const client = clientFor(stub.base);
  // Formerly klikqris.js swallowed the parse error (`res.json().catch(() => ({}))`)
  // before the status checks, so a 200 with a corrupt body resolved to
  // status 'UNKNOWN' — indistinguishable from a genuine unknown status. It could
  // never settle an order (not paid), but it hid a broken upstream response.
  // Now a 2xx without a parseable envelope is surfaced as an error so the caller
  // can retry/alert rather than treating garbage as an authoritative answer.
  await assert.rejects(
    () => client.checkStatus(ORDER_ID),
    (err) => err instanceof KlikQrisError && err.code === 'REQUEST_FAILED' && /unparseable/i.test(err.message),
  );
  assert.equal(stub.requests.length, 1, 'request must reach the stub before the body is read');
});

test('wire contract: plain-text 401/403 are classified AUTH_FAILED, not a generic failure', async (t) => {
  // Some gateways answer auth errors with a non-JSON body. Classifying those as
  // REQUEST_FAILED made an operator credential problem look like a transient
  // upstream fault (server.js maps AUTH_FAILED to 502 for checkout).
  for (const [status, body] of [[401, 'Unauthorized'], [403, 'Forbidden']]) {
    const stub = await startStub(async (req, res) => {
      res.writeHead(status, { 'content-type': 'text/plain' });
      res.end(body);
    });
    const client = clientFor(stub.base);
    try {
      await assert.rejects(
        () => client.checkStatus(ORDER_ID),
        (err) => err instanceof KlikQrisError && err.code === 'AUTH_FAILED',
        `HTTP ${status} with a plain-text body must be AUTH_FAILED`,
      );
    } finally {
      await stub.close();
    }
  }
});

test('wire contract: non-2xx with non-JSON body throws KlikQrisError (never an UNKNOWN status)', async (t) => {
  const stub = await startStub(async (req, res) => respondJson(res, 500, '<html><body>500 Internal Server Error</body></html>'));
  t.after(() => stub.close());

  const client = clientFor(stub.base);
  // klikqris.js:116-117: a bare-500 upstream failure must throw (webhook then
  // answers 502 and nothing settles), not resolve as a bogus status.
  await assert.rejects(
    () => client.checkStatus(ORDER_ID),
    (err) => err instanceof KlikQrisError && err.code === 'REQUEST_FAILED' && /KlikQRIS HTTP 500/.test(err.message),
  );
  assert.equal(stub.requests.length, 1);
});

test('wire contract: status:false envelope throws REQUEST_FAILED (provider-side error)', async (t) => {
  const stub = await startStub(async (req, res) => respondJson(res, 200, { status: false, message: 'Invalid order id', data: null }));
  t.after(() => stub.close());

  const client = clientFor(stub.base);
  await assert.rejects(
    () => client.checkStatus(ORDER_ID),
    (err) => err instanceof KlikQrisError && err.code === 'REQUEST_FAILED' && err.message === 'Invalid order id',
  );
  assert.equal(stub.requests.length, 1);
});

test('wire contract: 401 with status:false envelope throws AUTH_FAILED', async (t) => {
  const stub = await startStub(async (req, res) => respondJson(res, 401, { status: false, message: 'Unauthorized: Invalid API Key or Account Inactive', data: null }));
  t.after(() => stub.close());

  const client = clientFor(stub.base);
  await assert.rejects(
    () => client.createQris({ orderId: ORDER_ID, amount: 99000, description: 'x' }),
    (err) => err instanceof KlikQrisError && err.code === 'AUTH_FAILED'
      && /unauthorized/i.test(err.message) && !err.message.includes(API_KEY),
  );
  assert.equal(stub.requests.length, 1);
});

test('wire contract: unconfigured client fails closed before any network I/O', async (t) => {
  const stub = await startStub(async (req, res) => respondJson(res, 200, envelope(statusData('SUCCESS', { paid_at: '2026-10-18 09:30:00' }))));
  t.after(() => stub.close());

  const unconfigured = new KlikQris({ apiKey: '', merchantId: '', mode: 'sandbox', baseUrl: stub.base });
  assert.equal(unconfigured.configured, false);
  await assert.rejects(() => unconfigured.checkStatus(ORDER_ID), (err) => err instanceof KlikQrisError && err.code === 'NOT_CONFIGURED');
  await assert.rejects(() => unconfigured.createQris({ orderId: ORDER_ID, amount: 1000 }), (err) => err instanceof KlikQrisError && err.code === 'NOT_CONFIGURED');
  assert.equal(stub.requests.length, 0, 'an unconfigured client must not touch the wire');

  // Same guarantee for the default (env-backed) constructor: with no env
  // credentials it must fail closed, never fall back to a hard-coded key.
  //
  // The env vars are cleared for the duration of this check. Without that, the
  // assertion only holds on a machine where they happen to be unset: on a host
  // that exports real KlikQRIS credentials the constructor is legitimately
  // configured and the suite went red for a non-defect. A test must not depend
  // on the operator's shell environment.
  const savedApiKey = process.env.KLIKQRIS_API_KEY;
  const savedMerchant = process.env.KLIKQRIS_MERCHANT_ID;
  delete process.env.KLIKQRIS_API_KEY;
  delete process.env.KLIKQRIS_MERCHANT_ID;
  try {
    for (const params of [{}, { baseUrl: `http://127.0.0.1:9/api/sandbox?x=1` }]) {
      const client = new KlikQris(params);
      assert.equal(client.configured, false, `env credentials must stay unset, got configured=true for ${JSON.stringify(params)}`);
      await assert.rejects(() => client.checkStatus(ORDER_ID), (err) => err instanceof KlikQrisError && err.code === 'NOT_CONFIGURED');
      assert.equal(stub.requests.length, 0);
    }
  } finally {
    if (savedApiKey !== undefined) process.env.KLIKQRIS_API_KEY = savedApiKey;
    if (savedMerchant !== undefined) process.env.KLIKQRIS_MERCHANT_ID = savedMerchant;
  }
});

test('wire contract: request timeout aborts fast with a NETWORK error instead of hanging', async (t) => {
  const stub = await startStub(() => new Promise(() => { /* never responds */ }));
  t.after(() => stub.close());

  // AbortSignal.timeout(requestTimeoutMs) in _request (klikqris.js:105) must
  // turn a hung upstream into a fast KlikQrisError, never a hang or a success.
  const client = clientFor(stub.base, { requestTimeoutMs: 100 });
  const started = Date.now();
  await assert.rejects(
    () => client.checkStatus(ORDER_ID),
    (err) => err instanceof KlikQrisError && err.code === 'NETWORK' && err.cause != null,
  );
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 2000, `timeout must abort fast (took ${elapsed}ms)`);
  assert.equal(stub.requests.length, 1, 'the request must reach the stub before the timeout fires');
});

test('wire contract: order_id mismatch in status response is detectable by the caller (forgery guard)', async (t) => {
  // A response for a DIFFERENT (already paid) transaction must never settle
  // the requested order. checkStatus surfaces the upstream order_id verbatim
  // (result.orderId AND result.raw.order_id), so the server.js guard
  // `status.orderId !== orderId` can reject it.
  const stub = await startStub(async (req, res) => respondJson(res, 200, envelope(
    statusData('SUCCESS', { order_id: 'ord_someone_else_paid', paid_at: '2026-10-18 09:30:00' }),
  )));
  t.after(() => stub.close());

  const client = clientFor(stub.base);
  const out = await client.checkStatus(ORDER_ID);
  assert.equal(stub.requests.length, 1);
  assert.equal(out.status, 'SUCCESS');
  assert.equal(isPaidStatus(out.status), true, 'status alone looks paid — only the order id exposes the forgery');
  assert.equal(out.orderId, 'ord_someone_else_paid', 'checkStatus must surface the upstream order_id verbatim');
  assert.equal(out.raw.order_id, 'ord_someone_else_paid');
  assert.notEqual(out.orderId, ORDER_ID);
  assert.equal(wouldSettle(out, ORDER_ID), false, 'caller-side guard must refuse a mismatched paid status');
});

test('wire contract: order_id mismatch in createQris response is surfaced to the caller', async (t) => {
  const stub = await startStub(async (req, res) => respondJson(res, 200, envelope(
    statusData('PENDING', { order_id: 'ord_unrelated' }),
  )));
  t.after(() => stub.close());

  const client = clientFor(stub.base);
  const out = await client.createQris({ orderId: ORDER_ID, amount: 99000, description: 'gRouter Copilot Starter' });
  // createQris prefers data.order_id (klikqris.js:143) — a swapped id is
  // handed to the caller verbatim instead of being silently trusted as ours.
  assert.equal(out.orderId, 'ord_unrelated');
  assert.notEqual(out.orderId, ORDER_ID, 'caller can compare created orderId to the requested one');
  assert.equal(out.status, 'PENDING');
  assert.equal(wouldSettle({ orderId: out.orderId, status: out.status }, ORDER_ID), false);
});
