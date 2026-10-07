/**
 * Order ownership (session-scoping): an authenticated account must never read
 * another account's order, /latest must be empty for a fresh account, and the
 * cost-integrity rejection (client amount) must hold under a real session.
 *
 * Isolation: auth.js reads env ONCE at import time → point it at a temp auth
 * DB prepared BEFORE the first server.js import. A fresh/empty auth.sqlite
 * crashes Better Auth (SchemaMismatchError), so start from a copy of the
 * prod-schema DB with all rows cleared (same pattern as cost-integrity.test.js).
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

const sharedDir = mkdtempSync(path.join(tmpdir(), 'copilot-own-'));
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
  const dataFile = path.join(mkdtempSync(path.join(tmpdir(), 'copilot-own-store-')), 'store.json');
  // KlikQRIS is never reached by these tests (no checkout is completed), but a
  // fake fetch keeps every path local.
  const fakeFetch = async () => new Response(
    JSON.stringify({ status: true, data: { order_id: 'ord_x', status: 'PENDING' } }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
  const { server, store } = createCopilotServer({ dataFile, fetch: fakeFetch });
  await new Promise((r) => server.listen(0, r));
  return { baseUrl: `http://127.0.0.1:${server.address().port}`, server, store };
}

async function signUp(baseUrl, email) {
  const res = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:4601' },
    body: JSON.stringify({ email, password: `Gr0ut3r-${Math.random().toString(36).slice(2)}!Zq`, name: 'Ownership Test' }),
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

test('order reads are session-scoped: other accounts get 404 and empty latest', async () => {
  const { baseUrl, server, store } = await startServer();
  try {
    // Another account's order, seeded directly.
    store.addOrder({ id: 'ord_other', accountId: 'acc_someone_else', packageKey: 'basic', amount: 99000, status: 'PENDING', createdAt: Date.now() });

    const cookie = await signUp(baseUrl, `own-${Date.now()}@gmail.com`);

    // A different account's order must look like "not found" — never leak it.
    const peek = await req(baseUrl, 'GET', '/api/orders/ord_other', null, cookie);
    assert.equal(peek.status, 404);

    // A fresh account has no orders: /latest is 200 with order null.
    const latest = await req(baseUrl, 'GET', '/api/orders/latest', null, cookie);
    assert.equal(latest.status, 200);
    assert.equal(latest.json.order, null);

    // Cost-integrity holds under an authenticated session too.
    const cheat = await req(baseUrl, 'POST', '/api/orders', { amount: 1 }, cookie);
    assert.equal(cheat.status, 400);
    assert.match(String(cheat.json.error), /server-side/i);
  } finally {
    server.close();
  }
});
