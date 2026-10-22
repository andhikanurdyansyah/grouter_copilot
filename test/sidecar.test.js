import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createCopilot } from '../src/index.js';
import { startSidecar } from '../src/sidecar/server.js';

function makeTempProject() {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-sidecar-'));
  writeFileSync(
    path.join(dir, 'skill.mjs'),
    `export default { name: 'sales-summary', description: 'Summarize sales', parameters: { type: 'object', properties: {}, required: [] }, readOnly: true, async run() { return { total: 42 }; } };\n`,
  );
  writeFileSync(
    path.join(dir, 'copilot.config.mjs'),
    "import skill from './skill.mjs'; export default { skills: [skill] };\n",
  );
  return { dir, configPath: path.join(dir, 'copilot.config.mjs') };
}

const fakeAdapter = { async complete() { return { answer: 'Ringkasan: total 42', usage: {} }; } };
const permissiveGate = { enforce() { /* unit-test permissive */ } };

// The gateway upstream is NOT touched by the sidecar tests: gatewayChat is given
// a fake fetchImpl (matches src/index.js contract: injected fetchImpl).
const fakeGatewayFetch = async (url, init) => ({
  ok: true,
  status: 200,
  json: async () => ({ status: 'ok', answer: 'halo dari gateway', sources: ['sales-summary'] }),
});

async function boot(t, { fetchImpl = fakeGatewayFetch, env = {} } = {}) {
  const { dir, configPath } = makeTempProject();
  const copilot = await createCopilot({ configPath, adapter: fakeAdapter, licenseGate: permissiveGate });
  const prev = {};
  for (const k of Object.keys(env)) { prev[k] = process.env[k]; process.env[k] = env[k]; }
  const server = await startSidecar({ port: 0, copilot, gatewayUrl: 'https://gw.example/api/copilot/chat', fetchImpl });
  t.after(async () => {
    await new Promise((r) => server.close(r));
    for (const k of Object.keys(prev)) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; }
    rmSync(dir, { recursive: true, force: true });
  });
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

test('sidecar health: 200 ok with checks when license+skills+provider resolve', async (t) => {
  const base = await boot(t, {
    env: { GROUTER_GATEWAY_URL: 'https://gw.example/api/copilot/chat', GROUTER_SIDECAR_WIDGET_DIR: '' },
  });
  const res = await fetch(`${base}/api/copilot/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
  assert.equal(typeof body.checks.license, 'boolean');
});

test('sidecar chat: happy path returns gateway answer + sources', async (t) => {
  const base = await boot(t);
  const res = await fetch(`${base}/api/copilot/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'ringkas sales', userId: 'u1' }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.answer, 'halo dari gateway');
});

test('sidecar chat: missing message → 400 INVALID_REQUEST (no upstream call)', async (t) => {
  let upstreamCalled = false;
  const base = await boot(t, { fetchImpl: async () => { upstreamCalled = true; return { ok: true, status: 200, json: async () => ({ status: 'ok', answer: 'x' }) }; } });
  const res = await fetch(`${base}/api/copilot/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.code, 'INVALID_REQUEST');
  assert.equal(upstreamCalled, false);
});

test('sidecar chat: upstream 500 → 502 with retryable envelope, process alive', async (t) => {
  const base = await boot(t, {
    fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({ error: { message: 'upstream down' } }) }),
  });
  const res = await fetch(`${base}/api/copilot/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'hi' }),
  });
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.status, 'error');
  // sidecar process still healthy afterwards
  const h = await fetch(`${base}/api/copilot/health`);
  assert.equal(h.status, 200);
});

test('sidecar chat: malformed JSON → 400, not 500', async (t) => {
  const base = await boot(t);
  const res = await fetch(`${base}/api/copilot/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops',
  });
  assert.equal(res.status, 400);
});

test('sidecar CORS: closed by default (no allow-origin header)', async (t) => {
  const base = await boot(t);
  const res = await fetch(`${base}/api/copilot/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    body: JSON.stringify({ message: 'hi' }),
  });
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('sidecar CORS: explicit allowlist origin is honored', async (t) => {
  const base = await boot(t, { env: { GROUTER_SIDECAR_ALLOWED_ORIGIN: 'https://app.example' } });
  const res = await fetch(`${base}/api/copilot/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://app.example' },
    body: JSON.stringify({ message: 'hi' }),
  });
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://app.example');
});

test('sidecar widget: /copilot.js and /copilot.css served with embedded assets', async (t) => {
  const base = await boot(t, { env: { GROUTER_SIDECAR_WIDGET_DIR: path.resolve('dist-widget') } });
  const js = await fetch(`${base}/copilot.js`);
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);
  const text = await js.text();
  assert.match(text, /grouterCopilotLoaded/);
  const css = await fetch(`${base}/copilot.css`);
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /css/);
});

test('sidecar unknown route → 404 envelope', async (t) => {
  const base = await boot(t);
  const res = await fetch(`${base}/api/nope`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.code, 'NOT_FOUND');
});
