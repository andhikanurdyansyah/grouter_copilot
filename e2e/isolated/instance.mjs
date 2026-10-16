/**
 * Isolated E2E instance — lifecycle manager (hardened).
 *
 * start() → boots a disposable backend+frontend on non-production ports with a
 *           synthetic auth DB, a synthetic store, and a MOCK upstream; returns
 *           a handle { baseUrl, adminToken, ports, runDir, instanceId }.
 * stop()  → kills both children and removes the run dir. Safe to call twice.
 *
 * Hardening (P0) — the previous version accepted ANY HTTP status < 500 as
 * "healthy" and never proved the responding process was the one it spawned. If
 * ports 4690/4691 were already taken, the children failed to bind while the
 * probe happily accepted the foreign server's response. Now:
 *
 *   1. PORT PREFLIGHT — both ports must be free before spawning; a conflict is a
 *      hard failure (never kill the foreign process, never fall back to 4600/4601).
 *   2. INSTANCE IDENTITY — a per-run nonce (E2E_INSTANCE_ID) is given to both
 *      children; the runner then PROVES:
 *        - backend /api/health echoes the SAME nonce,
 *        - frontend /__e2e/id echoes the nonce AND reports a backendInstanceId
 *          that matches — i.e. the frontend proxies to OUR backend, not a
 *          foreign/other instance.
 *      A mismatched / missing nonce fails startup.
 *   3. CLEANUP — children + run dir are removed on startup failure, test failure,
 *      exception, and SIGINT/SIGTERM.
 *
 * No production data is copied and no real credential is loaded: the children
 * never import server/.env (the orchestrator does not call loadEnv()).
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertIsolatedConfig } from './guard.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const serverDir = path.join(repoRoot, 'server');

const ADMIN_TOKEN = 'e2e-isolated-admin-token';
const BETTER_AUTH_SECRET = 'e2e-isolated-better-auth-secret-0123456789';

const AUTH_TABLES = ['user', 'session', 'account', 'organization', 'member', 'invitation', 'verification'];

export const RUN_DIR_PREFIX = 'copilot-e2e-iso-';

function log(msg) {
  process.stderr.write(`[e2e-iso] ${msg}\n`);
}

/** New per-run secret so an impostor server on the port cannot be mistaken for ours. */
function newInstanceId() {
  return 'e2e-' + randomBytes(16).toString('hex');
}

/** Backend identity parse: the response must carry OUR nonce verbatim. */
export const parseBackendId = (b) => b?.instanceId;

/**
 * Frontend identity parse: the frontend must echo OUR nonce AND report a
 * backendInstanceId equal to ours (proving it proxies to OUR backend). Returns
 * the nonce on success, or a descriptive mismatch string so the probe keeps
 * waiting / ultimately fails.
 */
export function frontendIdentity(b, expect) {
  if (b?.instanceId === expect && b?.backendInstanceId === expect) return expect;
  return `mismatch(frontend=${b?.instanceId}/${b?.backendInstanceId}, want ${expect})`;
}

/**
 * True when something is already listening on the port. We deliberately do NOT
 * kill it — a conflict is a hard error (the port belongs to someone else).
 *
 * Binds the SAME way the real services do (all interfaces, no host argument) so
 * the preflight detects exactly the collisions that would break `listen()`.
 */
export function portInUse(port) {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', (err) => resolve(err.code === 'EADDRINUSE'));
    srv.once('listening', () => srv.close(() => resolve(false)));
    srv.listen(port);
  });
}

/** Count leftover isolated run dirs (used to prove cleanup on failure). */
export function leftoverRunDirs() {
  try {
    return readdirSync(tmpdir()).filter((n) => n.startsWith(RUN_DIR_PREFIX));
  } catch { return []; }
}

/**
 * Wait until `url` returns a payload whose IDENTITY matches `expect`.
 * `parseId` extracts the identity from the parsed JSON body; it must equal
 * `expect` or the probe keeps waiting (and ultimately fails). This is what turns
 * "something answered" into "OUR instance answered". Throws on timeout so a
 * mismatching/absent identity is a hard startup failure, never a silent accept.
 */
export async function probeIdentified(url, { expect, parseId = (b) => b?.instanceId, timeoutMs = 30_000, abortWhen } = {}) {
  const start = Date.now();
  let last = 'no response';
  while (Date.now() - start < timeoutMs) {
    // Fast-fail: if a child we spawned has already exited, waiting out the full
    // timeout is pointless — surface the reason immediately.
    if (abortWhen) {
      const reason = abortWhen();
      if (reason) throw new Error(`instance identity not proven at ${url}: ${reason}`);
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      const body = await res.json().catch(() => null);
      const got = parseId(body);
      if (res.status >= 200 && res.status < 500 && got === expect) return true;
      last = `status ${res.status}, id ${JSON.stringify(got)} (want ${expect})`;
    } catch (e) {
      last = `error ${e?.message || e}`;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`instance identity not proven at ${url} within ${timeoutMs}ms (last: ${last})`);
}

/**
 * Synthesise an EMPTY auth DB with the correct better-auth schema, in a child
 * process whose cwd is server/ (so `better-auth/*` resolves against
 * server/node_modules). Deliberately NOT a copy of production.
 */
function synthesiseAuthSchema(authDbFile) {
  const script = `
    process.env.NODE_ENV = 'test';
    process.env.AUTH_DB_FILE = process.argv[1];
    const { getMigrations } = await import('better-auth/db/migration');
    const { auth } = await import('./src/auth.js');
    const m = await getMigrations(auth.options);
    await m.runMigrations();
    process.stdout.write('SCHEMA_OK');
  `;
  const res = spawnSync(process.execPath, ['--input-type=module', '-e', script, authDbFile], {
    cwd: serverDir,
    encoding: 'utf8',
    timeout: 60_000,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      AUTH_DB_FILE: authDbFile,
      BETTER_AUTH_API_KEY: '',
    },
  });
  if (res.status !== 0 || !/SCHEMA_OK/.test(res.stdout || '')) {
    throw new Error(`auth schema synthesis failed (exit ${res.status}):\n${res.stdout}\n${res.stderr}`);
  }
}

export function startIsolatedInstance({
  backendPort = Number(process.env.E2E_BACKEND_PORT || 4690),
  frontendPort = Number(process.env.E2E_FRONTEND_PORT || 4691),
  paySeam = process.env.E2E_PAY_SEAM === '1',
  // How long the identity probe waits before declaring startup failed. 30s is
  // generous for a cold boot; tests dial it down to keep the suite fast.
  identityTimeoutMs = Number(process.env.E2E_IDENTITY_TIMEOUT_MS || 30_000),
  // Test seam: the nonce handed to the children vs the nonce the probe demands.
  // Both default to the same freshly-generated value (production behaviour); a
  // test may split them to force a real identity mismatch and prove rejection.
  instanceId = newInstanceId(),
  expectedInstanceId = instanceId,
} = {}) {
  const children = [];
  let stopped = false;
  let runDir = null;

  const handle = {};

  async function cleanupChildren() {
    for (const c of children) { try { c.kill('SIGTERM'); } catch { /* gone */ } }
    await new Promise((r) => setTimeout(r, 400));
    for (const c of children) { try { if (c.exitCode === null) c.kill('SIGKILL'); } catch { /* ignore */ } }
    if (runDir && existsSync(runDir)) {
      try { rmSync(runDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  async function start() {
    // ── Port preflight: fail closed BEFORE spawning anything ──────────────
    for (const [label, port] of [['backendPort', backendPort], ['frontendPort', frontendPort]]) {
      if (await portInUse(port)) {
        // Never kill the foreign process; never fall back to production ports.
        throw new Error(`E2E refused: ${label} ${port} is already in use by another process. Free it or set E2E_BACKEND_PORT/E2E_FRONTEND_PORT to a distinct pair.`);
      }
    }

    runDir = mkdtempSync(path.join(tmpdir(), RUN_DIR_PREFIX));
    // Publish the owned directory immediately so callers/tests can verify that
    // this exact instance was removed even when unrelated instances overlap.
    handle.runDir = runDir;
    const dataDir = path.join(runDir, 'data');
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const dataFile = path.join(dataDir, 'store.json');
    const authDbFile = path.join(dataDir, 'auth.sqlite');
    const baseUrl = `http://localhost:${frontendPort}`;

    // Fail-closed BEFORE any mutation or process spawn.
    assertIsolatedConfig({
      nodeEnv: 'test',
      mockUpstream: true,
      backendPort,
      frontendPort,
      dataDir,
      dataFile,
      authDbFile,
      baseUrl,
      klikqrisMode: 'sandbox',
      prodDataDir: path.join(serverDir, 'data'),
    });
    log('isolation guard: PASS');

    try {
      synthesiseAuthSchema(authDbFile);
      // Verify the schema landed (defence in depth).
      const { DatabaseSync } = await import('node:sqlite');
      const db = new DatabaseSync(authDbFile, { readOnly: true });
      const tables = db.prepare("select name from sqlite_master where type='table'").all().map((r) => r.name);
      db.close();
      for (const t of AUTH_TABLES) {
        if (!tables.includes(t)) throw new Error(`auth schema missing table: ${t}`);
      }
      log(`auth schema: synthesised (${dataDir}, 0 rows, no production copy)`);

      const backend = spawn(process.execPath, [path.join(here, 'test-backend.mjs')], {
        cwd: repoRoot,
        env: {
          ...process.env,
          NODE_ENV: 'test',
          PORT: String(backendPort),
          DATA_FILE: dataFile,
          AUTH_DB_FILE: authDbFile,
          ADMIN_TOKEN,
          BETTER_AUTH_SECRET,
          BETTER_AUTH_URL: baseUrl,
          BETTER_AUTH_TRUSTED_ORIGINS: `${baseUrl},http://127.0.0.1:${frontendPort}`,
          BETTER_AUTH_API_KEY: '',
          KLIKQRIS_MODE: 'sandbox',
          KLIKQRIS_API_KEY: 'e2e-mock-key',
          KLIKQRIS_MERCHANT_ID: 'e2e-mock-merchant',
          GROUTER_API_KEY: 'e2e-mock-gateway-key',
          GROUTER_BASE_URL: 'https://mock.invalid',
          GROUTER_CHECK_USAGE_URL: 'https://mock.invalid/api/check-usage',
          E2E_PAY_SEAM: paySeam ? '1' : '0',
          // Per-run identity: both children echo this so we can PROVE they are ours.
          E2E_INSTANCE_ID: instanceId,
        },
        stdio: ['ignore', 'inherit', 'inherit'],
      });
      children.push(backend);

      const frontend = spawn(process.execPath, [path.join(here, 'test-frontend.mjs')], {
        cwd: repoRoot,
        env: {
          ...process.env,
          NODE_ENV: 'test',
          FRONTEND_PORT: String(frontendPort),
          BACKEND_URL: `http://127.0.0.1:${backendPort}`,
          E2E_INSTANCE_ID: instanceId,
        },
        stdio: ['ignore', 'inherit', 'inherit'],
      });
      children.push(frontend);

      // ── Identity verification ────────────────────────────────────────────
      // If a child dies during the wait, fail immediately with its exit code.
      const deadReason = () => {
        for (const [label, c] of [['backend', children[0]], ['frontend', children[1]]]) {
          if (c && c.exitCode !== null) return `${label} exited early with code ${c.exitCode}`;
        }
        return null;
      };
      // Backend must echo OUR nonce on /api/health.
      await probeIdentified(`http://127.0.0.1:${backendPort}/api/health`, {
        expect: expectedInstanceId,
        parseId: parseBackendId,
        abortWhen: deadReason,
        timeoutMs: identityTimeoutMs,
      });
      // Frontend must echo OUR nonce AND report a backendInstanceId equal to
      // ours — proving it proxies to OUR backend (not a foreign/other instance).
      await probeIdentified(`http://127.0.0.1:${frontendPort}/__e2e/id`, {
        expect: expectedInstanceId,
        parseId: (b) => frontendIdentity(b, expectedInstanceId),
        abortWhen: deadReason,
        timeoutMs: identityTimeoutMs,
      });
      log(`both isolated services healthy + identity-proven (${instanceId})`);

      Object.assign(handle, { baseUrl, adminToken: ADMIN_TOKEN, backendPort, frontendPort, runDir, dataDir, dataFile, authDbFile, instanceId });
      return handle;
    } catch (err) {
      // Any startup failure MUST tear down whatever was spawned + the run dir.
      await cleanupChildren();
      stopped = true;
      throw err;
    }
  }

  async function stop() {
    if (stopped) return;
    stopped = true;
    await cleanupChildren();
  }

  return { start, stop, handle, instanceId };
}
