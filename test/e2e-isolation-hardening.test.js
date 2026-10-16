/**
 * Regression — isolated E2E instance ownership & identity (P0).
 *
 * The original instance manager accepted ANY HTTP status < 500 as "healthy" and
 * never proved the responding process was the one it spawned. If ports 4690/4691
 * were already taken, the children failed to bind while the probe accepted the
 * FOREIGN server's response — so E2E could silently run against the wrong origin.
 *
 * These tests exercise the REAL lifecycle (spawning actual node processes and
 * binding real TCP sockets) and assert observable effects — not source strings:
 *   - ports free            → instance starts, identity proven
 *   - port occupied         → hard failure, foreign server survives untouched
 *   - wrong instance id     → rejected
 *   - frontend→wrong backend→ rejected
 *   - startup failure       → children + temp dir cleaned, ports released
 *   - runner (playwright) failure → instance still torn down
 *
 * Each test uses dynamically-chosen free ports so it never collides with a real
 * E2E run or production.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  startIsolatedInstance,
  portInUse,
  leftoverRunDirs,
  frontendIdentity,
  parseBackendId,
  probeIdentified,
} from '../e2e/isolated/instance.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Grab `n` distinct free ports without holding them (SO_REUSE tolerant). */
async function freePorts(n) {
  const { createServer: netServer } = await import('node:net');
  const holders = [];
  const ports = [];
  for (let i = 0; i < n; i++) {
    const srv = netServer();
    await new Promise((r) => srv.listen(0, () => r()));
    ports.push(srv.address().port);
    holders.push(srv);
  }
  await Promise.all(holders.map((s) => new Promise((r) => s.close(r))));
  return ports;
}

function startForeignServer(port) {
  const srv = createServer((req, res) => {
    if (req.url === '/api/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ status: 'ok', contractVersion: 1, imposter: true }));
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ instanceId: 'foreign-server-id', backendInstanceId: 'foreign-server-id' }));
  });
  return new Promise((resolve) => srv.listen(port, '0.0.0.0', () => resolve(srv)));
}

function closeServer(srv) {
  return new Promise((r) => srv.close(() => r()));
}

async function stillAlive(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
    return res.status === 200;
  } catch { return false; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1. Both ports free → instance starts and proves identity ────────────────
test('both ports free → isolated instance starts and self-identifies', async () => {
  const [be, fe] = await freePorts(2);
  const iso = startIsolatedInstance({ backendPort: be, frontendPort: fe });
  try {
    const h = await iso.start();
    assert.equal(h.instanceId, iso.instanceId);
    const health = await (await fetch(`http://127.0.0.1:${be}/api/health`)).json();
    assert.equal(parseBackendId(health), iso.instanceId, 'backend health must echo our nonce');
    const id = await (await fetch(`http://127.0.0.1:${fe}/__e2e/id`)).json();
    assert.equal(frontendIdentity(id, iso.instanceId), iso.instanceId, 'frontend must echo nonce + own backend');
  } finally {
    await iso.stop();
  }
});

// ── 2. Backend port occupied by a foreign server → hard fail, foreign survives
test('backend port occupied → startup refused; foreign server keeps running', async () => {
  const [be, fe] = await freePorts(2);
  const foreign = await startForeignServer(be);
  const iso = startIsolatedInstance({ backendPort: be, frontendPort: fe });
  let err = null;
  try {
    await iso.start();
  } catch (e) { err = e; }
  try {
    assert.ok(err, 'startup must fail when the backend port is taken');
    assert.match(err.message, new RegExp(String(be)), 'error must name the conflicting port');
    // The foreign process must NOT have been killed.
    assert.equal(await stillAlive(be), true, 'foreign server must survive untouched');
  } finally {
    await iso.stop();
    await closeServer(foreign);
  }
});

// ── 3. Frontend port occupied → safe failure ────────────────────────────────
test('frontend port occupied → startup refused safely', async () => {
  const [be, fe] = await freePorts(2);
  const foreign = await startForeignServer(fe);
  const iso = startIsolatedInstance({ backendPort: be, frontendPort: fe });
  let err = null;
  try {
    await iso.start();
  } catch (e) { err = e; }
  try {
    assert.ok(err, 'startup must fail when the frontend port is taken');
    assert.match(err.message, new RegExp(String(fe)));
    assert.equal(await stillAlive(fe), true, 'foreign frontend must survive untouched');
  } finally {
    await iso.stop();
    await closeServer(foreign);
  }
});

// ── 4. Health answers 200 but wrong instance id → rejected ──────────────────
test('healthy-but-impostor instance id → identity probe rejects', async () => {
  const [be, fe] = await freePorts(2);
  // Nonce handed to children ≠ nonce the probe demands → identity can never match.
  const iso = startIsolatedInstance({
    backendPort: be,
    frontendPort: fe,
    instanceId: 'e2e-real-nonce-aaaaaaaaaaaaaaaa',
    expectedInstanceId: 'e2e-different-nonce-bbbbbbbbbbbbbbbb',
    identityTimeoutMs: 2500,
  });
  let err = null;
  try {
    await iso.start();
  } catch (e) { err = e; } finally {
    await iso.stop();
  }
  assert.ok(err, 'a mismatching instance id must fail startup (never silently accept a 200)');
  assert.match(err.message, /identity not proven|did not become|instance/i);
});

// ── 5. Frontend healthy but pointing at the WRONG backend → rejected ────────
test('frontend pointing at a foreign backend → rejected', async () => {
  const [be, fe, foreignPort] = await freePorts(3);
  const foreign = await startForeignServer(foreignPort); // returns a different backend id
  const nonce = 'e2e-nonce-via-wrong-backend-123456';
  const child = spawn(process.execPath, [path.join(repoRoot, 'e2e', 'isolated', 'test-frontend.mjs')], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      FRONTEND_PORT: String(fe),
      BACKEND_URL: `http://127.0.0.1:${foreignPort}`,
      E2E_INSTANCE_ID: nonce,
    },
    stdio: 'ignore',
  });
  try {
    // Sanity: the frontend IS up and echoes our nonce, but its backend id differs.
    await probeIdentified(`http://127.0.0.1:${fe}/__e2e/id`, {
      expect: nonce,
      parseId: (b) => (b?.instanceId === nonce ? nonce : 'no-frontend-nonce'),
    });
    let err = null;
    try {
      await probeIdentified(`http://127.0.0.1:${fe}/__e2e/id`, {
        expect: nonce,
        parseId: (b) => frontendIdentity(b, nonce),
        timeoutMs: 2500,
      });
    } catch (e) { err = e; }
    assert.ok(err, 'a frontend wired to a foreign backend must be rejected');
    assert.match(err.message, /mismatch|identity not proven/);
  } finally {
    try { child.kill('SIGKILL'); } catch { /* ignore */ }
    await closeServer(foreign);
  }
});

// ── 6. Startup failure after spawn → children + temp dir cleaned ────────────
test('startup identity failure cleans up children and the temp run dir', async () => {
  const [be, fe] = await freePorts(2);
  const iso = startIsolatedInstance({
    backendPort: be,
    frontendPort: fe,
    instanceId: 'e2e-cleanup-nonce-1',
    expectedInstanceId: 'e2e-cleanup-nonce-2-mismatch',
    identityTimeoutMs: 2500,
  });
  let err = null;
  try {
    await iso.start();
  } catch (e) { err = e; }
  assert.ok(err, 'startup must fail (identity mismatch)');
  await sleep(600);
  const runDir = iso.handle.runDir;
  assert.ok(runDir, 'startup must allocate an owned run dir before spawning');
  assert.equal(existsSync(runDir), false, 'the failed instance run dir must be removed');
  // Children killed → ports released.
  assert.equal(await portInUse(be), false, 'backend port must be released after cleanup');
  assert.equal(await portInUse(fe), false, 'frontend port must be released after cleanup');
});

// ── 7. Playwright failure → runner still tears the instance down ────────────
test('runner tears down the instance even when Playwright finds no tests (exit!=0)', async () => {
  const before = new Set(leftoverRunDirs());
  const code = await new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(repoRoot, 'e2e', 'isolated', 'run.mjs'), '-g', 'zzz-no-such-test-zzz'], {
      cwd: repoRoot,
      env: { ...process.env, E2E_BACKEND_PORT: '4801', E2E_FRONTEND_PORT: '4802' },
      stdio: 'ignore',
    });
    p.on('exit', (c) => resolve(c ?? 1));
  });
  assert.notEqual(code, 0, 'a suite that matches no tests must exit non-zero');
  await sleep(700);
  assert.deepEqual(new Set(leftoverRunDirs()), before, 'runner must clean up its run dir on a failing Playwright run');
  assert.equal(await portInUse(4801), false, 'runner must release the backend port');
  assert.equal(await portInUse(4802), false, 'runner must release the frontend port');
});

// ── 8. stop() is idempotent ─────────────────────────────────────────────────
test('stop() is idempotent (safe to call twice)', async () => {
  const [be, fe] = await freePorts(2);
  const iso = startIsolatedInstance({ backendPort: be, frontendPort: fe });
  await iso.start();
  await iso.stop();
  await iso.stop(); // must not throw
  assert.equal(await portInUse(be), false);
});
