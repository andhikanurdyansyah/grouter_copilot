/**
 * Production readiness gates (audit hardening slice):
 *   1. requireAdmin fails CLOSED without ADMIN_TOKEN unless NODE_ENV is
 *      explicitly test/development; an unset NODE_ENV is production.
 *   2. createCopilotServer refuses to boot in production without a persisted
 *      license keypair (ephemeral generation is dev/test-only).
 *   3. Body handling: oversized payloads and invalid JSON are rejected with 400
 *      instead of being silently parsed as {}.
 *   4. Security headers + rate limiting on unauthenticated exchange surfaces.
 *
 * Isolation: every server here gets its own temp dataFile and ephemeral keys
 * passed explicitly, so server/data and production env are never touched.
 * These tests PIN production behavior — NODE_ENV must be unset/production for
 * the gate tests and explicitly 'test' (or constructor overrides) for dev
 * fallback tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCopilotServer } from '../src/server.js';
import { generateKeyPair } from '../../src/license/validate.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// KlikQris must be "configured" for some routes; dummy values never leave tests.
process.env.KLIKQRIS_API_KEY ||= 'test-key';
process.env.KLIKQRIS_MERCHANT_ID ||= 'test-merchant';

const pair = generateKeyPair();

function startServer(opts = {}) {
  const dataFile = path.join(mkdtempSync(path.join(tmpdir(), 'copilot-gate-')), 'store.json');
  const { server } = createCopilotServer({ dataFile, privateKeyPem: pair.privateKeyPem, publicKeyPem: pair.publicKeyPem, ...opts });
  return new Promise((resolve) => {
    server.listen(0, () => {
      resolve({ baseUrl: `http://127.0.0.1:${server.address().port}`, server });
    });
  });
}

async function req(baseUrl, method, p, body, headers = {}) {
  const res = await fetch(`${baseUrl}${p}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})), headers: res.headers };
}

test('production gate: admin routes return 401 when ADMIN_TOKEN is absent and NODE_ENV is unset', async () => {
  const { baseUrl, server } = await startServer({ adminToken: null, allowUnauthenticatedAdmin: false });
  try {
    const stats = await req(baseUrl, 'GET', '/api/admin/stats');
    assert.equal(stats.status, 401, 'no token + fail-closed option must reject');
    const issue = await req(baseUrl, 'POST', '/api/admin/licenses', { customer: 'X' });
    assert.equal(issue.status, 401);
  } finally {
    server.close();
  }
});

test('dev fallback: admin routes stay open only under explicit NODE_ENV=test', async () => {
  const saved = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  try {
    const { baseUrl, server } = await startServer({ adminToken: null });
    try {
      const stats = await req(baseUrl, 'GET', '/api/admin/stats');
      assert.equal(stats.status, 200, 'explicit NODE_ENV=test keeps the documented local fallback');
    } finally {
      server.close();
    }
  } finally {
    if (saved === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = saved;
  }
});

test('production gate: startup refuses to boot without a persisted license keypair', async () => {
  const dataFile = path.join(mkdtempSync(path.join(tmpdir(), 'copilot-gate-')), 'store.json');
  assert.throws(
    () => createCopilotServer({ dataFile, privateKeyPem: null, publicKeyPem: null, requirePersistedLicenseKeys: true }),
    /keypair is not persisted/i,
    'production without persisted keys must fail closed at startup',
  );
});

test('dev mode: ephemeral keypair generation still works (explicit dev flags)', async () => {
  const saved = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    const dataFile = path.join(mkdtempSync(path.join(tmpdir(), 'copilot-gate-')), 'store.json');
    const { server, keys } = createCopilotServer({ dataFile, privateKeyPem: null, publicKeyPem: null });
    try {
      assert.ok(keys.privateKeyPem, 'ephemeral private key generated in development');
      assert.ok(keys.publicKeyPem, 'ephemeral public key generated in development');
    } finally {
      server.close();
    }
  } finally {
    if (saved === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = saved;
  }
});

test('injected keypair persists across a simulated restart (same keys, new server)', async () => {
  const dataFile = path.join(mkdtempSync(path.join(tmpdir(), 'copilot-gate-')), 'store.json');
  const first = createCopilotServer({ dataFile, privateKeyPem: pair.privateKeyPem, publicKeyPem: pair.publicKeyPem, requirePersistedLicenseKeys: true });
  const issued = first.service.issue({ customer: 'Restart check' });
  first.server.close();

  const second = createCopilotServer({ dataFile, privateKeyPem: pair.privateKeyPem, publicKeyPem: pair.publicKeyPem, requirePersistedLicenseKeys: true });
  try {
    const result = second.service.validate(issued.token, pair.publicKeyPem);
    assert.equal(result.status, 'valid', 'license issued before restart validates after restart with persisted keys');
  } finally {
    second.server.close();
  }
});

test('body handling: invalid JSON and oversized payloads return 400 (not silent {})', async () => {
  const { baseUrl, server } = await startServer({ adminToken: 'gate-token' });
  try {
    const bad = await fetch(`${baseUrl}/api/heartbeat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"token": not-json',
    });
    assert.equal(bad.status, 400);
    assert.match((await bad.json()).error, /invalid request body/);

    const big = 'x'.repeat(70 * 1024);
    const overflow = await req(baseUrl, 'POST', '/api/heartbeat', { token: big });
    assert.equal(overflow.status, 400, 'payloads over the 64KiB cap are rejected');
    assert.match(overflow.json.error, /invalid request body/);

    // Under the cap but missing token → still the normal validation path.
    const missing = await req(baseUrl, 'POST', '/api/heartbeat', { installId: 'x' });
    assert.equal(missing.status, 403);
  } finally {
    server.close();
  }
});

test('security headers are present on every response', async () => {
  const { baseUrl, server } = await startServer();
  try {
    const res = await req(baseUrl, 'GET', '/api/plans');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  } finally {
    server.close();
  }
});

test('rate limit: resolve flood beyond the fixed window returns 429', async () => {
  const { baseUrl, server } = await startServer();
  try {
    let sawLimited = false;
    for (let i = 0; i < 40; i += 1) {
      const res = await req(baseUrl, 'POST', '/api/resolve', { token: 'flooding-token' });
      if (res.status === 429) {
        sawLimited = true;
        break;
      }
      assert.ok([400, 403].includes(res.status), `unexpected status during flood: ${res.status}`);
    }
    assert.ok(sawLimited, 'expected a 429 once the 30-req/min window is exceeded');
  } finally {
    server.close();
  }
});

test('readiness: report flags missing gates without blocking behavior', async () => {
  const { evaluateProductionReadiness, formatReadinessReport } = await import('../src/readiness.js');
  const report = evaluateProductionReadiness({
    nodeEnv: undefined,
    adminToken: '',
    licenseKeysPersisted: false,
    betterAuthApiKey: '',
    paymentConfigured: false,
    paymentMode: 'sandbox',
  });
  assert.equal(report.ready, false);
  const byId = Object.fromEntries(report.checks.map((c) => [c.id, c]));
  assert.equal(byId['admin-token'].ok, false);
  assert.equal(byId['admin-token'].blocking, true);
  assert.equal(byId['license-keypair-persisted'].ok, false);
  assert.equal(byId['better-auth-api-key'].ok, false);
  assert.equal(byId['better-auth-api-key'].blocking, false, 'Better Auth key is advisory, not blocking');
  assert.equal(byId['klikqris-production'].ok, false);
  const text = formatReadinessReport(report);
  assert.match(text, /NOT READY/);
  assert.match(text, /\[better-auth-api-key\]/);

  // Fully provisioned production: ready.
  const good = evaluateProductionReadiness({
    nodeEnv: 'production',
    adminToken: 'present',
    licenseKeysPersisted: true,
    betterAuthApiKey: 'present',
    paymentConfigured: true,
    paymentMode: 'production',
  });
  assert.equal(good.ready, true);
  assert.match(formatReadinessReport(good), /READY/);
});
