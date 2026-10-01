/**
 * Settings core tests — the single source of truth for runtime configuration.
 *
 * Covers: defaults parity with documented behaviour, deep-merge precedence
 * (defaults < env seeds < store), validation, secret masking, and the
 * /api/plans + /api/admin/settings endpoints.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Isolate: never touch production data. Dummy KlikQRIS creds so the payment
// feature reports "configured" without real credentials.
process.env.KLIKQRIS_API_KEY ||= 'test-key';
process.env.KLIKQRIS_MERCHANT_ID ||= 'test-merchant';
process.env.ADMIN_TOKEN = 'settings-test-token';

const {
  DEFAULT_SETTINGS, resolveSettings, validateSettings, stripMaskedSecrets,
  maskSettings, publicPlans, deepMerge, envSeeds, MASK,
} = await import('../src/settings.js');
const { createCopilotServer } = await import('../src/server.js');

function tmpStore() {
  return path.join(mkdtempSync(path.join(tmpdir(), 'copilot-settings-')), 'store.json');
}

async function req(baseUrl, method, pathname, body, token) {
  const res = await fetch(baseUrl + pathname, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

/* ---------------------------- pure module ---------------------------- */

test('defaults reflect documented behaviour (plans, license, limits)', () => {
  assert.equal(DEFAULT_SETTINGS.license.audience, 'grouter-copilot');
  assert.equal(DEFAULT_SETTINGS.license.defaultExpiresInDays, 365);
  assert.deepEqual(DEFAULT_SETTINGS.license.defaultFeatures, ['core']);
  assert.equal(DEFAULT_SETTINGS.limits.maxContextBytes, 32000);
  assert.equal(DEFAULT_SETTINGS.plans.length, 3);
  const pro = DEFAULT_SETTINGS.plans.find((p) => p.key === 'pro');
  assert.equal(pro.amount, 249000);
});

test('precedence: defaults < env seeds < store', () => {
  const env = { KLIKQRIS_MODE: 'production', GROUTER_CHECK_USAGE_URL: 'https://env.example/u' };
  const stored = { usage: { checkUsageUrl: 'https://store.example/u' } };
  const eff = resolveSettings(stored, env);
  // env seed wins over default …
  assert.equal(eff.payment.mode, 'production');
  // … but store wins over env seed.
  assert.equal(eff.usage.checkUsageUrl, 'https://store.example/u');
});

test('deepMerge replaces arrays wholesale (plans is a list, not element-merge)', () => {
  const merged = deepMerge({ plans: [{ key: 'a' }, { key: 'b' }] }, { plans: [{ key: 'c' }] });
  assert.deepEqual(merged.plans, [{ key: 'c' }]);
});

test('validateSettings rejects unknown sections and bad values', () => {
  assert.throws(() => validateSettings({ nope: 1 }), /Unknown settings section/);
  assert.throws(() => validateSettings({ payment: { mode: 'weird' } }), /sandbox.*production/);
  assert.throws(() => validateSettings({ plans: [{ key: 'x', name: 'X', amount: -1 }] }), /integer >= 0/);
  assert.throws(() => validateSettings({ plans: [{ key: 'x', name: 'X', amount: 1 }, { key: 'x', name: 'Y', amount: 2 }] }), /Duplicate plan key/);
  assert.throws(() => validateSettings({ auth: { minPasswordLength: 2 } }), /integer >= 6/);
});

test('secret masking + masked round-trip keeps stored secret', () => {
  const eff = resolveSettings({ payment: { apiKey: 'sk-super-secret-ABCD', merchantId: 'M-1234' } }, {});
  const masked = maskSettings(eff);
  assert.match(masked.payment.apiKey, /^••••/);
  assert.ok(!masked.payment.apiKey.includes('super-secret'), 'raw secret must not survive masking');
  assert.equal(masked.payment.apiKey, `${MASK}ABCD`);
  // PATCH echoing the mask back must not overwrite the stored secret.
  const stripped = stripMaskedSecrets({ payment: { apiKey: masked.payment.apiKey, mode: 'production' } });
  assert.equal(stripped.payment.apiKey, undefined);
  assert.equal(stripped.payment.mode, 'production');
});

test('publicPlans hides inactive plans and exposes safe fields only', () => {
  const eff = resolveSettings({ plans: [
    { key: 'a', name: 'A', amount: 1, active: true },
    { key: 'b', name: 'B', amount: 2, active: false },
  ] }, {});
  const plans = publicPlans(eff);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].key, 'a');
  assert.deepEqual(Object.keys(plans[0]).sort(), ['amount', 'currency', 'expiresInDays', 'features', 'key', 'name', 'quota']);
});

test('envSeeds only derives keys that are present', () => {
  assert.deepEqual(envSeeds({}), {});
  assert.deepEqual(envSeeds({ KLIKQRIS_MODE: 'sandbox' }), { payment: { mode: 'sandbox' } });
});

/* ---------------------------- endpoints ---------------------------- */

test('GET /api/plans is public and returns the catalogue', async () => {
  const { server } = createCopilotServer({ dataFile: tmpStore() });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const res = await req(base, 'GET', '/api/plans');
    assert.equal(res.status, 200);
    assert.equal(res.json.plans.length, 3);
    assert.equal(res.json.currency, 'IDR');
  } finally {
    server.close();
  }
});

test('/api/admin/settings requires admin; GET masks secrets; PATCH persists', async () => {
  const { server, store } = createCopilotServer({ dataFile: tmpStore() });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    // 401 without a token.
    assert.equal((await req(base, 'GET', '/api/admin/settings')).status, 401);

    // Seed a secret via env-less store write, then confirm GET masks it.
    store.updateSettings({ payment: { apiKey: 'sk-live-XYZW' } });
    const got = await req(base, 'GET', '/api/admin/settings', null, 'settings-test-token');
    assert.equal(got.status, 200);
    assert.equal(got.json.settings.payment.apiKey, `${MASK}XYZW`);
    assert.ok(!JSON.stringify(got.json).includes('sk-live-XYZW'), 'raw secret must never leave the admin API');

    // PATCH a plan price; masked secret echoed back must not clobber the stored one.
    const patched = await req(base, 'PATCH', '/api/admin/settings', {
      payment: { apiKey: `${MASK}XYZW` },
      plans: [{ key: 'pro', name: 'Pro', amount: 500000, expiresInDays: 30, features: ['core', 'pro'], active: true }],
    }, 'settings-test-token');
    assert.equal(patched.status, 200);
    assert.equal(patched.json.settings.plans.find((p) => p.key === 'pro').amount, 500000);
    // stored secret preserved
    assert.equal(store.getSettings().payment.apiKey, 'sk-live-XYZW');
    // public catalogue reflects the new price
    const pub = await req(base, 'GET', '/api/plans');
    assert.equal(pub.json.plans.find((p) => p.key === 'pro').amount, 500000);
  } finally {
    server.close();
  }
});