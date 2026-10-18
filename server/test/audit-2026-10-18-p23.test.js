/**
 * Regression coverage for the 2026-10-18 backend audit slice m6-p23.
 *
 * These tests intentionally assert runtime behaviour, not source shape:
 * - A-12: configuration rejections in the gateway must leave a ledger row.
 * - A-13: a replay must never invent an empty successful answer.
 * - A-09: unexpected settings persistence failures must stay generic.
 * - A-05: one chat request must consume one rate-limit hit, keyed by the
 *   trusted proxy client identity instead of the shared socket address.
 * - A-03: settings accepted by PATCH must disclose restart-only sections.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.ADMIN_TOKEN ||= 'audit-p23-admin-token';
process.env.KLIKQRIS_API_KEY ||= 'test-klikqris-key';
process.env.KLIKQRIS_MERCHANT_ID ||= 'test-merchant';

const { createCopilotServer } = await import('../src/server.js');
const { JsonStore } = await import('../src/store.js');

const MESSAGES = [
  { role: 'system', content: 'Answer only from the data provided.' },
  { role: 'user', content: 'summarize sales' },
];

function tmpStorePath() {
  return path.join(mkdtempSync(path.join(tmpdir(), 'copilot-audit-p23-')), 'store.json');
}

function makeServer(options = {}) {
  const previousKey = process.env.GROUTER_API_KEY;
  if (options.apiKey === null) delete process.env.GROUTER_API_KEY;
  else if (options.apiKey !== undefined) process.env.GROUTER_API_KEY = options.apiKey;

  const created = createCopilotServer({
    dataFile: tmpStorePath(),
    fetch: options.fetchImpl,
    initialSettings: options.settingsPatch,
  });

  return {
    ...created,
    async listen() {
      await new Promise((resolve) => created.server.listen(0, '127.0.0.1', resolve));
      return `http://127.0.0.1:${created.server.address().port}`;
    },
    async cleanup() {
      await new Promise((resolve) => created.server.close(resolve));
      if (previousKey === undefined) delete process.env.GROUTER_API_KEY;
      else process.env.GROUTER_API_KEY = previousKey;
    },
  };
}

function providerFetch(answer = 'stored answer') {
  return async () => new Response(
    JSON.stringify({
      choices: [{ message: { content: answer } }],
      usage: { prompt_tokens: 12, completion_tokens: 8 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

async function request(base, method, pathname, body, headers = {}) {
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* keep raw text available to assertions */ }
  return { status: response.status, text, json };
}

test('A-12: a package without a usable model still leaves a rejected ledger row', async () => {
  const env = makeServer({
    apiKey: 'test-service-key',
    fetchImpl: providerFetch(),
    settingsPatch: {
      provider: { model: 'drifted-global-model' },
      plans: [{
        key: 'locked-models',
        name: 'Locked models',
        amount: 0,
        currency: 'IDR',
        expiresInDays: 90,
        active: true,
        ai: {
          enabled: true,
          provider: 'grouter',
          allowedModels: ['allowed-a', 'allowed-b'],
          quotaTokens: 5000,
        },
      }],
    },
  });

  try {
    const { token } = env.service.issue({ customer: 'AUDIT-A12', planKey: 'locked-models' });
    const out = await env.gateway.chat({
      token,
      messages: MESSAGES,
      requestId: 'req_audit_a12',
    });

    assert.equal(out.status, 'error');
    assert.equal(out.code, 'NOT_CONFIGURED');
    const record = env.store.getUsageRecord('req_audit_a12');
    assert.ok(record, 'configuration rejection must be visible in the ledger');
    assert.equal(record.status, 'rejected');
    assert.equal(record.errorClassification, 'not_configured');
    assert.equal(record.errorCode, 'NOT_CONFIGURED');
    assert.equal(record.reservedTokens, 0);
  } finally {
    await env.cleanup();
  }
});

test('A-13: replaying a completed request never returns a fabricated empty answer', async () => {
  const env = makeServer({
    apiKey: 'test-service-key',
    fetchImpl: providerFetch('the original answer'),
  });

  try {
    const { token } = env.service.issue({ customer: 'AUDIT-A13' });
    const first = await env.gateway.chat({
      token,
      messages: MESSAGES,
      requestId: 'req_audit_a13',
    });
    assert.equal(first.status, 'ok');
    assert.equal(first.answer, 'the original answer');

    // The product deliberately does not persist assistant answers. A replay
    // therefore has to be honest about completion instead of returning an
    // empty string dressed up as the original successful response.
    const record = env.store.getUsageRecord('req_audit_a13');
    assert.equal(record.answer, null, 'assistant answers must not be persisted');
    const replay = await env.gateway.chat({
      token,
      messages: MESSAGES,
      requestId: 'req_audit_a13',
    });
    assert.equal(replay.status, 'error');
    assert.equal(replay.code, 'REQUEST_ALREADY_COMPLETED');
    assert.equal(replay.idempotentReplay, undefined);
    assert.equal(env.store.data.usage.filter((row) => row.requestId === 'req_audit_a13').length, 1);
    assert.equal(env.store.usageTotals(env.service.list()[0].id).usedTokens, 20, 'replay must not charge twice');
  } finally {
    await env.cleanup();
  }
});

test('A-09: unexpected settings persistence failures return a generic 500', async () => {
  const env = makeServer({ apiKey: 'test-service-key', fetchImpl: providerFetch() });
  const base = await env.listen();
  const originalSave = env.store._save;

  try {
    env.store._save = () => { throw new Error('private disk path /srv/internal/store.json failed'); };
    const response = await request(
      base,
      'PATCH',
      '/api/admin/settings',
      { notifications: { quotaThresholdPercent: 91 } },
      { authorization: `Bearer ${process.env.ADMIN_TOKEN}` },
    );

    assert.equal(response.status, 500);
    assert.deepEqual(response.json, { error: 'settings could not be saved' });
    assert.ok(!response.text.includes('private disk path'), 'internal error details must not leak');
  } finally {
    env.store._save = originalSave;
    await env.cleanup();
  }
});

test('A-05: chat is charged once and trusted proxy identities get separate buckets', async () => {
  const env = makeServer({
    apiKey: 'test-service-key',
    fetchImpl: providerFetch(),
  });
  const base = await env.listen();

  try {
    const { token } = env.service.issue({ customer: 'AUDIT-A05' });
    const firstClient = { 'cf-connecting-ip': '203.0.113.10' };
    const secondClient = { 'cf-connecting-ip': '203.0.113.11' };
    let lastFirstClientStatus = 0;
    let requestNumber = 0;

    // The documented ceiling is 60/minute. With the old pre-dispatch +
    // in-handler double count, request 31 already returned 429.
    for (let i = 0; i < 31; i += 1) {
      requestNumber += 1;
      const response = await request(base, 'POST', '/api/copilot/chat', {
        token,
        messages: MESSAGES,
        requestId: `req_audit_a05_${requestNumber}`,
      }, firstClient);
      lastFirstClientStatus = response.status;
      assert.notEqual(response.status, 429, `request ${requestNumber} must not be rate limited yet`);
    }
    assert.equal(lastFirstClientStatus, 200);

    // Find the exact exhaustion boundary instead of assuming it. The old
    // double-count made request 31 fail; a single 60/minute count must let
    // substantially more through before the first 429.
    let firstLimitedAt = 0;
    for (let i = 31; i < 90 && firstLimitedAt === 0; i += 1) {
      requestNumber += 1;
      const response = await request(base, 'POST', '/api/copilot/chat', {
        token,
        messages: MESSAGES,
        requestId: `req_audit_a05_${requestNumber}`,
      }, firstClient);
      if (response.status === 429) firstLimitedAt = requestNumber;
      else assert.equal(response.status, 200, `request ${requestNumber} should succeed before the limit`);
    }
    assert.ok(firstLimitedAt >= 59, `single-count bucket must not exhaust before ~60 (got ${firstLimitedAt})`);
    console.log(`A05_FIRST_LIMITED_AT=${firstLimitedAt}`);

    // A different end-client behind the same loopback proxy must not inherit
    // the first client's exhausted bucket.
    const otherClient = await request(base, 'POST', '/api/copilot/chat', {
      token,
      messages: MESSAGES,
      requestId: 'req_audit_a05_other_client',
    }, secondClient);
    assert.equal(otherClient.status, 200, JSON.stringify(otherClient.json));
  } finally {
    await env.cleanup();
  }
});

test('A-03: settings PATCH discloses which accepted sections require a restart', async () => {
  const env = makeServer({ apiKey: 'test-service-key', fetchImpl: providerFetch() });
  const base = await env.listen();

  try {
    const paymentPatch = await request(
      base,
      'PATCH',
      '/api/admin/settings',
      { payment: { mode: 'production' } },
      { authorization: `Bearer ${process.env.ADMIN_TOKEN}` },
    );
    assert.equal(paymentPatch.status, 200, JSON.stringify(paymentPatch.json));
    assert.ok(Array.isArray(paymentPatch.json.requiresRestart), 'PATCH must disclose restart-only work');
    assert.ok(paymentPatch.json.requiresRestart.includes('payment'));

    const livePatch = await request(
      base,
      'PATCH',
      '/api/admin/settings',
      { plans: [{ key: 'live-only', name: 'Live only', amount: 0, expiresInDays: 30, active: true }] },
      { authorization: `Bearer ${process.env.ADMIN_TOKEN}` },
    );
    assert.equal(livePatch.status, 200, JSON.stringify(livePatch.json));
    assert.deepEqual(livePatch.json.requiresRestart, [], 'live-read catalogue changes must not claim a restart');
  } finally {
    await env.cleanup();
  }
});

test('JsonStore remains the isolated backing store used by this regression file', () => {
  const store = new JsonStore(tmpStorePath());
  assert.deepEqual(store.data.orders, []);
});
