#!/usr/bin/env node
/**
 * Isolated E2E runner — the DEFAULT for `npm run e2e`.
 *
 * Boots a disposable instance (see isolated/instance.mjs), runs Playwright
 * against it, and ALWAYS tears the instance down — on success, failure, or a
 * signal (SIGINT/SIGTERM). Production (localhost:4600/4601) is never touched.
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
  try {
    await iso.start();
    const { baseUrl, adminToken } = iso.handle;

    // Point Playwright at the isolated frontend. E2E_BASE_URL + E2E_ADMIN_TOKEN
    // are the ONLY contract the specs/helpers need.
    const pwCli = path.join(repoRoot, 'frontend', 'node_modules', 'playwright', 'cli.js');
    const args = ['test', '--config=playwright.config.mjs', '--reporter=list', ...extraArgs];

    exitCode = await new Promise((resolve) => {
      const pw = spawn(process.execPath, [pwCli, ...args], {
        cwd: repoRoot,
        env: {
          ...process.env,
          E2E_BASE_URL: baseUrl,
          E2E_ADMIN_TOKEN: adminToken,
          E2E_ISOLATED: '1',
        },
        stdio: 'inherit',
      });
      for (const sig of ['SIGINT', 'SIGTERM']) {
        process.on(sig, () => { try { pw.kill(sig); } catch { /* ignore */ } });
      }
      pw.on('exit', (code) => resolve(code ?? 1));
    });
  } finally {
    await iso.stop();
  }
  process.exit(exitCode);
}

main().catch((err) => {
  process.stderr.write(`[e2e-runner] FATAL: ${err?.stack || err}\n`);
  process.exit(1);
});
