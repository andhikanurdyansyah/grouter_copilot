#!/usr/bin/env node
/**
 * Isolated E2E runner — the DEFAULT for `npm run e2e`.
 *
 * Boots a disposable instance (see isolated/instance.mjs), runs Playwright
 * against it, and ALWAYS tears the instance down — on success, failure, or a
 * signal (SIGINT/SIGTERM). Production (localhost:4600/4601) is never touched.
 *
 * Hardening (P0): the instance proves its own identity (a per-run nonce echoed
 * by the backend health endpoint and by the frontend's /__e2e/id probe, which
 * also confirms the frontend proxies to OUR backend). Port conflicts are a hard
 * failure. Cleanup runs on every exit path, including SIGINT/SIGTERM.
 *
 * Env knobs:
 *   E2E_PAY_SEAM=1     mock upstream reports SUCCESS (isolated only)
 *   E2E_BACKEND_PORT   default 4690
 *   E2E_FRONTEND_PORT  default 4691
 *   E2E_GREP=<pattern> pass -g <pattern> to Playwright
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startIsolatedInstance } from './instance.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

const extraArgs = process.argv.slice(2);

async function main() {
  const iso = startIsolatedInstance();
  let exitCode = 1;
  let pw = null;

  let signalShutdown = null;
  const onSignal = (sig) => {
    if (signalShutdown) return;
    signalShutdown = (async () => {
      exitCode = 130;
      try { if (pw) pw.kill(sig); } catch { /* ignore */ }
      try {
        await Promise.race([
          iso.stop(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('cleanup timeout')), 15_000)),
        ]);
      } catch (cleanupError) {
        process.stderr.write(`[e2e-runner] signal cleanup warning: ${cleanupError?.stack || cleanupError}\n`);
      }
      process.exit(130);
    })();
  };
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { void onSignal(sig); });

  try {
    await iso.start();
    const { baseUrl, adminToken } = iso.handle;

    // Point Playwright at the isolated frontend. E2E_BASE_URL + E2E_ADMIN_TOKEN
    // are the ONLY contract the specs/helpers need.
    const pwCli = path.join(repoRoot, 'frontend', 'node_modules', 'playwright', 'cli.js');
    const args = ['test', '--config=playwright.config.mjs', '--reporter=list', ...extraArgs];

    exitCode = await new Promise((resolve) => {
      pw = spawn(process.execPath, [pwCli, ...args], {
        cwd: repoRoot,
        env: {
          ...process.env,
          E2E_BASE_URL: baseUrl,
          E2E_ADMIN_TOKEN: adminToken,
          E2E_ISOLATED: '1',
        },
        stdio: 'inherit',
      });
      pw.on('exit', (code) => resolve(code ?? 1));
    });
  } finally {
    try {
      await iso.stop();
    } catch (cleanupError) {
      // Preserve a failing Playwright result; cleanup diagnostics must not mask it.
      if (exitCode === 0) throw cleanupError;
      process.stderr.write(`[e2e-runner] cleanup warning: ${cleanupError?.stack || cleanupError}\n`);
    }
  }
  process.exit(exitCode);
}

main().catch((err) => {
  process.stderr.write(`[e2e-runner] FATAL: ${err?.stack || err}\n`);
  process.exit(1);
});
