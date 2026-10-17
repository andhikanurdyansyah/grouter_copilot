import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.KLIKQRIS_API_KEY ||= 'test-key';
process.env.KLIKQRIS_MERCHANT_ID ||= 'test-merchant';

const { createCopilotServer } = await import('../src/server.js');

async function start() {
  const dataFile = path.join(mkdtempSync(path.join(tmpdir(), 'copilot-receipt-')), 'store.json');
  const { server, store, service } = createCopilotServer({ dataFile });
  await new Promise((resolve) => server.listen(0, resolve));
  return { server, store, service, base: `http://127.0.0.1:${server.address().port}` };
}

async function signUp(base, suffix) {
  const res = await fetch(`${base}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:4601' },
    body: JSON.stringify({ email: `receipt-${Date.now()}-${suffix}@gmail.com`, password: `Gr0ut3r-${Math.random().toString(36).slice(2)}!Zq`, name: suffix }),
  });
  assert.equal(res.status, 200);
  return res.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
}

async function account(base, cookie) {
  const res = await fetch(`${base}/api/me`, { headers: { cookie } });
  assert.equal(res.status, 200);
  return (await res.json()).account.id;
}

function addPaid(store, accountId, id, licenseId, extra = {}) {
  store.addOrder({ id, accountId, packageKey: 'quota-15b-365d', planName: '15B · 1 year', amount: 125000, status: 'PAID', createdAt: 100, paidAt: 200, licenseId, ...extra });
}

async function getReceipt(base, id, cookie) {
  const res = await fetch(`${base}/api/me/orders/${encodeURIComponent(id)}/receipt`, { headers: { cookie } });
  return { status: res.status, body: await res.json() };
}

test('customer receipt materialization is authenticated, owned, paid, entitled, and secret-free', async () => {
  const { server, store, service, base } = await start();
  try {
    assert.equal((await getReceipt(base, 'missing', null)).status, 401);
    const cookieA = await signUp(base, 'a');
    const cookieB = await signUp(base, 'b');
    const accountA = await account(base, cookieA);
    const accountB = await account(base, cookieB);
    const license = service.issue({ customer: 'A', accountId: accountA, planKey: 'quota-15b-365d', features: ['core', 'pro'] }).record;
    const foreign = service.issue({ customer: 'B', accountId: accountB, planKey: 'quota-15b-365d', features: ['core', 'pro'] }).record;
    addPaid(store, accountA, 'receipt-a', license.id);
    addPaid(store, accountB, 'receipt-b', foreign.id);

    const cross = await getReceipt(base, 'receipt-b', cookieA);
    assert.equal(cross.status, 404);
    const result = await getReceipt(base, 'receipt-a', cookieA);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.receipt, {
      orderId: 'receipt-a', planName: '15B · 1 year', packageKey: 'quota-15b-365d', amount: 125000,
      status: 'PAID', createdAt: 100, paidAt: 200, licenseReference: license.id,
    });
    const serialized = JSON.stringify(result.body);
    for (const secret of ['token', 'signature', 'qrImage', 'qrUrl', 'grouterApiKey', 'apiKey', 'merchantId']) {
      assert.equal(serialized.includes(secret), false, `receipt must exclude ${secret}`);
    }
  } finally { server.close(); }
});

test('receipt denies unpaid, core-only, expired, and revoked licenses', async () => {
  const { server, store, service, base } = await start();
  try {
    const cookie = await signUp(base, 'gates');
    const owner = await account(base, cookie);
    const core = service.issue({ customer: 'core', accountId: owner, planKey: 'quota-3b-90d', features: ['core'] }).record;
    const expired = service.issue({ customer: 'expired', accountId: owner, planKey: 'quota-15b-365d', features: ['core', 'pro'], expiresInDays: -1 }).record;
    const revoked = service.issue({ customer: 'revoked', accountId: owner, planKey: 'quota-15b-365d', features: ['core', 'pro'] }).record;
    store.revokeLicense(revoked.id);
    addPaid(store, owner, 'unpaid', core.id, { status: 'PENDING' });
    addPaid(store, owner, 'core', core.id);
    addPaid(store, owner, 'expired', expired.id);
    addPaid(store, owner, 'revoked', revoked.id);

    assert.equal((await getReceipt(base, 'unpaid', cookie)).status, 409);
    assert.equal((await getReceipt(base, 'core', cookie)).status, 200);
    assert.equal((await getReceipt(base, 'expired', cookie)).status, 403);
    assert.equal((await getReceipt(base, 'revoked', cookie)).status, 403);
  } finally { server.close(); }
});
