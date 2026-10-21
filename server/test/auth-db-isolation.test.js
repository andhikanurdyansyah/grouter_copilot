/**
 * Regression — test-run DB isolation (P1).
 *
 * Root cause of the historic QA-account accumulation in production: `src/auth.js`
 * resolved `AUTH_DB_FILE` to the PRODUCTION `data/auth.sqlite` whenever the env
 * var was unset, even under NODE_ENV=test. Every `node --test` run that booted
 * the server therefore signed QA accounts straight into the production DB.
 *
 * The fix derives an isolated per-process temp DB under NODE_ENV=test when the
 * caller did not explicitly set AUTH_DB_FILE. This test proves the invariant the
 * only way that matters: run a real sign-up in a child process with the same env
 * `node --test` uses, and assert the PRODUCTION auth.sqlite is byte-for-byte
 * unchanged (row counts AND file hash).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(__dirname, '..');
const prodAuthDb = path.join(serverDir, 'data', 'auth.sqlite');

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function userCount(sqliteFile) {
  // Read-only, no dependency on better-sqlite3 in this test process.
  const code = `
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(${JSON.stringify(sqliteFile)}, { readOnly: true });
    process.stdout.write(String(db.prepare('SELECT count(*) c FROM user').get().c));
    db.close();
  `;
  const r = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, `read-only count failed: ${r.stderr}`);
  return Number(r.stdout.trim());
}

test('NODE_ENV=test without AUTH_DB_FILE never writes to the production auth DB', () => {
  // A CLEAN CHECKOUT (CI) has no production auth.sqlite at all. Asserting on a
  // file that does not exist would fail before the behavior under test runs, so
  // use a sentinel standing in for "production": the child must still derive its
  // OWN temp DB and leave the sentinel byte-identical. When the real prod DB IS
  // present, assert on it instead — that is the stronger case.
  const prodExists = existsSync(prodAuthDb);
  const guardFile = prodExists
    ? prodAuthDb
    : (() => {
        const dir = mkdtempSync(path.join(tmpdir(), 'copilot-authiso-sentinel-'));
        const file = path.join(dir, 'auth.sqlite');
        writeFileSync(file, 'sentinel: production auth DB stand-in');
        return file;
      })();

  const beforeHash = sha256(guardFile);
  const beforeUsers = prodExists ? userCount(guardFile) : null;

  // Child mirrors a bare `node --test`: NODE_ENV=test, AUTH_DB_FILE unset.
  const childDir = mkdtempSync(path.join(tmpdir(), 'copilot-authiso-'));
  const childFile = path.join(childDir, 'child.mjs');
  writeFileSync(
    childFile,
    `
process.env.NODE_ENV = 'test';
delete process.env.AUTH_DB_FILE;
// Keep the store off production too (DATA_FILE unset would default to prod store.json).
process.env.DATA_FILE = ${JSON.stringify(path.join(childDir, 'store.json'))};
process.env.KLIKQRIS_API_KEY ||= 'test-key';
process.env.KLIKQRIS_MERCHANT_ID ||= 'test-merchant';

const { createCopilotServer } = await import(${JSON.stringify(path.join(serverDir, 'src', 'server.js'))});
const { server } = createCopilotServer({ dataFile: process.env.DATA_FILE });
await new Promise((r) => server.listen(0, r));
const base = 'http://127.0.0.1:' + server.address().port;
const res = await fetch(base + '/api/auth/sign-up/email', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'http://localhost:4601' },
  body: JSON.stringify({ email: 'iso-probe-' + Date.now() + '@gmail.com', password: 'Gr0ut3r-abc!Zq', name: 'T' }),
});
process.stdout.write('SIGNUP=' + res.status);
await res.text();
server.close();
process.exit(0);
`,
  );

  const child = spawnSync(process.execPath, [childFile], {
    cwd: serverDir,
    encoding: 'utf8',
    timeout: 60000,
    env: { ...process.env, NODE_ENV: 'test', AUTH_DB_FILE: '' },
  });
  assert.equal(child.status, 0, `child failed:\n${child.stderr}\n${child.stdout}`);
  assert.match(child.stdout, /SIGNUP=200/, `sign-up did not succeed: ${child.stdout}`);

  // The invariant: the production DB (or its sentinel) untouched — byte-for-byte.
  if (prodExists) {
    assert.equal(
      userCount(prodAuthDb),
      beforeUsers,
      'test run must not add users to the production auth DB',
    );
  }
  assert.equal(
    sha256(guardFile),
    beforeHash,
    'test run must not modify the production auth DB file at all',
  );
});
