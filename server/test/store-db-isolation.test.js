/**
 * Regression — test-run STORE isolation (P1).
 *
 * Same class of defect as the auth-DB leak (see auth-db-isolation.test.js), on
 * the store side: `createCopilotServer` defaulted `dataFile` to the PRODUCTION
 * `server/data/store.json` whenever the caller did not pass one, regardless of
 * NODE_ENV. Any `node --test` that booted the server without an explicit
 * dataFile wrote QA licenses/orders straight into the production store (this bit
 * us on 2026-10-13: a new test created 7 licenses in prod).
 *
 * The fix derives an isolated per-process temp store under NODE_ENV=test when no
 * dataFile/DATA_FILE is supplied. This test proves it the only way that matters:
 * boot the server in a child with a bare `node --test` env, issue a license, and
 * assert the PRODUCTION store.json is byte-for-byte unchanged.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(__dirname, '..');

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function counts(file) {
  const s = JSON.parse(readFileSync(file, 'utf8'));
  return { accounts: s.accounts.length, licenses: s.licenses.length, orders: s.orders.length };
}

test('NODE_ENV=test without DATA_FILE never writes to the production store', () => {
  // CI starts from a clean checkout, where the ignored runtime store does not
  // exist. Seed a temporary JSON store for the child to use as its production
  // sentinel; this keeps the test deterministic without adding runtime data to
  // the repository or changing production behavior.
  const sentinelDir = mkdtempSync(path.join(tmpdir(), 'copilot-storeiso-prod-'));
  const sentinel = path.join(sentinelDir, 'store.json');
  writeFileSync(sentinel, JSON.stringify({ accounts: [], licenses: [], orders: [], usage: [], notifications: [], settings: {} }));
  const originalDataDir = process.env.DATA_FILE;
  process.env.DATA_FILE = sentinel;
  const beforeHash = sha256(sentinel);
  const beforeCounts = counts(sentinel);

  const childDir = mkdtempSync(path.join(tmpdir(), 'copilot-storeiso-'));
  const childFile = path.join(childDir, 'child.mjs');
  writeFileSync(
    childFile,
    `
process.env.NODE_ENV = 'test';
delete process.env.DATA_FILE;       // the whole point: no explicit store path
process.env.AUTH_DB_FILE ||= '';    // auth isolation derives its own temp DB
process.env.KLIKQRIS_API_KEY ||= 'test-key';
process.env.KLIKQRIS_MERCHANT_ID ||= 'test-merchant';

const { createCopilotServer } = await import(${JSON.stringify(path.join(serverDir, 'src', 'server.js'))});
// NOTE: no dataFile passed → server must derive an isolated temp store under NODE_ENV=test.
const { server, service } = createCopilotServer({ adminToken: 'iso-admin' });
await new Promise((r) => server.listen(0, r));
const base = 'http://127.0.0.1:' + server.address().port;
const res = await fetch(base + '/api/admin/licenses', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Bearer iso-admin' },
  body: JSON.stringify({ customer: 'ISO-PROBE', planKey: null }),
});
process.stdout.write('ISSUE=' + res.status);
await res.text();
await new Promise((r) => server.close(r));
process.exit(0);
`,
  );

  const child = spawnSync(process.execPath, [childFile], {
    cwd: serverDir,
    encoding: 'utf8',
    timeout: 60000,
    env: { ...process.env, NODE_ENV: 'test', DATA_FILE: '', AUTH_DB_FILE: '' },
  });
  assert.equal(child.status, 0, `child failed:\n${child.stderr}\n${child.stdout}`);
  assert.match(child.stdout, /ISSUE=201/, `license issue did not succeed: ${child.stdout}`);

  assert.deepEqual(counts(sentinel), beforeCounts, 'test run must not add accounts/licenses/orders to the production store');
  assert.equal(sha256(sentinel), beforeHash, 'test run must not modify the production store file at all');
  if (originalDataDir === undefined) delete process.env.DATA_FILE;
  else process.env.DATA_FILE = originalDataDir;
});
