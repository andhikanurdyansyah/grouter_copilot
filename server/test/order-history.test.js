/**
 * GET /api/orders — customer order history (session-scoped, read-only).
 * Contract: 401 unauthenticated · hanya order milik akun sendiri · field
 * tersanitasi (sama dengan /api/orders/latest) · terurut terbaru dulu.
 *
 * Isolation: pola orders-ownership.test.js (auth DB copy + clear sekali per file).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { mkdtempSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.KLIKQRIS_API_KEY ||= 'test-key';
process.env.KLIKQRIS_MERCHANT_ID ||= 'test-merchant';

const sharedDir = mkdtempSync(path.join(tmpdir(), 'copilot-ordhist-'));
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
  const dataFile = path.join(mkdtempSync(path.join(tmpdir(), 'copilot-ordhist-store-')), 'store.json');
  const fakeFetch = async () => new Response(
    JSON.stringify({ status: true, data: { order_id: 'ord_x', status: 'PENDING' } }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
  const { server, store } = createCopilotServer({ dataFile, fetch: fakeFetch });
  // Seed katalog dengan harga nyata (default amount 0 → checkout diblokir
  // cost-integrity; pattern sama dengan cost-integrity.test.js).
  const { validateSettings } = await import('../src/settings.js');
  store.updateSettings(validateSettings({ plans: [
    { key: 'quota-3b-90d', name: '3B · 3 months', amount: 10000, currency: 'IDR', quota: '3B usage', quotaTokens: 3000000, features: ['core'], expiresInDays: 90, active: true },
    { key: 'quota-15b-365d', name: '15B · 1 year', amount: 20000, currency: 'IDR', quota: '15B usage', quotaTokens: 15000000, features: ['core', 'pro'], expiresInDays: 365, active: true },
    { key: 'custom', name: 'Custom', amount: 0, currency: 'IDR', quota: 'Custom usage', quotaTokens: null, features: ['core', 'pro', 'enterprise'], expiresInDays: 365, active: true },
  ] }));
  await new Promise((r) => server.listen(0, r));
  return { baseUrl: `http://127.0.0.1:${server.address().port}`, server };
}

async function signUp(baseUrl, email) {
  const res = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:4601' },
    body: JSON.stringify({ email, password: `Gr0ut3r-${Math.random().toString(36).slice(2)}!Zq`, name: 'Order History Test' }),
  });
  const body = await res.json().catch(() => ({}));
  assert.equal(res.status, 200, `sign-up failed: ${JSON.stringify(body)}`);
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
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

test('GET /api/orders: 401 tanpa sesi, kosong untuk akun baru, hanya order milik akun', async () => {
  const { baseUrl, server } = await startServer();
  try {
    // 401 tanpa sesi
    const anon = await req(baseUrl, 'GET', '/api/orders');
    assert.equal(anon.status, 401);

    const cookieA = await signUp(baseUrl, `ordhist-${Date.now()}-a@gmail.com`);
    const cookieB = await signUp(baseUrl, `ordhist-${Date.now()}-b@gmail.com`);

    // Akun baru → daftar kosong (bukan error)
    const empty = await req(baseUrl, 'GET', '/api/orders', undefined, cookieA);
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.json, { orders: [], total: 0 });

    // A membuat order → muncul di riwayat A, TIDAK di riwayat B
    const create = await req(baseUrl, 'POST', '/api/orders', { packageKey: 'quota-3b-90d' }, cookieA);
    assert.equal(create.status, 201);
    const mine = await req(baseUrl, 'GET', '/api/orders', undefined, cookieA);
    assert.equal(mine.status, 200);
    assert.equal(mine.json.total, 1);
    assert.equal(mine.json.orders[0].packageKey, 'quota-3b-90d');
    assert.equal(mine.json.orders[0].status, 'PENDING');

    const theirs = await req(baseUrl, 'GET', '/api/orders', undefined, cookieB);
    assert.equal(theirs.status, 200);
    assert.equal(theirs.json.total, 0);

    // Field tersanitasi: tidak ada kunci asing (qris/signature dsb) di payload
    const keys = Object.keys(mine.json.orders[0]);
    for (const forbidden of ['qris', 'signature', 'apikey', 'grouterApiKey']) {
      assert.ok(!keys.some((k) => k.toLowerCase().includes(forbidden)), `field terlarang: ${forbidden}`);
    }
  } finally {
    server.close();
  }
});
