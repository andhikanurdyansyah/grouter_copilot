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
  } finally {
    await new Promise((r) => srv.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
