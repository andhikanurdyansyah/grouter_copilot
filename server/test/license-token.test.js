import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';

/**
 * Workstream A — license token recovery contract:
 *   1. owner re-retrieves their own token (lost-token recovery);
 *   2. another account CANNOT retrieve it (404, no existence leak);
 *   3. revoked license → token withheld (409 on direct fetch; null in list);
 *   4. unauthenticated → 401;
 *   5. list endpoint shows every owned license with usable tokens.
 * Uses the real in-process server (same pattern as order-history.test.js).
 */
async function startServer() {
  const { createCopilotServer } = await import('../src/server.js');
  const dataFile = path.join(mkdtempSync(path.join(tmpdir(), 'copilot-lictok-')), 'store.json');
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
    body: JSON.stringify({ email, password: `Gr0ut3r-${Math.random().toString(36).slice(2)}!Zq`, name: 'T' }),
  });
  assert.equal(res.status, 200);
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

test('license token recovery: owner yes, cross-account no, revoked withheld, 401 anon', async () => {
  const { baseUrl, server, store } = await startServer();
  try {
    const cookieA = await signUp(baseUrl, `lictok-${Date.now()}-a@gmail.com`);
    const cookieB = await signUp(baseUrl, `lictok-${Date.now()}-b@gmail.com`);

    // anon → 401
    assert.equal((await fetch(`${baseUrl}/api/me/licenses`)).status, 401);

    // A owns two licenses (minted server-side; both carry persisted tokens).
    // Resolve A's store account id from the /api/me payload (authoritative
    // mirror), then mint with that accountId bound.
    const me = await (await fetch(`${baseUrl}/api/me`, { headers: { cookie: cookieA } })).json();
    const accountA = me?.account?.id ?? null;
    assert.ok(accountA, 'account id must be resolvable from /api/me');
    const mint = async () => {
      const r = await fetch(`${baseUrl}/api/admin/licenses`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customer: 'qa', accountId: accountA }),
      });
      assert.equal(r.status, 201);
      return r.json();
    };
    const lic1 = await mint();
    const lic2 = await mint();

    // list → both, tokens present for owner
    const list = await fetch(`${baseUrl}/api/me/licenses`, { headers: { cookie: cookieA } });
    assert.equal(list.status, 200);
    const listJson = await list.json();
    assert.equal(listJson.total, 2);
    const listed = listJson.licenses.find((l) => l.id === lic1.license.id);
    assert.equal(typeof listed.token, 'string');
    assert.match(listed.token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.ok(!listed.token.startsWith('lic_'), 'token must be the signed token, not a License ID');

    // owner re-retrieves a single lost token
    const mine = await fetch(`${baseUrl}/api/me/licenses/${lic1.license.id}/token`, { headers: { cookie: cookieA } });
    assert.equal(mine.status, 200);
    const mineJson = await mine.json();
    assert.equal(mineJson.license.token, lic1.token);

    // cross-account: B gets 404 (no existence oracle)
    const foreign = await fetch(`${baseUrl}/api/me/licenses/${lic1.license.id}/token`, { headers: { cookie: cookieB } });
    assert.equal(foreign.status, 404);
    const foreignJson = await foreign.json();
    assert.ok(!JSON.stringify(foreignJson).includes('token'), 'no token material may leak cross-account');

    // revoked: token withheld (409 + no token in body; list also nulls it)
    const revoke = await fetch(`${baseUrl}/api/admin/licenses/${lic2.license.id}/revoke`, { method: 'POST' });
    assert.equal(revoke.status, 200);
    const revokedFetch = await fetch(`${baseUrl}/api/me/licenses/${lic2.license.id}/token`, { headers: { cookie: cookieA } });
    assert.equal(revokedFetch.status, 409);
    const revokedJson = await revokedFetch.json();
    assert.ok(revokedJson.license?.revokedAt, 'metadata still visible');
    assert.equal(revokedJson.license?.token ?? null, null, 'token must be withheld for revoked licenses');
    const listAfter = (await (await fetch(`${baseUrl}/api/me/licenses`, { headers: { cookie: cookieA } })).json());
    assert.equal(listAfter.licenses.find((l) => l.id === lic2.license.id).token ?? null, null);
  } finally {
    server.close();
  }
});
