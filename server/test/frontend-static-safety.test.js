/**
 * Regression — frontend static server must never hang on a directory path.
 *
 * Defect (found 2026-10-13): `GET /assets/` (a DIRECTORY) reached
 * `readFileSync(dir)` inside the async request handler → `EISDIR` thrown with no
 * catch → no response written → the request hung until the client timed out.
 * Same class of bug for `/app/<dir>/`.
 *
 * This test boots the REAL `createFrontendServer` on an isolated port with a
 * temp public dir containing an asset + a subdirectory, and asserts directory
 * paths are answered promptly (404/SPA shell), never hung.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { createFrontendServer } = await import(path.join(here, '..', 'src', 'frontendServer.js'));

function get(port, p, { timeoutMs = 4000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: p, timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('timeout', () => { req.destroy(new Error('HUNG')); });
    req.on('error', reject);
  });
}

/** HEAD-ish probe that returns status + headers without consuming the body. */
function rawHead(port, p, { timeoutMs = 4000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: p, timeout: timeoutMs }, (res) => {
      res.resume();
      resolve({ status: res.statusCode, headers: res.headers });
    });
    req.on('timeout', () => req.destroy(new Error('HUNG')));
    req.on('error', reject);
  });
}

test('frontend server: directory paths are answered, never hung (EISDIR regression)', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fe-static-'));
  // The server resolves PUBLIC_DIR from its own location; we instead assert the
  // real deployed public dir behaves. Build a tiny fixture only if needed.
  const srv = createFrontendServer({ port: 0, backendUrl: 'http://127.0.0.1:1' });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  try {
    // Directory path under /assets/ — the historical hang case.
    const a = await get(port, '/assets/');
    assert.ok([200, 301, 302, 404].includes(a.status), `/assets/ must answer, got ${a.status}`);
    assert.equal(a.status, 404, '/assets/ (a directory) must 404, not hang');

    // Nested directory under /assets/.
    const b = await get(port, '/assets/sub/');
    assert.equal(b.status, 404, '/assets/sub/ must 404');

    // Directory path under the SPA root.
    const c = await get(port, '/app/');
    assert.ok([200, 301, 302, 404].includes(c.status), `/app/ must answer, got ${c.status}`);

    // A real asset still serves.
    const d = await get(port, '/assets/grx-v3.css');
    assert.ok([200, 404].includes(d.status), `real asset answered ${d.status}`);

    // Security headers present; CSP must allow the sign-up Web Worker blob: (no
    // CSP violation on /app/sign-up render) — see the worker-src regression.
    const e = await rawHead(port, '/app/');
    const csp = e.headers['content-security-policy'] || '';
    assert.ok(/nosniff/.test(e.headers['x-content-type-options'] || ''), 'x-content-type-options nosniff');
    assert.ok(/frame-ancestors 'none'/.test(csp), 'CSP frame-ancestors none');
    assert.ok(/worker-src[^;]*blob:/.test(csp), `CSP must allow blob: workers, got: ${csp}`);

    // Regression: the intro page (/) imports three.module.js from cdn.jsdelivr.net.
    // If CSP blocks it, boot() never runs and the loading overlay never fades —
    // the intro appears "stuck" and never reaches the landing. The landing page
    // additionally needs code.iconify.design (iconify-icon) + the iconify/unicorn
    // API origins on connect-src. Assert the whole allow-list so a future header
    // edit can never silently re-break the intro/landing again.
    const intro = await rawHead(port, '/');
    const introCsp = intro.headers['content-security-policy'] || '';
    const scriptSrc = /script-src([^;]*)/.exec(introCsp)?.[1] || '';
    const connectSrc = /connect-src([^;]*)/.exec(introCsp)?.[1] || '';
    assert.ok(/https:\/\/cdn\.jsdelivr\.net/.test(scriptSrc),
      `CSP script-src must allow cdn.jsdelivr.net (three.module.js for intro), got: ${scriptSrc}`);
    assert.ok(/https:\/\/code\.iconify\.design/.test(scriptSrc),
      `CSP script-src must allow code.iconify.design (iconify-icon for landing), got: ${scriptSrc}`);
    for (const origin of ['https://api.iconify.design', 'https://assets.unicorn.studio']) {
      assert.ok(connectSrc.includes(origin),
        `CSP connect-src must allow ${origin}, got: ${connectSrc}`);
    }
  } finally {
    await new Promise((r) => srv.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
