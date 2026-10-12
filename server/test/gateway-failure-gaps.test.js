// Gap coverage (2026-10-12 mandate): upstream 5xx with a non-JSON body must
// be an upstream failure (never a silent success), reservations are released
// on every failure path, and a license revoked mid-flight is not charged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCopilotServer } from '../src/server.js';

const MESSAGES = [{ role: 'user', content: 'hi' }];
const TINY = {
  plans: [{ key: 'tiny', name: 'Tiny', amount: 0, currency: 'IDR', quota: 'tiny', quotaTokens: 3000, features: ['core'], expiresInDays: 90, active: true }],
};

function makeServer(fetchImpl, { apiKey = 'test-gateway-key' } = {}) {
  const prev = process.env.GROUTER_API_KEY;
  process.env.GROUTER_API_KEY = apiKey;
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-gw-gap-'));
  const env = createCopilotServer({ dataFile: path.join(dir, 'store.json'), fetch: fetchImpl, initialSettings: TINY });
  const restore = () => { if (prev === undefined) delete process.env.GROUTER_API_KEY; else process.env.GROUTER_API_KEY = prev; };
  return { ...env, restore };
}

test('gateway: upstream HTTP 500 with plain-text body is an upstream failure, reservation released, not charged', async () => {
  const env = makeServer(async () => new Response('internal error stack trace', { status: 500 }));
  try {
    const { token } = env.service.issue({ customer: 'GW500', planKey: 'tiny' });
    const out = await env.gateway.chat({ token, messages: MESSAGES, requestId: 'req_500' });
    assert.equal(out.status, 'error');
    assert.equal(out.code, 'UPSTREAM_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(out), /stack trace|internal error/, 'upstream body must not leak');
    const rec = env.store.getUsageRecord('req_500');
    assert.equal(rec.status, 'error');
    assert.equal(rec.reservedTokens, 0, 'reservation released');
    assert.equal(env.store.usageTotals(env.service.list()[0].id).usedTokens, 0, 'nothing charged');
  } finally { env.restore(); }
});

test('gateway: successful call reconciles usage and releases the reservation exactly once', async () => {
  const env = makeServer(async () => new Response(
    JSON.stringify({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  ));
  try {
    const { token } = env.service.issue({ customer: 'GWOK', planKey: 'tiny' });
    const out = await env.gateway.chat({ token, messages: MESSAGES, requestId: 'req_ok' });
    assert.equal(out.status, 'ok');
    const rec = env.store.getUsageRecord('req_ok');
    assert.equal(rec.status, 'ok');
    assert.equal(rec.reservedTokens, 0, 'reservation cleared after reconciliation');
    assert.equal(env.store.usageTotals(env.service.list()[0].id).usedTokens, 15, 'charged = actual usage');
  } finally { env.restore(); }
});

test("gateway: license revoked mid-flight — in-flight call settles once, next call is LICENSE_REVOKED", async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const env = makeServer(async () => {
    await gate;
    return new Response(JSON.stringify({ choices: [{ message: { content: "late" } }], usage: { prompt_tokens: 10, completion_tokens: 10 } }),
      { status: 200, headers: { "content-type": "application/json" } });
  });
  try {
    const { token, record } = env.service.issue({ customer: "GWREV", planKey: "tiny" });
    const inflight = env.gateway.chat({ token, messages: MESSAGES, requestId: "req_rev" });
    env.store.revokeLicense(record.id); // revoked while the upstream call is pending
    release();
    const out = await inflight;
    // Admission was checked before revoke, so the provider call completes and is
    // charged exactly once; the reservation must not dangle.
    assert.equal(out.status, "ok");
    const rec = env.store.getUsageRecord("req_rev");
    assert.equal(rec.status, "ok");
    assert.equal(rec.reservedTokens, 0);
    assert.equal(env.store.usageTotals(record.id).usedTokens, 20);
    // Any NEW request after revocation is blocked before upstream.
    const next = await env.gateway.chat({ token, messages: MESSAGES, requestId: "req_rev_2" });
    assert.equal(next.status, "error");
    assert.equal(next.code, "LICENSE_REVOKED");
    assert.equal(env.store.getUsageRecord("req_rev_2"), null, "no ledger charge for a blocked request");
  } finally { env.restore(); }
});
