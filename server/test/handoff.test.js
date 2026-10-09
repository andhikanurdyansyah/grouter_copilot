import test from 'node:test';
import assert from 'node:assert/strict';

import { createCopilotServer } from '../src/server.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function startServer({ fakeFetch } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-server-'));
  const dataFile = path.join(dir, 'store.json');
  const { server, service, keys, settings } = createCopilotServer({ dataFile, ...(fakeFetch ? { fetch: fakeFetch } : {}) });
  return new Promise((resolve) => {
    server.listen(0, () => {
      const { port } = server.address();
      resolve({ baseUrl: `http://127.0.0.1:${port}`, server, service, keys, settings });
    });
  });
}

async function req(baseUrl, method, p, body) {
  const res = await fetch(`${baseUrl}${p}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() };
}

test('D-021: resolve NEVER returns a provider key (legacy handoff removed)', async () => {
  const { baseUrl, server, keys } = await startServer();
  try {
    const issued = await req(baseUrl, 'POST', '/api/admin/licenses', { customer: 'CRM', features: ['core'] });
    const rawToken = issued.json.token;

    // Legacy bind endpoint still exists for old data compat, but its field is
    // deprecated and must never be projected or handed out again.
    const bind = await req(baseUrl, 'POST', `/api/admin/licenses/${issued.json.license.id}/bind`, { grouterApiKey: 'legacy-migration-key' });
    assert.equal(bind.status, 200);
    assert.equal(bind.json.license.grouterApiKey, undefined, 'sanitized projection never includes the key');

    const resolve = await req(baseUrl, 'POST', '/api/resolve', { token: rawToken, baseUrl: 'https://attacker.invalid' });
    assert.equal(resolve.status, 200);
    assert.equal(resolve.json.apiKey, undefined, 'no apiKey field, ever (D-021)');
    assert.equal(typeof resolve.json.baseUrl, 'string');
    assert.equal(typeof resolve.json.gatewayUrl, 'string');
    assert.equal(resolve.json.licensePublicKey, keys.publicKeyPem);
    assert.ok(!JSON.stringify(resolve.json).includes('legacy-migration-key'), 'no credential anywhere in the payload');

    // license list does not expose api key
    const list = await req(baseUrl, 'GET', '/api/admin/licenses');
    assert.equal(list.json.licenses[0].grouterApiKey, undefined);
  } finally {
    server.close();
  }
});

test('resolve rejects tampered token', async () => {
  const { baseUrl, server } = await startServer();
  try {
    const issued = await req(baseUrl, 'POST', '/api/admin/licenses', { customer: 'CRM' });
    const parts = issued.json.token.split('.');
    const forged = `${parts[0]}.${Buffer.from('{"lic":"evil"}').toString('base64url')}.${parts[2]}`;
    const resolve = await req(baseUrl, 'POST', '/api/resolve', { token: forged });
    assert.equal(resolve.status, 403);
  } finally {
    server.close();
  }
});

test('usage endpoint aggregates /check-usage per service credential (infrastructure dimension)', async () => {
  let called = 0;
  const fakeFetch = async (url) => {
    called++;
    return new Response(JSON.stringify({
      status: 'active',
      name: 'commerce-ORD',
      usage: { tokens: 100, limit: 1000, remaining: 900, percentage: 10 },
      requests: 5,
      models: ['DeepSeek-V4-Pro'],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const prev = process.env.GROUTER_API_KEY;
  process.env.GROUTER_API_KEY = 'usage-test-key'; // read at request time by /api/admin/usage
  const { baseUrl, server } = await startServer({ fakeFetch });
  try {
    const usage = await req(baseUrl, 'GET', '/api/admin/usage');
    assert.equal(usage.status, 200);
    assert.equal(usage.json.usage.length, 1);
    assert.equal(usage.json.usage[0].customer, '__infrastructure__');
    assert.equal(usage.json.usage[0].usage.usage.tokens, 100);
    assert.equal(usage.json.usage[0].usage.usage.percentage, 10);
    assert.ok(called >= 1);
  } finally {
    server.close();
    if (prev === undefined) delete process.env.GROUTER_API_KEY;
    else process.env.GROUTER_API_KEY = prev;
  }
});
