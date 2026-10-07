/**
 * A1 cost-integrity (D-020): the price and entitlement of an order MUST come
 * from the server-side plan catalogue resolved by packageKey — never from the
 * request body. A signed-in customer who posts {packageKey:'pro', amount:1}
 * must be rejected, and a legit checkout must charge the plan price and issue
 * a license carrying the plan's features/expiresInDays (A3).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { mkdtempSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// KlikQris must be "configured" to reach the (faked) fetch path.
process.env.KLIKQRIS_API_KEY ||= 'test-key';
process.env.KLIKQRIS_MERCHANT_ID ||= 'test-merchant';

// auth.js reads env ONCE at import time → point it at ONE shared temp auth DB
// for this whole test file, prepared BEFORE the first server.js import.
// A fresh/empty auth.sqlite crashes Better Auth (SchemaMismatchError), so start
// from a copy of the prod-schema DB with all rows cleared.
const sharedDir = mkdtempSync(path.join(tmpdir(), 'copilot-a1-'));
process.env.AUTH_DB_FILE = path.join(sharedDir, 'auth.sqlite');
copyFileSync(path.join(__dirname, '..', 'data', 'auth.sqlite'), process.env.AUTH_DB_FILE);

async function clearAuthDb(file) {
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(file);
  db.pragma('foreign_keys = OFF');
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  for (const { name } of tables) db.prepare(`DELETE FROM "${name}"`).run();
  db.close();
}
await clearAuthDb(process.env.AUTH_DB_FILE);

async function startServer() {
  const { createCopilotServer } = await import('../src/server.js');
  const dataFile = path.join(mkdtempSync(path.join(tmpdir(), 'copilot-a1-store-')), 'store.json');
  // Fake KlikQRIS upstream (same pattern as the webhook tests): createQris
  // succeeds and reports the requested amount; nothing leaves the machine.
  const fakeFetch = async (url, init) => {
    const endpoint = String(url);
    if (endpoint.includes('/qris/status/')) {
      const orderId = decodeURIComponent(endpoint.split('/qris/status/')[1]);
      return new Response(
        JSON.stringify({ status: true, data: { order_id: orderId, amount: '12345.00', status: 'SUCCESS', paid_at: '2026-10-07 00:00:00' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    const body = JSON.parse(init?.body || '{}');
    return new Response(
      JSON.stringify({
        status: true,
        data: {
          order_id: body.order_id ?? 'ord_x',
          amount: String(body.amount ?? 0),
          total_amount: String(Number(body.amount ?? 0) + 825),
          status: 'PENDING',
          qris_url: 'https://sandbox.qris.example/qr.png',
          qris_image: 'data:image/png;base64,iVBORw0KGgo=',
          expired_at: '2026-12-31 23:59:59',
          signature: 'SANDBOX_SIG',
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  const { server, store } = createCopilotServer({ dataFile, fetch: fakeFetch });
  await new Promise((r) => server.listen(0, r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return { baseUrl, server, store };
}

async function signUp(baseUrl, email) {
  const res = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:4601' },
    body: JSON.stringify({ email, password: `Gr0ut3r-${Math.random().toString(36).slice(2)}!Zq`, name: 'A1 Test' }),
  });
  const body = await res.json().catch(() => ({}));
  assert.equal(res.status, 200, `sign-up failed: ${JSON.stringify(body)}`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  assert.ok(cookie, 'session cookie must be set');
  return cookie;
}

async function req(baseUrl, method, p, body, cookie) {
  const res = await fetch(`${baseUrl}${p}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

test('A1: body amount/description are rejected; price is resolved server-side', async () => {
  const { baseUrl, server, store } = await startServer();
  try {
    // This checkout test explicitly retains a priced fixture; launch defaults are zero-priced.
    const { validateSettings } = await import('../src/settings.js');
    store.updateSettings(validateSettings({ plans: [
      { key: 'quota-3b-90d', name: '3B · 3 months', amount: 0, currency: 'IDR', quota: '3B usage', features: ['core'], expiresInDays: 90, active: true },
      { key: 'quota-15b-365d', name: '15B · 1 year', amount: 0, currency: 'IDR', quota: '15B usage', features: ['core', 'pro'], expiresInDays: 365, active: true },
      { key: 'custom', name: 'Custom', amount: 0, currency: 'IDR', quota: 'Custom usage', features: ['core', 'pro'], expiresInDays: 365, active: true },
    ] }));
    const cookie = await signUp(baseUrl, `a1-${Date.now()}@gmail.com`);

    // A client-supplied amount must never be honoured.
    const cheat = await req(baseUrl, 'POST', '/api/orders', { packageKey: 'pro', amount: 1 }, cookie);
    assert.equal(cheat.status, 400);
    assert.match(String(cheat.json.error), /server-side/i);

    const cheatDesc = await req(baseUrl, 'POST', '/api/orders', { packageKey: 'pro', description: 'x' }, cookie);
    assert.equal(cheatDesc.status, 400);

    // Unknown / inactive package → 400.
    const unknown = await req(baseUrl, 'POST', '/api/orders', { packageKey: 'nope' }, cookie);
    assert.equal(unknown.status, 400);

    store.updateSettings(validateSettings({ plans: [
      { key: 'quota-3b-90d', name: '3B · 3 months', amount: 0, currency: 'IDR', quota: '3B usage', features: ['core'], expiresInDays: 90, active: true },
      { key: 'quota-15b-365d', name: '15B · 1 year', amount: 0, currency: 'IDR', quota: '15B usage', features: ['core', 'pro'], expiresInDays: 365, active: true },
      { key: 'custom', name: 'Custom', amount: 0, currency: 'IDR', quota: 'Custom usage', features: ['core', 'pro', 'enterprise'], expiresInDays: 365, active: true },
    ] }));
    const zeroPrice = await req(baseUrl, 'POST', '/api/orders', { packageKey: 'quota-3b-90d' }, cookie);
    assert.equal(zeroPrice.status, 409);
    assert.match(String(zeroPrice.json.error), /price is not configured/i);
    const custom = await req(baseUrl, 'POST', '/api/orders', { packageKey: 'custom' }, cookie);
    assert.equal(custom.status, 409);
    assert.match(String(custom.json.error), /sales quote/i);

    store.updateSettings(validateSettings({ plans: [
      { key: 'basic', name: 'Basic', amount: 99000, currency: 'IDR', quota: '5M tokens', features: ['core'], expiresInDays: 365, active: true },
      { key: 'pro', name: 'Pro', amount: 249000, currency: 'IDR', quota: '15M tokens', features: ['core', 'pro'], expiresInDays: 365, active: true },
      { key: 'custom', name: 'Custom', amount: 0, currency: 'IDR', quota: 'Custom usage', features: ['core', 'pro', 'enterprise'], expiresInDays: 365, active: true },
    ] }));

    // Restore priced legacy test fixture to prove server-side plan resolution.
    store.updateSettings(validateSettings({ plans: [
      { key: 'basic', name: 'Basic', amount: 99000, currency: 'IDR', quota: '5M tokens', features: ['core'], expiresInDays: 365, active: true },
      { key: 'pro', name: 'Pro', amount: 249000, currency: 'IDR', quota: '15M tokens', features: ['core', 'pro'], expiresInDays: 365, active: true },
    ] }));

    // Legit checkout: the order carries the configured plan amount (server-resolved).
    const ok = await req(baseUrl, 'POST', '/api/orders', { packageKey: 'pro' }, cookie);
    assert.equal(ok.status, 201);
    assert.equal(ok.json.order.amount, 249000);
    assert.equal(ok.json.order.packageKey, 'pro');
    assert.equal(ok.json.order.planName, 'Pro');
    assert.equal(ok.json.order.quota, '15M tokens');
  } finally {
    server.close();
  }
});

test('A1+A3: verified payment issues a license with the PLAN entitlement', async () => {
  const { baseUrl, server } = await startServer();
  try {
    const cookie = await signUp(baseUrl, `a3-${Date.now()}@gmail.com`);

    // Override the store settings: a custom plan proves entitlement is read
    // from the catalogue, not from defaults or client input.
    const patch = await req(baseUrl, 'PATCH', '/api/admin/settings', {
      plans: [
        {
          key: 'basic', name: 'Basic', amount: 99000, currency: 'IDR',
          quota: '5M tokens', features: ['core'], expiresInDays: 365, active: true,
        },
        {
          key: 'test30', name: 'Test 30 Hari', amount: 12345, currency: 'IDR',
          quota: '2M tokens', features: ['core', 'beta'], expiresInDays: 30, active: true,
        },
      ],
    });
    assert.equal(patch.status, 200, `settings patch failed: ${JSON.stringify(patch.json)}`);

    const order = await req(baseUrl, 'POST', '/api/orders', { packageKey: 'test30' }, cookie);
    assert.equal(order.status, 201);
    const orderId = order.json.order.id;
    assert.equal(order.json.order.amount, 12345);

    // Simulate the verified payment callback; test server upstream reports the
    // matching order as paid, so webhook verification remains in the path.
    const settle = await req(baseUrl, 'POST', '/api/payment/klikqris/webhook', { order_id: orderId, status: 'SUCCESS' });
    assert.equal(settle.status, 200, `settle failed: ${JSON.stringify(settle.json)}`);

    // The license must carry the plan entitlement (A3), not hardcoded values.
    const me = await req(baseUrl, 'GET', '/api/me', null, cookie);
    assert.equal(me.status, 200);
    const lic = (me.json.licenses || []).find((l) => l.customer === 'Test 30 Hari');
    assert.ok(lic, 'license named after the plan must exist');
    assert.deepEqual(lic.features, ['core', 'beta']);
    const expectedExp = order.json.order.createdAt + 30 * 24 * 3600 * 1000;
    assert.ok(Math.abs(lic.expiresAt - expectedExp) < 5000, `expiresAt ~ +30d (got ${lic.expiresAt})`);
  } finally {
    server.close();
  }
});
