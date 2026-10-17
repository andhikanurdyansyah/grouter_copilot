import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.KLIKQRIS_API_KEY ||= 'test-key';
process.env.KLIKQRIS_MERCHANT_ID ||= 'test-merchant';

const { createCopilotServer } = await import('../src/server.js');

async function start() {
  const dataFile = path.join(mkdtempSync(path.join(tmpdir(), 'copilot-export-')), 'store.json');
  const { server, store, service } = createCopilotServer({ dataFile });
  await new Promise((resolve) => server.listen(0, resolve));
  return { server, store, service, base: `http://127.0.0.1:${server.address().port}` };
}

async function signUp(base, suffix) {
  const res = await fetch(`${base}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:4601' },
    body: JSON.stringify({ email: `export-${Date.now()}-${suffix}@gmail.com`, password: `Gr0ut3r-${Math.random().toString(36).slice(2)}!Zq`, name: suffix }),
  });
  assert.equal(res.status, 200);
  return res.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
}

async function me(base, cookie) {
  const res = await fetch(`${base}/api/me`, { headers: { cookie } });
  assert.equal(res.status, 200);
  return res.json();
}

function csvRows(text) {
  return text.replace(/^\uFEFF/, '').trimEnd().split('\r\n');
}

test('customer exports enforce auth, entitlement, expiry, revoke, ownership, limits, BOM and CSV safety', async () => {
  const { server, store, service, base } = await start();
  try {
    assert.equal((await fetch(`${base}/api/me/usage/export`)).status, 401);
    const cookieA = await signUp(base, 'a');
    const cookieB = await signUp(base, 'b');
    const accountA = (await me(base, cookieA)).account.id;
    const accountB = (await me(base, cookieB)).account.id;

    const pro = service.issue({ customer: 'A', accountId: accountA, planKey: 'quota-15b-365d', features: ['core', 'pro'] });
    service.issue({ customer: 'B', accountId: accountB, planKey: 'quota-15b-365d', features: ['core', 'pro'] });
    const basic = service.issue({ customer: 'A basic', accountId: accountA, planKey: 'quota-3b-90d', features: ['core'] });
    const expired = service.issue({ customer: 'A expired', accountId: accountA, planKey: 'quota-15b-365d', features: ['core', 'pro'], expiresInDays: -1 });
    const revoked = service.issue({ customer: 'A revoked', accountId: accountA, planKey: 'quota-15b-365d', features: ['core', 'pro'] });
    store.revokeLicense(revoked.record.id);

    for (let i = 0; i < 5005; i += 1) {
      store.data.usage.push({ licenseId: pro.record.id, requestId: `req-${i}`, createdAt: i, skill: i === 4999 ? '=FORMULA' : 'skill', model: '+MODEL', inputTokens: 1, outputTokens: 2, totalTokens: 3, status: 'ok' });
    }
    store.data.usage.push({ licenseId: pro.record.id, requestId: 'formula', createdAt: 9999999999, skill: 'safe', model: 'safe', inputTokens: 1, outputTokens: 2, totalTokens: 3, status: 'ok' });
    store._save();
    store.addOrder({ accountId: accountA, id: 'order-a', createdAt: 1, packageKey: 'quota-15b-365d', planName: 'Pro', amount: 10, status: 'PAID' });
    store.addOrder({ accountId: accountB, id: 'order-b', createdAt: 2, packageKey: 'quota-15b-365d', planName: 'Other', amount: 20, status: 'PAID' });

    const basicRes = await fetch(`${base}/api/me/usage/export`, { headers: { cookie: cookieA } });
    assert.equal(basicRes.status, 200);
    const basicBytes = new Uint8Array(await basicRes.arrayBuffer());
    assert.deepEqual(Array.from(basicBytes.slice(0, 3)), [0xEF, 0xBB, 0xBF]);
    const basicText = new TextDecoder().decode(basicBytes);
    const basicRows = csvRows(basicText);
    assert.equal(basicRows.length, 5001);
    assert.equal(basicText.includes("'=FORMULA"), true);
    assert.equal(basicText.includes("'+MODEL"), true);
    assert.match(basicRes.headers.get('content-type'), /text\/csv/);
    assert.equal((await fetch(`${base}/api/me/orders/export`, { headers: { cookie: cookieA } })).status, 200);

    const other = await fetch(`${base}/api/me/usage/export`, { headers: { cookie: cookieB } });
    assert.equal(other.status, 200);
    const otherText = await other.text();
    assert.ok(!otherText.includes('req-0'));
    assert.equal(csvRows(otherText).length, 1, 'account B receives only the usage header');

    // The account is entitled through any active pro license, but malformed,
    // expired and revoked records must never be treated as an entitlement.
    assert.equal(store.getLicense(expired.record.id).expiresAt < Date.now(), true);
    assert.equal(store.getLicense(revoked.record.id).revokedAt != null, true);
  } finally {
    server.close();
  }
});

test('customer export denies an account with only a core plan', async () => {
  const { server, service, base } = await start();
  try {
    const cookie = await signUp(base, 'core');
    const account = (await me(base, cookie)).account.id;
    service.issue({ customer: 'Core', accountId: account, planKey: 'quota-3b-90d', features: ['core'] });
    assert.equal((await fetch(`${base}/api/me/usage/export`, { headers: { cookie } })).status, 403);
    assert.equal((await fetch(`${base}/api/me/orders/export`, { headers: { cookie } })).status, 403);
  } finally {
    server.close();
  }
});

test('customer exports deny accounts whose only premium license is expired or revoked', async () => {
  const { server, service, store, base } = await start();
  try {
    const expiredCookie = await signUp(base, 'expired-only');
    const expiredAccount = (await me(base, expiredCookie)).account.id;
    service.issue({ customer: 'Expired only', accountId: expiredAccount, planKey: 'quota-15b-365d', features: ['core', 'pro'], expiresInDays: -1 });

    const revokedCookie = await signUp(base, 'revoked-only');
    const revokedAccount = (await me(base, revokedCookie)).account.id;
    const revoked = service.issue({ customer: 'Revoked only', accountId: revokedAccount, planKey: 'quota-15b-365d', features: ['core', 'pro'] });
    store.revokeLicense(revoked.record.id);

    for (const cookie of [expiredCookie, revokedCookie]) {
      assert.equal((await fetch(`${base}/api/me/usage/export`, { headers: { cookie } })).status, 403);
      assert.equal((await fetch(`${base}/api/me/orders/export`, { headers: { cookie } })).status, 403);
    }
  } finally {
    server.close();
  }
});
