/**
 * Isolated E2E instance — lifecycle manager.
 *
 * start() → boots a disposable backend+frontend on non-production ports with a
 *           synthetic auth DB, a synthetic store, and a MOCK upstream; returns
 *           a handle { baseUrl, adminToken, ports, runDir }.
 * stop()  → kills both children and removes the run dir. Safe to call twice.
 *
 * No production data is copied and no real credential is loaded: the children
 * never import server/.env (the orchestrator does not call loadEnv()).
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
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

function log(msg) {
  process.stderr.write(`[e2e-iso] ${msg}\n`);
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
} = {}) {
  const children = [];
  let stopped = false;
  let runDir = null;

  const handle = {};

  async function waitForHealth(url, label, { timeoutMs = 30_000 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
        if (res.status >= 200 && res.status < 500) return true;
      } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`${label} did not become healthy at ${url} within ${timeoutMs}ms`);
  }

  async function start() {
    runDir = mkdtempSync(path.join(tmpdir(), 'copilot-e2e-iso-'));
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
      },
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    children.push(frontend);

    await waitForHealth(`http://127.0.0.1:${backendPort}/api/health`, 'isolated backend');
    await waitForHealth(`http://127.0.0.1:${frontendPort}/app/`, 'isolated frontend');
    log('both isolated services healthy');

    Object.assign(handle, { baseUrl, adminToken: ADMIN_TOKEN, backendPort, frontendPort, runDir, dataDir, dataFile, authDbFile });
    return handle;
  }

  async function stop() {
    if (stopped) return;
    stopped = true;
    for (const c of children) { try { c.kill('SIGTERM'); } catch { /* gone */ } }
    await new Promise((r) => setTimeout(r, 400));
    for (const c of children) { try { if (c.exitCode === null) c.kill('SIGKILL'); } catch { /* ignore */ } }
    if (runDir && existsSync(runDir)) {
      try { rmSync(runDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  return { start, stop, handle };
}
