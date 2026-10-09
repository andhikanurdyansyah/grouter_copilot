/**
 * D-021 Copilot backend AI gateway — automated coverage (no real key, no real
 * network): a fake provider fetchImpl stands in for gRouter; the license
 * service, store, and HTTP surface are the real production ones.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createCopilotServer } from '../src/server.js';
import { createGateway } from '../src/gateway.js';
import { JsonStore } from '../src/store.js';
import { LicenseService } from '../src/licenseService.js';
import { mintLicense } from '../../src/license/validate.js';

const MESSAGES = [
  { role: 'system', content: 'Answer only from the data provided.' },
  { role: 'user', content: 'summarize sales' },
];

const TINY_PLANS = {
  plans: [
    { key: 'tiny', name: 'Tiny', amount: 0, currency: 'IDR', quota: 'tiny', quotaTokens: 3000, features: ['core'], expiresInDays: 90, active: true },
    { key: 'micro', name: 'Micro', amount: 0, currency: 'IDR', quota: 'micro', quotaTokens: 20, features: ['core'], expiresInDays: 90, active: true },
  ],
};

function makeServer({ fetchImpl, apiKey = null, settingsPatch = null } = {}) {
  // The gateway adapter reads the credential from the server-side env AT
  // CONSTRUCTION — tests must set it before creating the server.
  const prev = process.env.GROUTER_API_KEY;
  if (apiKey !== null) process.env.GROUTER_API_KEY = apiKey;
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-gateway-'));
  const created = createCopilotServer({
    dataFile: path.join(dir, 'store.json'),
    fetch: fetchImpl,
    initialSettings: settingsPatch,
  });
  created.server.listen(0, () => {});
  const { port } = created.server.address();
  return {
    ...created,
    baseUrl: `http://127.0.0.1:${port}`,
    cleanup() {
      created.server.close();
      if (apiKey !== null) {
        if (prev === undefined) delete process.env.GROUTER_API_KEY;
        else process.env.GROUTER_API_KEY = prev;
      }
    },
  };
}

function okProvider({ answer = 'total is 42', usage = { prompt_tokens: 12, completion_tokens: 8 } } = {}) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(url, 'https://prod.grouter.web.id/v1/chat/completions');
    assert.ok(String(init.headers.authorization || '').startsWith('Bearer '), 'provider call must carry the service credential');
    assert.ok(!String(init.headers.authorization).includes('undefined'), 'credential must be resolved');
    assert.equal(body.model, 'grouter-default');
    return new Response(
      JSON.stringify({ choices: [{ message: { content: answer } }], usage }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
}

test('gateway: valid license + mocked gRouter success (usage reconciled, reservation released)', async () => {
  const env = makeServer({ fetchImpl: okProvider(), apiKey: 'test-service-key' });
  try {
    const { record, token } = env.service.issue({ customer: 'CRM', planKey: 'quota-3b-90d' });
    const out = await env.gateway.chat({ token, messages: MESSAGES });
    assert.equal(out.status, 'ok', JSON.stringify(out));
    assert.equal(out.answer, 'total is 42');
    assert.deepEqual(out.usage, { inputTokens: 12, outputTokens: 8 });
    assert.equal(out.licenseId, record.id);
    assert.equal(out.quota.unit, 'tokens');
    assert.equal(out.quota.limit, 3_000_000);
    assert.equal(out.quota.usedTokens, 20);
    const rec = env.store.getUsageRecord(out.requestId);
    assert.equal(rec.status, 'ok');
    assert.equal(rec.reservedTokens, 0, 'reservation released after reconciliation');
    assert.equal(rec.totalTokens, 20);
    assert.ok(!JSON.stringify(out).includes('test-service-key'), 'credential never in responses');
  } finally {
    env.cleanup();
  }
});

test('gateway: quota exhausted before call (rejected, nothing further charged)', async () => {
  const env = makeServer({ fetchImpl: okProvider(), apiKey: 'k', settingsPatch: TINY_PLANS });
  try {
    const { token } = env.service.issue({ customer: 'TINY', planKey: 'micro' }); // 20-token quota
    const first = await env.gateway.chat({ token, messages: MESSAGES, requestId: 'req_drain_1' });
    assert.equal(first.status, 'ok', JSON.stringify(first)); // charges 20/20
    const second = await env.gateway.chat({ token, messages: MESSAGES, requestId: 'req_drain_2' });
    assert.equal(second.status, 'error');
    assert.equal(second.code, 'QUOTA_EXHAUSTED');
    const rec = env.store.getUsageRecord('req_drain_2');
    assert.equal(rec.status, 'rejected');
    assert.equal(rec.reservedTokens, 0);
    assert.equal(env.store.usageTotals(env.service.list()[0].id).usedTokens, 20, 'only the successful call is charged');
  } finally {
    env.cleanup();
  }
});

test('gateway: concurrent in-flight requests hold reservations (no quota bypass)', async () => {
  const env = makeServer({
    fetchImpl: async () => new Response(
      JSON.stringify({ choices: [{ message: { content: 'x' } }], usage: { prompt_tokens: 500, completion_tokens: 500 } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
    apiKey: 'k',
    settingsPatch: TINY_PLANS,
  });
  try {
    const { token } = env.service.issue({ customer: 'CC', planKey: 'tiny' });
    // 3000-token quota, 2000-token reservations: only ONE request can hold a
    // reservation at a time; the other 9 concurrent ones must be REJECTED
    // (reserved = 2000 >= remaining 1000), not silently admitted.
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => env.gateway.chat({ token, messages: MESSAGES, requestId: `req_cc_${i}` })),
    );
    const admitted = results.filter((r) => r.status === 'ok');
    const rejected = results.filter((r) => r.code === 'QUOTA_EXHAUSTED');
    assert.equal(admitted.length + rejected.length, 10);
    assert.ok(admitted.length >= 1 && admitted.length <= 2, `reservations must bound concurrent admission (got ${admitted.length})`);
    const okRecords = env.store.data.usage.filter((u) => u.status === 'ok');
    assert.equal(okRecords.length, admitted.length);
    const totals = env.store.usageTotals(env.service.list()[0].id);
    assert.ok(totals.usedTokens <= 3000, `charged tokens must stay within quota (got ${totals.usedTokens})`);
  } finally {
    env.cleanup();
  }
});

test('gateway: invalid, revoked, and expired licenses rejected', async () => {
  const env = makeServer({ fetchImpl: okProvider(), apiKey: 'k' });
  try {
    const bad = await env.gateway.chat({ token: 'not-a-token', messages: MESSAGES });
    assert.equal(bad.code, 'LICENSE_INVALID');

    const { record, token } = env.service.issue({ customer: 'REV' });
    env.service.revoke(record.id);
    const revoked = await env.gateway.chat({ token, messages: MESSAGES });
    assert.equal(revoked.code, 'LICENSE_REVOKED');

    // Expired: mint a token whose exp is already in the past (exp is SECONDS).
    const expiredToken = mintLicense({
      privateKeyPem: env.keys.privateKeyPem,
      payload: { aud: env.service.audience, lic: 'lic_expired', customer: 'OLD', features: ['core'] },
      expiresAt: Math.floor(Date.now() / 1000) - 1,
    });
    const expired = await env.gateway.chat({ token: expiredToken, messages: MESSAGES });
    assert.equal(expired.code, 'LICENSE_INVALID');
  } finally {
    env.cleanup();
  }
});

test('gateway: missing service credential fails closed (no unauthenticated provider call)', async () => {
  let providerCalled = 0;
  const env = makeServer({
    fetchImpl: async () => { providerCalled++; return new Response('{}', { status: 200 }); },
    apiKey: '',
  });
  try {
    const { token } = env.service.issue({ customer: 'NOK' });
    const out = await env.gateway.chat({ token, messages: MESSAGES });
    assert.equal(out.status, 'error');
    assert.equal(out.code, 'NOT_CONFIGURED');
    assert.equal(providerCalled, 0, 'provider must not be called without the credential');
  } finally {
    env.cleanup();
  }
});

test('gateway: gRouter auth failure, timeout, malformed upstream (never charged, safe codes)', async () => {
  const cases = [
    { name: 'auth failure', fetch: async () => new Response('{"error":"API key required"}', { status: 401 }), expectCode: 'UPSTREAM_UNAVAILABLE' },
    { name: 'timeout', fetch: (url, init) => new Promise((resolve, reject) => {
      const t = setTimeout(() => resolve(new Response('{}', { status: 200 })), 1300);
      // Real fetch rejects via AbortSignal; the fake must do the same.
      init.signal?.addEventListener('abort', () => { clearTimeout(t); const e = new Error('The operation was aborted'); e.name = 'AbortError'; reject(e); });
    }), expectCode: 'TIMEOUT', settings: { provider: { timeoutMs: 1000 } } },
    { name: 'malformed body', fetch: async () => new Response('not-json', { status: 200, headers: { 'content-type': 'application/json' } }), expectCode: 'UPSTREAM_UNAVAILABLE' },
    { name: 'empty choices', fetch: async () => new Response('{"choices":[]}', { status: 200 }), expectCode: 'UPSTREAM_UNAVAILABLE' },
  ];
  for (const c of cases) {
    const env = makeServer({ fetchImpl: c.fetch, apiKey: 'k', settingsPatch: c.settings ?? null });
    try {
      const { token } = env.service.issue({ customer: 'ERR' });
      const out = await env.gateway.chat({ token, messages: MESSAGES });
      assert.equal(out.status, 'error', c.name);
      assert.equal(out.code, c.expectCode, c.name);
      assert.ok(!JSON.stringify(out).includes('API key'), 'upstream error text must be redacted');
      const rec = env.store.getUsageRecord(out.requestId);
      assert.equal(rec.status, 'error', c.name);
      assert.equal(rec.reservedTokens, 0, 'failed requests are never charged');
      assert.ok(rec.errorClassification, c.name);
    } finally {
      env.cleanup();
    }
  }
});

test('gateway: duplicate requestId = idempotent replay (no double charge)', async () => {
  const env = makeServer({ fetchImpl: okProvider(), apiKey: 'k' });
  try {
    const { token } = env.service.issue({ customer: 'IDEM' });
    const first = await env.gateway.chat({ token, messages: MESSAGES, requestId: 'req_dup_1' });
    assert.equal(first.status, 'ok');
    const second = await env.gateway.chat({ token, messages: MESSAGES, requestId: 'req_dup_1' });
    assert.equal(second.status, 'ok');
    assert.equal(second.idempotentReplay, true);
    const records = env.store.data.usage.filter((u) => u.requestId === 'req_dup_1');
    assert.equal(records.length, 1, 'exactly one ledger record');
    assert.equal(env.store.usageTotals(env.service.list()[0].id).usedTokens, 20, 'charged once');
  } finally {
    env.cleanup();
  }
});

test('gateway: HTTP surface — status mapping, sanitized bodies, no credential anywhere', async () => {
  const env = makeServer({ fetchImpl: okProvider(), apiKey: 'test-service-key', settingsPatch: TINY_PLANS });
  try {
    const issued = await req(env.baseUrl, 'POST', '/api/admin/licenses', { customer: 'HTTP', planKey: 'micro' });
    const token = issued.json.token;

    // valid → 200
    const ok = await req(env.baseUrl, 'POST', '/api/copilot/chat', { token, messages: MESSAGES });
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    assert.equal(ok.json.status, 'ok');
    assert.ok(!JSON.stringify(ok.json).includes('test-service-key'));

    // micro plan (20 tokens) is now drained → 429
    const drained = await req(env.baseUrl, 'POST', '/api/copilot/chat', { token, messages: MESSAGES, requestId: 'req_http_2' });
    assert.equal(drained.status, 429);
    assert.equal(drained.json.code, 'QUOTA_EXHAUSTED');

    // invalid → 403
    const bad = await req(env.baseUrl, 'POST', '/api/copilot/chat', { token: 'junk', messages: MESSAGES });
    assert.equal(bad.status, 403);
    assert.equal(bad.json.code, 'LICENSE_INVALID');

    // invalid messages → 400
    const badMsg = await req(env.baseUrl, 'POST', '/api/copilot/chat', { token, messages: [{ role: 'hacker', content: 'x' }] });
    assert.equal(badMsg.status, 400);

    // missing messages → 400
    const noMsg = await req(env.baseUrl, 'POST', '/api/copilot/chat', { token });
    assert.equal(noMsg.status, 400);

    // /api/resolve no longer hands off credentials
    const resolve = await req(env.baseUrl, 'POST', '/api/resolve', { token });
    assert.equal(resolve.status, 200);
    assert.equal(resolve.json.apiKey, undefined, 'no apiKey field, ever');
    assert.ok(resolve.json.licensePublicKey.includes('BEGIN PUBLIC KEY'));
    assert.ok(resolve.json.gatewayUrl.includes('/api/copilot/chat'));
    assert.ok(!JSON.stringify(resolve.json).includes('test-service-key'));

    // customer-supplied identity fields are ignored (server resolves entitlement)
    const issued2 = await req(env.baseUrl, 'POST', '/api/admin/licenses', { customer: 'SPOOF', planKey: 'tiny' });
    const lic = env.service.list().find((l) => l.customer === 'SPOOF');
    const spoof = await req(env.baseUrl, 'POST', '/api/copilot/chat', { token: issued2.json.token, messages: MESSAGES, requestId: 'req_spoof_1', licenseId: 'lic_fake', customer_id: 'acc_fake', plan: 'enterprise', quota: 999_999_999 });
    assert.equal(spoof.status, 200, JSON.stringify(spoof.json));
    assert.equal(spoof.json.licenseId, lic.id, 'identity resolved server-side');
    assert.equal(spoof.json.quota.limit, 3000, 'entitlement from server-side plan, not client input');
  } finally {
    env.cleanup();
  }
});

test('createGateway: reads the credential from server-side env only (fail closed)', () => {
  const store = new JsonStore(path.join(tmpdir(), `copilot-cg-${Date.now()}.json`));
  const service = new LicenseService({ store, privateKeyPem: '-----BEGIN PRIVATE KEY-----x', publicKeyPem: '-----BEGIN PUBLIC KEY-----x' });
  const gw = createGateway({ store, licenseService: service, publicKeyPem: 'k', settings: () => ({}), env: {} });
  assert.equal(gw.configured, false);
  const gw2 = createGateway({ store, licenseService: service, publicKeyPem: 'k', settings: () => ({}), env: { GROUTER_API_KEY: 'env-key-isolated' } });
  assert.equal(gw2.configured, true);
});

async function req(baseUrl, method, p, body) {
  const res = await fetch(`${baseUrl}${p}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() };
}
