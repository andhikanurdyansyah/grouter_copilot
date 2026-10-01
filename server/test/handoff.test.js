import test from 'node:test';
import assert from 'node:assert/strict';

import { createCopilotServer } from '../src/server.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function startServer({ fakeFetch } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-server-'));
  const dataFile = path.join(dir, 'store.json');
  const { server, service, keys } = createCopilotServer({ dataFile, ...(fakeFetch ? { fetch: fakeFetch } : {}) });
  return new Promise((resolve) => {
    server.listen(0, () => {
      const { port } = server.address();
      resolve({ baseUrl: `http://127.0.0.1:${port}`, server, service, keys });
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

test('key handoff: issue → bind → resolve returns api key; license list never leaks it', async () => {
  const { baseUrl, server } = await startServer();
  try {
    const issued = await req(baseUrl, 'POST', '/api/admin/licenses', { customer: 'CRM', features: ['core'] });
    const { id, token } = issued.json.license;
    const rawToken = issued.json.token;

    // no api key bound yet → resolve 404
    const before = await req(baseUrl, 'POST', '/api/resolve', { token: rawToken });
    assert.equal(before.status, 404);

    // bind api key (admin)
    const bind = await req(baseUrl, 'POST', `/api/admin/licenses/${id}/bind`, { grouterApiKey: 'gRouter-abc123' });
    assert.equal(bind.status, 200);
    assert.equal(bind.json.license.grouterApiKey, undefined); // sanitized

    // resolve returns the api key (server-side handoff)
    const resolve = await req(baseUrl, 'POST', '/api/resolve', { token: rawToken });
    assert.equal(resolve.status, 200);
    assert.equal(resolve.json.apiKey, 'gRouter-abc123');

    // license list does not expose api key
    const list = await req(baseUrl, 'GET', '/api/admin/licenses');
    assert.equal(list.json.licenses[0].grouterApiKey, undefined);
  } finally {
    server.close();
  }
});

test('key handoff rejects tampered token', async () => {
  const { baseUrl, server } = await startServer();
  try {
    const issued = await req(baseUrl, 'POST', '/api/admin/licenses', { customer: 'CRM', grouterApiKey: 'gRouter-x' });
    const parts = issued.json.token.split('.');
    const forged = `${parts[0]}.${Buffer.from('{"lic":"evil"}').toString('base64url')}.${parts[2]}`;
    const resolve = await req(baseUrl, 'POST', '/api/resolve', { token: forged });
    assert.equal(resolve.status, 403);
  } finally {
    server.close();
  }
});

test('usage endpoint aggregates /check-usage per bound license', async () => {
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
  const { baseUrl, server } = await startServer({ fakeFetch });
  try {
    const issued = await req(baseUrl, 'POST', '/api/admin/licenses', { customer: 'POS', grouterApiKey: 'gRouter-y' });
    const usage = await req(baseUrl, 'GET', '/api/admin/usage');
    assert.equal(usage.status, 200);
    assert.equal(usage.json.usage.length, 1);
    assert.equal(usage.json.usage[0].usage.usage.tokens, 100);
    assert.equal(usage.json.usage[0].usage.usage.percentage, 10);
    assert.ok(called >= 1);
  } finally {
    server.close();
  }
});
