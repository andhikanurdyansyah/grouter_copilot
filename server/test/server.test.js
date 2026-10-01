import test from 'node:test';
import assert from 'node:assert/strict';

import { createCopilotServer } from '../src/server.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function startServer() {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-server-'));
  const dataFile = path.join(dir, 'store.json');
  const { server, service } = createCopilotServer({ dataFile });
  return new Promise((resolve) => {
    server.listen(0, () => {
      const { port } = server.address();
      resolve({ baseUrl: `http://127.0.0.1:${port}`, server, service });
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

test('issue → list → stats reflects the license', async () => {
  const { baseUrl, server } = await startServer();
  try {
    const issued = await req(baseUrl, 'POST', '/api/admin/licenses', { customer: 'Acme CRM', features: ['core'], expiresInDays: 30 });
    assert.equal(issued.status, 201);
    assert.ok(issued.json.token);

    const stats = await req(baseUrl, 'GET', '/api/admin/stats');
    assert.equal(stats.json.totalLicenses, 1);
    assert.equal(stats.json.activeLicenses, 1);

    const list = await req(baseUrl, 'GET', '/api/admin/licenses');
    assert.equal(list.json.licenses.length, 1);
    assert.equal(list.json.licenses[0].customer, 'Acme CRM');
    assert.equal(list.json.licenses[0].token, undefined); // raw token never listed
  } finally {
    server.close();
  }
});

test('heartbeat validates a real license and records an install', async () => {
  const { baseUrl, server } = await startServer();
  try {
    const issued = await req(baseUrl, 'POST', '/api/admin/licenses', { customer: 'POS X', features: ['core'] });
    const token = issued.json.token;

    const hb = await req(baseUrl, 'POST', '/api/heartbeat', { token, installId: 'install-1', baseUrl: 'https://api.grouter.io' });
    assert.equal(hb.status, 200);

    const stats = await req(baseUrl, 'GET', '/api/admin/stats');
    assert.equal(stats.json.totalInstalls, 1);
  } finally {
    server.close();
  }
});

test('heartbeat rejects a tampered token', async () => {
  const { baseUrl, server } = await startServer();
  try {
    const issued = await req(baseUrl, 'POST', '/api/admin/licenses', { customer: 'CRM', features: ['core'] });
    const parts = issued.json.token.split('.');
    const forged = `${parts[0]}.${Buffer.from('{"evil":true}').toString('base64url')}.${parts[2]}`;
    const hb = await req(baseUrl, 'POST', '/api/heartbeat', { token: forged, installId: 'x' });
    assert.equal(hb.status, 403);
  } finally {
    server.close();
  }
});

test('revoke flips the license to revoked and blocks heartbeat', async () => {
  const { baseUrl, server } = await startServer();
  try {
    const issued = await req(baseUrl, 'POST', '/api/admin/licenses', { customer: 'ERP', features: ['core'] });
    const id = issued.json.license.id;
    const token = issued.json.token;

    const revoke = await req(baseUrl, 'POST', `/api/admin/licenses/${id}/revoke`);
    assert.equal(revoke.status, 200);
    assert.ok(revoke.json.license.revokedAt);

    const hb = await req(baseUrl, 'POST', '/api/heartbeat', { token, installId: 'y' });
    assert.equal(hb.status, 403);
  } finally {
    server.close();
  }
});

test('admin console renders at /admin with placeholders replaced', async () => {
  const { baseUrl, server } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/admin`);
    const html = await res.text();
    assert.equal(res.status, 200);
    // Admin console shell + token gate must render.
    assert.match(html, /gRouter Copilot/);
    assert.match(html, /Admin/);
    assert.ok(!html.includes('__STATS_JSON__'));
  } finally {
    server.close();
  }
});

test('customer root is the landing page, not the admin gate', async () => {
  const { baseUrl, server } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/`);
    const html = await res.text();
    assert.equal(res.status, 200);
    // A customer hitting / (e.g. an OAuth error redirect) must NOT see the admin gate.
    assert.ok(!html.includes('Masuk sebagai Admin'));
    assert.ok(!html.includes('ADMIN_TOKEN'));
  } finally {
    server.close();
  }
});
