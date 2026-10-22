import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grouter-copilot.js');

// Regression for the 0.2.1→0.2.2 flow: `serve` in an EMPTY folder with no env
// must (a) respect --port, (b) scaffold a starter config instead of dying,
// (c) come up with health 503 {license:false} — honest, offline, no license.
test('serve: one-command flow in an empty folder — scaffold + health 503 license:false offline', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-serve-flow-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const port = 4791;
  const child = spawn(process.execPath, [bin, 'serve', '--port', String(port)], {
    cwd: dir,
    env: {
      // Simulate a fresh customer machine: no license anywhere, no inherited key.
      PATH: process.env.PATH,
      HOME: process.env.HOME,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });
  t.after(() => { try { child.kill('SIGKILL'); } catch {} });

  // (a)+(b) starter config scaffolded next to the fresh cwd
  const deadline = Date.now() + 20000;
  while (!existsSync(path.join(dir, 'copilot.config.cjs')) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.equal(existsSync(path.join(dir, 'copilot.config.cjs')), true, 'starter config must be scaffolded');
  assert.equal(existsSync(path.join(dir, 'skills/example.cjs')), true, 'example skill must be scaffolded');

  // (a) --port respected → server reachable on the exact port
  let health = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/copilot/health`, { signal: AbortSignal.timeout(2000) });
      health = { status: res.status, body: await res.json() };
      break;
    } catch { await new Promise((r) => setTimeout(r, 300)); }
  }
  assert.ok(health, 'sidecar must answer on the requested --port');
  assert.equal(health.status, 503, 'without a license health is honest 503');
  assert.equal(health.body.checks.license, false);
  assert.equal(health.body.checks.skills, true, 'example skill registered');

  // no license material may ever land in project files during this offline flow
  const envFile = existsSync(path.join(dir, '.env')) ? readFileSync(path.join(dir, '.env'), 'utf8') : '';
  assert.doesNotMatch(envFile, /GROUTER_LICENSE=(?:.|\\n)*[^\s]/, 'offline serve must not write license env');
});
