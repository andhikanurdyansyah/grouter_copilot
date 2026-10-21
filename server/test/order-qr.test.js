/**
 * GET /api/orders — QR pembayaran milik order ikut tersedia utk PEMILIK
 * (qrImage/qrUrl dari createQris), dan TIDAK bocor utk order account lain.
 * Isolation: pola order-history.test.js (auth DB copy + clear sekali per file).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { mkdtempSync } from 'node:fs';
import { prepareAuthDb } from './helpers/auth-db-fixture.mjs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.KLIKQRIS_API_KEY ||= 'test-key';
process.env.KLIKQRIS_MERCHANT_ID ||= 'test-merchant';

const sharedDir = mkdtempSync(path.join(tmpdir(), 'copilot-orderqr-'));
process.env.AUTH_DB_FILE = path.join(sharedDir, 'auth.sqlite');
prepareAuthDb(process.env.AUTH_DB_FILE);

async function clearAuthDb(file) {
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(file);
  db.pragma('foreign_keys = OFF');
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  for (const { name } of tables) db.prepare('DELETE FROM "' + name + '"').run();
  db.close();
}
await clearAuthDb(process.env.AUTH_DB_FILE);

async function signUp(baseUrl, email) {
  const res = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:4601' },
    body: JSON.stringify({ email, password: `Gr0ut3r-${Math.random().toString(36).slice(2)}!Zq`, name: 'Order QR Test' }),
  });
  assert.equal(res.status, 200);
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

test('orders API exposes per-order QR to the owner and hides other accounts\' orders', async (t) => {
  const { createCopilotServer } = await import('../src/server.js');
  const dataFile = path.join(mkdtempSync(path.join(tmpdir(), 'copilot-orderqr-data-')), 'store.json');
  const app = createCopilotServer({ dataFile, fetch: async () => { throw new Error('no upstream in test'); } });
  await new Promise((resolve) => app.server.listen(0, resolve));
  t.after(() => new Promise((resolve) => app.server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;

  const emailA = `qrtest-a-${Math.random().toString(36).slice(2)}@example.com`;
  const cookieA = await signUp(baseUrl, emailA);
  // Trigger ensureAccount: request pertama dgn cookie A memasukkan akun ke store mirror
  await fetch(`${baseUrl}/api/orders`, { headers: { cookie: cookieA } });
  const accA = app.store.listAccounts().find((a) => a.email === emailA);
  assert.ok(accA, 'akun A harus sudah di-mirror ke store setelah request pertama');
  // account A punya order dgn QR miliknya
  app.store.addOrder({
    id: 'ord-qr-A', accountId: accA.id,
    packageKey: 'basic', planName: 'Basic', amount: 1000,
    status: 'PENDING', createdAt: Date.now(), paidAt: null,
    qrImage: 'data:image/png;base64,QR_A_IMAGE', qrUrl: 'https://klikqris.test/qr/A.png',
    signature: null, expiredAt: Date.now() + 3600_000,
  });

  const res = await fetch(`${baseUrl}/api/orders`, { headers: { cookie: cookieA } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.total, 1);
  const order = body.orders[0];
  assert.equal(order.id, 'ord-qr-A');
  assert.equal(order.qrImage, 'data:image/png;base64,QR_A_IMAGE', 'pemilik order harus menerima QR order-nya');
  assert.equal(order.qrUrl, 'https://klikqris.test/qr/A.png');

  // account B TIDAK melihat order A
  const cookieB = await signUp(baseUrl, `qrtest-b-${Math.random().toString(36).slice(2)}@example.com`);
  const resB = await fetch(`${baseUrl}/api/orders`, { headers: { cookie: cookieB } });
  const bodyB = await resB.json();
  assert.equal(bodyB.total, 0, 'order account lain tidak boleh terlihat');
  assert.ok(!JSON.stringify(bodyB).includes('QR_A_IMAGE'), 'QR image order A tidak boleh bocor ke account lain');
});
