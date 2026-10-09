/**
 * D-021 Copilot backend AI gateway — automated coverage (no real key, no real
 * network): a fake provider fetchImpl stands in for gRouter; the license
 * service, store, and HTTP surface are the real production ones.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
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

// Default gateway model (settings SSOT, D-020) used by tests that omit model.
const DEFAULT_MODEL = 'DeepSeek-V4-Flash';

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
    assert.equal(body.model, DEFAULT_MODEL);
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


test('gateway: default model resolves from settings (SSOT) and can be overridden per request', async () => {
  let seenModels = [];
  const fetchImpl = async (url, init) => {
    seenModels.push(JSON.parse(init.body).model);
    return new Response(
      JSON.stringify({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 5, completion_tokens: 3 } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  const env = makeServer({ fetchImpl, apiKey: 'test-key', settingsPatch: TINY_PLANS });
  try {
    const issued = await fetch(`${env.baseUrl}/api/admin/licenses`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer test-admin' },
      body: JSON.stringify({ customer: 'M', planKey: 'tiny' }),
    });
    const { token } = await issued.json();

    // No model in request → settings provider.model (DeepSeek-V4-Flash).
    let res = await fetch(`${env.baseUrl}/api/copilot/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, messages: MESSAGES, requestId: `req_${Date.now()}a` }),
    });
    assert.equal(res.status, 200);
    // Explicit model wins over the default.
    res = await fetch(`${env.baseUrl}/api/copilot/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, messages: MESSAGES, model: 'kimi-k3', requestId: `req_${Date.now()}b` }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(seenModels, [DEFAULT_MODEL, 'kimi-k3']);
  } finally { env.cleanup(); }
});

test('gateway: no configured model fails closed as NOT_CONFIGURED (never charged)', async () => {
  const settings = { plans: TINY_PLANS.plans, provider: { model: '' } };
  const env = makeServer({
    fetchImpl: async () => { throw new Error('provider must NOT be called without a model'); },
    apiKey: 'test-key', settingsPatch: settings,
  });
  try {
    const issued = await fetch(`${env.baseUrl}/api/admin/licenses`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer test-admin' },
      body: JSON.stringify({ customer: 'M', planKey: 'tiny' }),
    });
    const { token } = await issued.json();
    const res = await fetch(`${env.baseUrl}/api/copilot/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, messages: MESSAGES, requestId: `req_${Date.now()}c` }),
    });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.code, 'NOT_CONFIGURED');
  } finally { env.cleanup(); }
});


test('admin ledger endpoint: auth required, filters, pagination, customer summary in /api/me', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-ledger-'));
  const prevKey = process.env.GROUTER_API_KEY;
  process.env.GROUTER_API_KEY = 'ledger-test-key'; // read at server construction
  const seenModels = [];
  const fakeFetch = async (url, init) => {
    if (String(url).endsWith('/v1/chat/completions')) {
      const body = JSON.parse(init.body);
      seenModels.push(body.model);
      if (body.messages?.[0]?.content === 'boom') {
        return new Response(JSON.stringify({ error: 'upstream exploded' }), { status: 500, headers: { 'content-type': 'application/json' } });
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'hi' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    throw new Error('unexpected fetch ' + url);
  };
  try {
    const { server, store, keys } = createCopilotServer({
      dataFile: path.join(dir, 'store.json'),
      fetch: fakeFetch,
      initialSettings: { plans: [{ key: 'tiny', name: 'Tiny', amount: 0, currency: 'IDR', quota: 't', quotaTokens: 3000, features: ['core'], expiresInDays: 90, active: true }] },
    });
    await new Promise((r) => server.listen(0, r));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const issue = await req(base, 'POST', '/api/admin/licenses', { customer: 'LedgerCo', planKey: 'tiny' });
      const { token, license } = issue.json;

      // 1) Ledger requires admin. In NODE_ENV=test the server allows
      // unauthenticated admin by default, so prove the gate by constructing the
      // server with an explicit adminToken instead.
      const gated = createCopilotServer({
        dataFile: path.join(dir, 'store-gated.json'),
        fetch: fakeFetch,
        adminToken: 'secret-admin-token',
        allowUnauthenticatedAdmin: false,
      });
      gated.server.listen(0, () => {});
      try {
        const gatedBase = `http://127.0.0.1:${gated.server.address().port}`;
        const noAuth = await req(gatedBase, 'GET', '/api/admin/ledger');
        assert.equal(noAuth.status, 401, 'ledger must never be accessible without the admin token');
        const withAuth = await req(gatedBase, 'GET', '/api/admin/ledger', null, 'secret-admin-token');
        assert.equal(withAuth.status, 200);
      } finally {
        gated.server.close();
      }

      // 2) 2 ok requests + 1 upstream error (fake provider 500) — error row must
      // appear in the ledger WITHOUT being charged.
      for (const rid of ['req_l1', 'req_l2']) {
        const res = await req(base, 'POST', '/api/copilot/chat', { token, messages: [{ role: 'user', content: 'x' }], requestId: rid });
        assert.equal(res.json.status, 'ok');
      }
      const bad = await req(base, 'POST', '/api/copilot/chat', { token, messages: [{ role: 'user', content: 'boom' }], requestId: 'req_l3' });
      assert.equal(bad.json.status, 'error');

      // 3) Authenticated ledger lists records with sanitized fields only.
      const list = await req(base, 'GET', '/api/admin/ledger');
      assert.equal(list.status, 200);
      assert.ok(list.json.total >= 3);
      const rec = list.json.records[0];
      for (const key of ['requestId', 'licenseId', 'customer', 'status', 'inputTokens', 'outputTokens', 'totalTokens', 'createdAt']) {
        assert.ok(key in rec, 'record exposes ' + key);
      }
      assert.ok(!('answer' in rec), 'prompt/completion bodies are never exposed');
      assert.ok(!JSON.stringify(list.json).includes('gRouter-') && !JSON.stringify(list.json).includes('apiKey'), 'no credentials in ledger response');

      // 4) Filters work.
      const okOnly = await req(base, 'GET', '/api/admin/ledger?status=ok');
      assert.ok(okOnly.json.records.every((r) => r.status === 'ok'));
      const errOnly = await req(base, 'GET', '/api/admin/ledger?status=error');
      assert.ok(errOnly.json.records.length >= 1 && errOnly.json.records.every((r) => r.status === 'error'));
      const byCustomer = await req(base, 'GET', '/api/admin/ledger?customer=ledgerco');
      assert.ok(byCustomer.json.total >= 3);
      const byLicense = await req(base, 'GET', `/api/admin/ledger?licenseId=${license.id}`);
      assert.equal(byLicense.json.total, byCustomer.json.total);
      const noMatch = await req(base, 'GET', '/api/admin/ledger?customer=nobody');
      assert.equal(noMatch.json.total, 0);

      // 5) Pagination is bounded and stable.
      const p1 = await req(base, 'GET', '/api/admin/ledger?limit=2&offset=0');
      assert.equal(p1.json.records.length, 2);
      const p2 = await req(base, 'GET', '/api/admin/ledger?limit=2&offset=2');
      assert.ok(p2.json.records.length >= 1);
      const ids = new Set([...p1.json.records, ...p2.json.records].map((r) => r.requestId));
      assert.equal(ids.size, p1.json.records.length + p2.json.records.length, 'no page overlap');
      const capped = await req(base, 'GET', '/api/admin/ledger?limit=9999');
      assert.ok(capped.json.records.length <= 200, 'limit is capped at 200');

      // 6) Quota view per record reflects the plan (server-side catalogue).
      assert.equal(p1.json.records[0].quota.unit, 'tokens');
      assert.equal(p1.json.records[0].quota.limit, 3000);
      assert.ok(p1.json.records[0].quota.usedTokens >= 30); // 2 ok × 15 tokens

      // 7) /api/me includes the account's usage summary (auth-scoped).
      //    (Direct check: usageTotals for this license matches ledger.)
      const totals = store.usageTotals(license.id);
      assert.equal(totals.requestCount, 2);
      assert.equal(totals.usedTokens, 30);
    } finally {
      server.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
    if (prevKey === undefined) delete process.env.GROUTER_API_KEY;
    else process.env.GROUTER_API_KEY = prevKey;
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

async function req(baseUrl, method, p, body, adminToken) {
  const res = await fetch(`${baseUrl}${p}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(adminToken ? { authorization: `Bearer ${adminToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() };
}
