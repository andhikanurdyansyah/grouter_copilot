/**
 * Regression — admin license issuance must resolve entitlement SERVER-SIDE.
 *
 * Defect: POST /api/admin/licenses passed body.features / body.expiresInDays
 * straight to service.issue, so an operator (or a compromised/buggy admin
 * client) could widen entitlement beyond the purchased plan — e.g. plan
 * ['core']/90d widened to ['enterprise']/99999d — violating D-020 /
 * cost-entitlement integrity (the settlement path in paymentService.settlePaid
 * already resolves features/expires from the plan catalogue / license
 * defaults, never from client input).
 *
 * Contract:
 *  - valid planKey   → plan.features / plan.expiresInDays (falling back to
 *                      eff.license.defaultFeatures/defaultExpiresInDays only
 *                      when the plan field is absent); body is ignored.
 *  - absent/empty    → eff.license defaults; body is ignored.
 *  - unknown planKey → 400 (preserved, covered by admin-issue-plan-guard).
 *  - direct service.issue behaviour is untouched (used for fixtures).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCopilotServer } from '../src/server.js';

const DAY_MS = 86_400_000;

async function makeEnv(overrides = {}) {
  const initialSettings = {
    plans: [
      { key: 'test-plan-90d', name: 'Test 90d', amount: 10000, currency: 'IDR', quota: 'test', quotaTokens: 1000, features: ['core'], expiresInDays: 90, active: true },
      // Legacy plan without entitlement fields → must fall back to license defaults.
      { key: 'test-plan-legacy', name: 'Test Legacy', amount: 10000, currency: 'IDR', quota: 'test', quotaTokens: 1000, active: true },
    ],
    license: { defaultFeatures: ['default-only'], defaultExpiresInDays: 30 },
    ...overrides,
  };
  const { server, store, service } = createCopilotServer({ port: 0, adminToken: 'test-admin', initialSettings });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const req = async (path, method = 'GET', body = null) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-admin' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let json = null;
    try { json = await res.json(); } catch { /* no body */ }
    return { status: res.status, json };
  };
  return { server, store, service, req, close: () => new Promise((r) => server.close(r)) };
}

function assertDuration(license, days, label) {
  assert.ok(license, `${label}: license present`);
  assert.ok(Number.isFinite(license.expiresAt), `${label}: expiresAt must be finite, got ${license.expiresAt}`);
  assert.ok(Number.isFinite(license.createdAt), `${label}: createdAt must be finite`);
  const diff = license.expiresAt - license.createdAt;
  assert.ok(
    Math.abs(diff - days * DAY_MS) < 5_000,
    `${label}: expected ~${days}d duration, got ${diff / DAY_MS}d (expiresAt=${license.expiresAt}, createdAt=${license.createdAt})`,
  );
}

test('plan issuance ignores body entitlement override attempts (features + expires)', async () => {
  const env = await makeEnv();
  try {
    const r = await env.req('/api/admin/licenses', 'POST', {
      customer: 'Plan Buyer',
      planKey: 'test-plan-90d',
      features: ['enterprise'],
      expiresInDays: 99999,
    });
    assert.equal(r.status, 201, `expected 201, got ${r.status}: ${JSON.stringify(r.json)}`);
    assert.deepEqual(r.json.license.features, ['core'], 'returned license must carry plan features, not body features');
    assertDuration(r.json.license, 90, 'returned plan license');

    const stored = env.store.getLicense(r.json.license.id);
    assert.ok(stored, 'license must be stored');
    assert.deepEqual(stored.features, ['core'], 'stored license must carry plan features');
    assertDuration(stored, 90, 'stored plan license');
    assert.equal(stored.planKey, 'test-plan-90d');
  } finally { await env.close(); }
});

test('package-less issuance ignores body override attempts and uses license defaults', async () => {
  const env = await makeEnv();
  try {
    const r = await env.req('/api/admin/licenses', 'POST', {
      customer: 'No Package',
      features: ['enterprise'],
      expiresInDays: 99999,
    });
    assert.equal(r.status, 201, `expected 201, got ${r.status}: ${JSON.stringify(r.json)}`);
    assert.deepEqual(r.json.license.features, ['default-only'], 'returned license must carry configured defaults');
    assertDuration(r.json.license, 30, 'returned package-less license');

    const stored = env.store.getLicense(r.json.license.id);
    assert.deepEqual(stored.features, ['default-only']);
    assertDuration(stored, 30, 'stored package-less license');
    assert.equal(stored.planKey ?? null, null);
  } finally { await env.close(); }
});

test('empty planKey issuance also uses license defaults and ignores body', async () => {
  const env = await makeEnv();
  try {
    for (const planKey of ['', '   ']) {
      const r = await env.req('/api/admin/licenses', 'POST', {
        customer: 'Empty Key',
        planKey,
        features: ['enterprise'],
        expiresInDays: 99999,
      });
      assert.equal(r.status, 201, `planKey=${JSON.stringify(planKey)}: expected 201, got ${r.status}`);
      assert.deepEqual(r.json.license.features, ['default-only']);
      assertDuration(r.json.license, 30, `empty planKey ${JSON.stringify(planKey)}`);
    }
  } finally { await env.close(); }
});

test('plan without features/expires falls back to license defaults, ignoring body', async () => {
  const env = await makeEnv();
  try {
    const r = await env.req('/api/admin/licenses', 'POST', {
      customer: 'Legacy Plan',
      planKey: 'test-plan-legacy',
      features: ['enterprise'],
      expiresInDays: 99999,
    });
    assert.equal(r.status, 201, `expected 201, got ${r.status}: ${JSON.stringify(r.json)}`);
    assert.deepEqual(r.json.license.features, ['default-only'], 'absent plan features must fall back to defaults');
    assertDuration(r.json.license, 30, 'legacy plan fallback');
    const stored = env.store.getLicense(r.json.license.id);
    assert.deepEqual(stored.features, ['default-only']);
    assertDuration(stored, 30, 'stored legacy plan fallback');
  } finally { await env.close(); }
});

test('corrupt persisted settings cannot corrupt issuance (sane fallback chain)', async () => {
  // Persisted plan + license defaults are deliberately unusable: junk feature
  // entries, zero/negative durations. Issuance must sanitize/fall back — never
  // sign junk features or a NaN/negative expiry into a token.
  const env = await makeEnv({
    plans: [
      { key: 'test-plan-junk', name: 'Junk', amount: 10000, currency: 'IDR', quota: 'test', quotaTokens: 1000, features: [123, '', null], active: true },
      { key: 'test-plan-good', name: 'Good', amount: 10000, currency: 'IDR', quota: 'test', quotaTokens: 1000, features: ['core', 42, 'pro', ''], expiresInDays: 45, active: true },
    ],
    license: { defaultFeatures: 'not-an-array', defaultExpiresInDays: -7 },
  });
  try {
    const junk = await env.req('/api/admin/licenses', 'POST', { customer: 'Junk Plan', planKey: 'test-plan-junk' });
    assert.equal(junk.status, 201, `expected 201, got ${junk.status}`);
    // Junk plan features → non-array defaults → built-in DEFAULT_SETTINGS ['core'];
    // plan/default duration unusable → built-in 365d. Finite, sane, not widened.
    assert.deepEqual(junk.json.license.features, ['core']);
    assertDuration(junk.json.license, 365, 'corrupt settings fallback');

    const good = await env.req('/api/admin/licenses', 'POST', { customer: 'Good Plan', planKey: 'test-plan-good' });
    assert.equal(good.status, 201);
    assert.deepEqual(good.json.license.features, ['core', 'pro'], 'non-string/blank feature entries are filtered out');
    assertDuration(good.json.license, 45, 'good plan duration');
  } finally { await env.close(); }
});

test('malformed body entitlement values cannot widen or corrupt issuance', async () => {
  const env = await makeEnv();
  try {
    const attempts = [
      { features: 'enterprise', expiresInDays: '99999' },
      { features: 12345, expiresInDays: 'not-a-number' },
      { features: null, expiresInDays: null },
      { features: ['enterprise'], expiresInDays: -5 },
    ];
    for (const [i, attempt] of attempts.entries()) {
      const withPlan = await env.req('/api/admin/licenses', 'POST', {
        customer: `Malformed Plan ${i}`, planKey: 'test-plan-90d', ...attempt,
      });
      assert.equal(withPlan.status, 201, `attempt ${i} with plan: expected 201, got ${withPlan.status}`);
      assert.deepEqual(withPlan.json.license.features, ['core'], `attempt ${i} with plan: features`);
      assertDuration(withPlan.json.license, 90, `attempt ${i} with plan`);

      const noPlan = await env.req('/api/admin/licenses', 'POST', {
        customer: `Malformed NoPlan ${i}`, ...attempt,
      });
      assert.equal(noPlan.status, 201, `attempt ${i} without plan: expected 201, got ${noPlan.status}`);
      assert.deepEqual(noPlan.json.license.features, ['default-only'], `attempt ${i} without plan: features`);
      assertDuration(noPlan.json.license, 30, `attempt ${i} without plan`);
    }
  } finally { await env.close(); }
});
