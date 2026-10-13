/**
 * Regression — admin license issuance must FAIL CLOSED on an unknown planKey.
 *
 * Defect (found 2026-10-13): POST /api/admin/licenses with a planKey that does
 * not resolve in the plan catalogue returned 201 and created a license. That
 * license is dead on arrival at the gateway (PLAN_NOT_FOUND) AND, before the
 * gateway hardening, would have resolved to an UNLIMITED AI policy. Issuance
 * must reject an unresolvable planKey at the boundary (cost/entitlement A3/D-020),
 * while an empty/absent planKey remains the valid "issued without a package" path.
 *
 * RED on the pre-fix server → GREEN after the guard.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCopilotServer } from '../src/server.js';

async function makeEnv() {
  // Isolated store now derives a fresh temp file under NODE_ENV=test (no prod
  // data), so seed the plan catalogue explicitly for the known-key cases.
  const initialSettings = {
    plans: [
      { key: 'test-plan-90d', name: 'Test 90d', amount: 10000, currency: 'IDR', quota: 'test', quotaTokens: 1000, features: ['core'], expiresInDays: 90, active: true },
    ],
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
  return { server, store, service, baseUrl, req, close: () => new Promise((r) => server.close(r)) };
}

test('admin issuance rejects an UNKNOWN planKey (fail closed, 400, no license created)', async () => {
  const env = await makeEnv();
  try {
    const before = env.service.list().length;
    const r = await env.req('/api/admin/licenses', 'POST', { customer: 'Ghost', planKey: 'no-such-plan' });
    assert.equal(r.status, 400, `expected 400, got ${r.status}`);
    assert.equal(r.json?.code, 'PLAN_NOT_FOUND');
    assert.equal(env.service.list().length, before, 'no license must be created for an unknown planKey');
  } finally { await env.close(); }
});

test('admin issuance accepts a KNOWN planKey (201)', async () => {
  const env = await makeEnv();
  try {
    const plans = env.store.getSettings().plans || [];
    const key = plans.find((p) => p.key)?.key;
    assert.ok(key, 'test env must have a plan catalogue');
    const r = await env.req('/api/admin/licenses', 'POST', { customer: 'Real', planKey: key });
    assert.equal(r.status, 201, `expected 201, got ${r.status}`);
    assert.ok(r.json?.token, 'a token must be returned');
  } finally { await env.close(); }
});

test('admin issuance still allows a package-less license (no planKey)', async () => {
  const env = await makeEnv();
  try {
    const r = await env.req('/api/admin/licenses', 'POST', { customer: 'NoPkg' });
    assert.equal(r.status, 201, `expected 201, got ${r.status}`);
  } finally { await env.close(); }
});
