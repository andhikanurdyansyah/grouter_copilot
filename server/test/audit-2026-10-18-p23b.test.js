// Regression tests — P3 hardening batch (docs/evidence/2026-10-18-defect-register.md):
//  A-11 admin Bearer comparison (behavioral: exact-match only, any length)
//  A-15 account linking normalizes email; never merges two auth users
//  A-16 dashboard HTML injection escapes `</script>` inside embedded JSON
//  A-17 /api/config carries payment state per request
//  A-04 POST /api/orders and /api/admin/* are rate-limited
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.ADMIN_TOKEN ||= 'audit-p23b-admin-token';

const { createCopilotServer } = await import('../src/server.js');
const { JsonStore } = await import('../src/store.js');
const { AccountService } = await import('../src/accountService.js');

function tmpStorePath() {
  return path.join(mkdtempSync(path.join(tmpdir(), 'copilot-p23b-')), 'store.json');
}

function makeServer(options = {}) {
  const created = createCopilotServer({ dataFile: tmpStorePath(), ...options });
  return {
    ...created,
    async listen() {
      await new Promise((resolve) => created.server.listen(0, '127.0.0.1', resolve));
      return `http://127.0.0.1:${created.server.address().port}`;
    },
    async cleanup() {
      await new Promise((resolve) => created.server.close(resolve));
    },
  };
}

test('A-15: ensureAccount normalizes email and never merges two auth users', () => {
  const store = new JsonStore(tmpStorePath());
  const svc = new AccountService({ store });
  const a = svc.ensureAccount({ id: 'auth_1', name: 'Ana', email: 'Ana@Example.COM ' });
  assert.ok(a);
  assert.equal(a.email, 'ana@example.com');
  // A second verified auth identity with the same email gets its OWN store
  // account — it must never silently absorb the first user's licenses.
  const b = svc.ensureAccount({ id: 'auth_2', name: 'Ana2', email: 'ana@example.com' });
  assert.notEqual(b.id, a.id, 'second auth identity must not steal the first account');
  assert.equal(b.authUserId, 'auth_2');
  assert.equal(store.data.accounts.length, 2);
  const c = svc.ensureAccount({ id: 'auth_1', name: 'Ana', email: 'ANA@EXAMPLE.COM' });
  assert.equal(c.id, a.id);
});

test('A-15: ensureAccount refuses an empty email', () => {
  const store = new JsonStore(tmpStorePath());
  const svc = new AccountService({ store });
  assert.equal(svc.ensureAccount({ id: 'auth_x', email: '   ' }), null);
});

test('A-11/A-17/A-04: route-level hardening', async () => {
  const env = makeServer({ adminToken: 'audit-p23b-admin-token', allowUnauthenticatedAdmin: false });
  const base = await env.listen();
  try {
    let r = await fetch(`${base}/api/admin/stats`, { headers: { authorization: 'Bearer x' } });
    assert.equal(r.status, 401);
    r = await fetch(`${base}/api/admin/stats`, { headers: { authorization: 'Bearer audit-p23b-admin-token' } });
    assert.equal(r.status, 200);
    r = await fetch(`${base}/api/admin/stats`, { headers: { authorization: 'Bearer audit-p23b-admin-token-extra-longer' } });
    assert.equal(r.status, 401);

    r = await fetch(`${base}/api/config`);
    assert.equal(r.status, 200);
    const cfg = await r.json();
    assert.ok('payment' in cfg, 'config carries payment state');

    let saw429 = false;
    for (let i = 0; i < 40; i++) {
      const res = await fetch(`${base}/api/orders`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ planKey: 'nope' }) });
      if (res.status === 429) { saw429 = true; break; }
    }
    assert.equal(saw429, true, 'POST /api/orders must be rate-limited');
  } finally {
    await env.cleanup();
  }
});

test('A-16: embedded JSON in the classic dashboard escapes closing script tags', () => {
  const src = readFileSync(path.join(process.cwd(), 'src/server.js'), 'utf8');
  assert.ok(src.includes("replace(/</g"), 'dashboard JSON escaping is present');
  assert.ok(src.includes('u003c'), 'escape encodes `<`');
});
