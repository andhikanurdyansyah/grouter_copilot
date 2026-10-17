/**
 * Malformed percent-encoding on the remaining parameterized handlers.
 *
 * Commit 7748efd added safeDecodePathSegment() for receipt / order poll /
 * order cancel / license-token. These handlers still compared the RAW
 * (still-percent-encoded) segment against store ids:
 *   POST /api/admin/licenses/:id/bind
 *   POST /api/admin/licenses/:id/revoke
 *   POST /api/admin/orders/:id/settle
 *   POST /api/me/notifications/:id/read
 * An authenticated request with a malformed segment (%E0%A4%A) must be a
 * predictable 400 {error:'invalid <resource> id'} — not a misleading 404
 * (and never a 500/crash/hang). Unauthorized requests keep returning 401
 * first: decoding must not weaken the auth ordering.
 *
 * Isolation: isolated DATA_FILE per server (mkdtemp store.json). The auth
 * DB is resolved by auth.js under NODE_ENV=test to an isolated temp copy
 * (schema seeded + cleared), mirroring server/test/customer-receipt.test.js
 * which relies on the same mechanism. Run with NODE_ENV=test.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const MALFORMED = '%E0%A4%A';
const ADMIN = 'malformed-decode-admin';

async function start(t, { fakeFetch } = {}) {
  const { createCopilotServer } = await import('../src/server.js');
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-malformed-decode-'));
  const app = createCopilotServer({
    dataFile: path.join(dir, 'store.json'),
    adminToken: ADMIN,
    allowUnauthenticatedAdmin: false,
    ...(fakeFetch ? { fetch: fakeFetch } : {}),
  });
  await new Promise((resolve) => app.server.listen(0, resolve));
  t.after(() => new Promise((resolve) => app.server.close(resolve)));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { ...app, base: `http://127.0.0.1:${app.server.address().port}` };
}

async function json(res) {
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function adminReq(base, method, p, body) {
  return json(await fetch(`${base}${p}`, {
    method,
    headers: {
      authorization: `Bearer ${ADMIN}`,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }));
}

async function signUp(base, suffix) {
  const res = await fetch(`${base}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:4601' },
    body: JSON.stringify({
      email: `malformed-decode-${Date.now()}-${suffix}@gmail.com`,
      password: `Gr0ut3r-${Math.random().toString(36).slice(2)}!Zq`,
      name: suffix,
    }),
  });
  assert.equal(res.status, 200);
  return res.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
}

test('malformed percent-encoding on admin license bind returns 400 invalid license id', async (t) => {
  const { base } = await start(t);

  const unauthenticated = await json(await fetch(`${base}/api/admin/licenses/${MALFORMED}/bind`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ grouterApiKey: 'test-key' }),
  }));
  assert.equal(unauthenticated.status, 401, 'admin auth must run before decoding');

  const result = await adminReq(base, 'POST', `/api/admin/licenses/${MALFORMED}/bind`, { grouterApiKey: 'test-key' });
  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { error: 'invalid license id' });
});

test('malformed percent-encoding on admin license revoke returns 400 invalid license id', async (t) => {
  const { base } = await start(t);

  const unauthenticated = await json(await fetch(`${base}/api/admin/licenses/${MALFORMED}/revoke`, { method: 'POST' }));
  assert.equal(unauthenticated.status, 401, 'admin auth must run before decoding');

  const result = await adminReq(base, 'POST', `/api/admin/licenses/${MALFORMED}/revoke`);
  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { error: 'invalid license id' });
});

test('malformed percent-encoding on admin order settle returns 400 invalid order id without upstream call', async (t) => {
  let upstreamCalls = 0;
  const fakeFetch = async () => {
    upstreamCalls += 1;
    return new Response(JSON.stringify({ status: true, data: { order_id: 'ord_x', amount: '1000.00', status: 'SUCCESS' } }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
  const { base } = await start(t, { fakeFetch });

  const unauthenticated = await json(await fetch(`${base}/api/admin/orders/${MALFORMED}/settle`, { method: 'POST' }));
  assert.equal(unauthenticated.status, 401, 'admin auth must run before decoding');

  const result = await adminReq(base, 'POST', `/api/admin/orders/${MALFORMED}/settle`);
  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { error: 'invalid order id' });
  assert.equal(upstreamCalls, 0, 'malformed order id must not reach KlikQRIS verification');
});

test('malformed percent-encoding on notification read returns 400 invalid notification id', async (t) => {
  const { base, store } = await start(t);

  const anonymous = await json(await fetch(`${base}/api/me/notifications/${MALFORMED}/read`, { method: 'POST' }));
  assert.equal(anonymous.status, 401, 'session auth must run before decoding');

  const cookie = await signUp(base, 'notif');
  const result = await json(await fetch(`${base}/api/me/notifications/${MALFORMED}/read`, {
    method: 'POST',
    headers: { cookie },
  }));
  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { error: 'invalid notification id' });

  // No regression: a legitimate (percent-encoded) notification id still marks read.
  const me = await json(await fetch(`${base}/api/me`, { headers: { cookie } }));
  assert.equal(me.status, 200);
  const note = store.addNotification({
    accountId: me.body.account.id,
    type: 'order.paid',
    dedupeKey: `malformed-decode-${Date.now()}`,
    title: 'T', titleEn: 'T', body: 'b', bodyEn: 'b',
  });
  assert.ok(note?.id);
  const read = await json(await fetch(`${base}/api/me/notifications/${encodeURIComponent(note.id)}/read`, {
    method: 'POST',
    headers: { cookie },
  }));
  assert.equal(read.status, 200);
  assert.equal(read.body.notification.id, note.id);
});

test('admin simple and legitimately encoded license ids still bind and revoke', async (t) => {
  const { base, service } = await start(t);
  const bindable = service.issue({ customer: 'Bind Target', features: ['core'] }).record;
  const revocable = service.issue({ customer: 'Revoke Target', features: ['core'] }).record;

  // Valid percent-encoding of a real id must decode before the store lookup.
  const bound = await adminReq(base, 'POST', `/api/admin/licenses/${encodeURIComponent(bindable.id)}/bind`, { grouterApiKey: 'test-key' });
  assert.equal(bound.status, 200);
  assert.equal(bound.body.license.id, bindable.id);
  assert.equal(bound.body.bound, true);

  const revoked = await adminReq(base, 'POST', `/api/admin/licenses/${encodeURIComponent(revocable.id)}/revoke`);
  assert.equal(revoked.status, 200);
  assert.equal(revoked.body.license.id, revocable.id);
  assert.ok(revoked.body.license.revokedAt != null);

  // Well-formed but unknown ids keep the existing 404 contract.
  assert.equal((await adminReq(base, 'POST', '/api/admin/licenses/lic_missing/bind', { grouterApiKey: 'test-key' })).status, 404);
  assert.equal((await adminReq(base, 'POST', '/api/admin/licenses/lic_missing/revoke')).status, 404);
});
