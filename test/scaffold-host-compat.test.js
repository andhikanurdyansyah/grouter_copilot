// Regression tests for scaffold host-compatibility defects (D4, D5) — 2026-10-13.
//
// D4: the scaffolded Node/vanilla handlers used the Express-only API
//     `res.status(...).json(...)`. Mounted on plain node:http they threw
//     "TypeError: res.status is not a function" and reset the connection.
// D5: the scaffolded chat route called `gatewayChat` with no try/catch, so an
//     unreachable gateway raised an unhandled CopilotError and CRASHED the host.
//
// Each test scaffolds a real project from the CLI, then runs a small worker
// (spawned with the project dir as cwd, like a real customer host) that mounts
// the generated handler on PLAIN node:http and reports the response.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Scaffold a fresh vanilla-Node project (with @grouter/copilot resolvable). */
function scaffold() {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-d45-'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'd45-app', version: '1.0.0', type: 'module' }), 'utf8');
  // The scaffold imports "@grouter/copilot"; resolve it to this repo via node_modules
  // so the generated handlers are actually loadable (mirrors a real npm install).
  const nm = path.join(dir, 'node_modules', '@grouter');
  mkdirSync(nm, { recursive: true });
  symlinkSync(root, path.join(nm, 'copilot'), 'dir');
  const run = spawnSync(process.execPath, [path.join(root, 'bin/grouter-copilot.js'), 'init'], {
    cwd: dir, encoding: 'utf8', timeout: 15_000,
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  return dir;
}

/**
 * Run a worker in `cwd` that mounts `handlerFile`/`exportName` on plain node:http
 * and prints a RESULT line. cwd = the customer project (needed because the
 * scaffolded handler resolves `copilot.config.js` from process.cwd()).
 */
function runWorker(cwd, handlerFile, exportName, { port, gatewayUrl, method, urlPath, body }) {
  const worker = `
import http from "node:http";
${gatewayUrl ? `process.env.GROUTER_GATEWAY_URL = ${JSON.stringify(gatewayUrl)};` : ''}
let crash = null;
process.on("uncaughtException", (e) => { crash = e.code || e.message; });
const mod = await import(${JSON.stringify('file://' + path.join(cwd, handlerFile))});
const fn = mod[${JSON.stringify(exportName)}];
const server = http.createServer(async (req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", async () => {
    req.body = b ? JSON.parse(b) : {};
    try { await fn(req, res); }
    catch (e) { res.statusCode = 599; res.end(JSON.stringify({ threw: e.code || String(e) })); }
  });
});
await new Promise((r) => server.listen(${port}, r));
const call = () => fetch("http://127.0.0.1:${port}${urlPath}", {
  method: ${JSON.stringify(method)},
  headers: { "content-type": "application/json" },
  body: ${body ? `JSON.stringify(${JSON.stringify(body)})` : 'undefined'},
});
let status = 0, text = "", alive = false;
try { const r = await call(); status = r.status; text = await r.text(); } catch (e) { text = "FETCH_FAILED:" + e.message; }
try { const r2 = await call(); alive = r2.status > 0; } catch { alive = false; }
console.log("RESULT " + JSON.stringify({ status, body: text, alive, crash }));
process.exit(0);
`;
  const workerPath = path.join(cwd, '__worker.mjs');
  writeFileSync(workerPath, worker, 'utf8');
  const run = spawnSync(process.execPath, [workerPath], { cwd, encoding: 'utf8', timeout: 30_000 });
  const line = (run.stdout || '').split('\n').find((l) => l.startsWith('RESULT '));
  assert.ok(line, `worker produced no RESULT (stdout=${run.stdout} stderr=${run.stderr})`);
  return JSON.parse(line.slice('RESULT '.length));
}

/**
 * Same as runWorker but for a CommonJS handler (.cjs) — the worker itself stays
 * ESM and loads the CJS module via createRequire semantics (dynamic import of a
 * .cjs file returns its module.exports as `default`).
 */
function runWorkerCjs(cwd, handlerFile, exportName, { port, gatewayUrl, method, urlPath, body }) {
  const worker = `
import http from "node:http";
import { createRequire } from "node:module";
${gatewayUrl ? `process.env.GROUTER_GATEWAY_URL = ${JSON.stringify(gatewayUrl)};` : ''}
let crash = null;
process.on("uncaughtException", (e) => { crash = e.code || e.message; });
const require = createRequire(${JSON.stringify(path.join(cwd, '__worker.mjs'))});
const mod = require(${JSON.stringify(path.join(cwd, handlerFile))});
const fn = mod[${JSON.stringify(exportName)}];
const server = http.createServer(async (req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", async () => {
    req.body = b ? JSON.parse(b) : {};
    try { await fn(req, res); }
    catch (e) { res.statusCode = 599; res.end(JSON.stringify({ threw: e.code || String(e) })); }
  });
});
await new Promise((r) => server.listen(${port}, r));
const call = () => fetch("http://127.0.0.1:${port}${urlPath}", {
  method: ${JSON.stringify(method)},
  headers: { "content-type": "application/json" },
  body: ${body ? `JSON.stringify(${JSON.stringify(body)})` : 'undefined'},
});
let status = 0, text = "", alive = false;
try { const r = await call(); status = r.status; text = await r.text(); } catch (e) { text = "FETCH_FAILED:" + e.message; }
try { const r2 = await call(); alive = r2.status > 0; } catch { alive = false; }
console.log("RESULT " + JSON.stringify({ status, body: text, alive, crash }));
process.exit(0);
`;
  const workerPath = path.join(cwd, '__worker.mjs');
  writeFileSync(workerPath, worker, 'utf8');
  const run = spawnSync(process.execPath, [workerPath], { cwd, encoding: 'utf8', timeout: 30_000 });
  const line = (run.stdout || '').split('\n').find((l) => l.startsWith('RESULT '));
  assert.ok(line, `worker produced no RESULT (stdout=${run.stdout} stderr=${run.stderr})`);
  return JSON.parse(line.slice('RESULT '.length));
}

test('D4: scaffolded health handler answers on plain node:http (no Express)', () => {
  const dir = scaffold();
  try {
    const health = readFileSync(path.join(dir, 'src/copilot-health.js'), 'utf8');
    assert.match(health, /ensureExpressLike/, 'health scaffold must shim res.status/res.json');
    const out = runWorker(dir, 'src/copilot-health.js', 'copilotHealthHandler', {
      port: 14701, method: 'GET', urlPath: '/api/copilot/health',
    });
    // Before the fix: connection reset / "TypeError: res.status is not a function".
    assert.notEqual(out.status, 599, `handler threw on plain node:http: ${out.body}`);
    assert.equal(out.status, 503, 'no .env loaded -> 503 unavailable is correct');
    const json = JSON.parse(out.body);
    assert.equal(json.status, 'unavailable');
    assert.equal(typeof json.checks, 'object');
    assert.equal(out.alive, true, 'host must stay alive');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('D5: unreachable gateway returns a 502 envelope instead of crashing the host', () => {
  const dir = scaffold();
  try {
    const route = readFileSync(path.join(dir, 'src/copilot-route.js'), 'utf8');
    assert.match(route, /try\s*{/, 'chat scaffold must wrap gatewayChat in try/catch');
    assert.match(route, /UPSTREAM_UNAVAILABLE/, 'chat scaffold must return an error envelope');
    const out = runWorker(dir, 'src/copilot-route.js', 'copilotHandler', {
      port: 14702, gatewayUrl: 'http://127.0.0.1:1/nope',
      method: 'POST', urlPath: '/api/copilot/chat', body: { message: 'hi' },
    });
    assert.equal(out.status, 502, `expected 502 envelope, got ${out.status} (body=${out.body})`);
    const json = JSON.parse(out.body);
    assert.equal(json.status, 'error');
    assert.equal(json.code, 'UPSTREAM_UNAVAILABLE');
    // The host must still be listening — before the fix the process had died.
    assert.equal(out.alive, true, 'host must survive the request and answer again');
    assert.equal(out.crash, null, 'no uncaughtException may escape the handler');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('D2: installer next-steps explain how to load .env (not just "restart")', () => {
  const bin = readFileSync(path.join(root, 'bin/grouter-copilot.js'), 'utf8');
  assert.match(bin, /--env-file=\.env/, 'installer must tell the customer how to load .env');
});

test('D4 (docs): installer no longer implies Express is required for vanilla Node', () => {
  const bin = readFileSync(path.join(root, 'bin/grouter-copilot.js'), 'utf8');
  assert.match(bin, /no Express required/, 'next-steps must state handlers run on plain node:http');
});

test('D3: a CommonJS host gets .cjs scaffolds that boot (no ESM in a CJS package)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-d3-cjs-'));
  try {
    // No "type" field -> Node treats the project as CommonJS.
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'd3-cjs', version: '1.0.0' }), 'utf8');
    const nm = path.join(dir, 'node_modules', '@grouter');
    mkdirSync(nm, { recursive: true });
    symlinkSync(root, path.join(nm, 'copilot'), 'dir');
    const init = spawnSync(process.execPath, [path.join(root, 'bin/grouter-copilot.js'), 'init'], {
      cwd: dir, encoding: 'utf8', timeout: 15_000,
    });
    assert.equal(init.status, 0, init.stderr || init.stdout);

    // Must scaffold CJS files, NOT ESM.
    assert.ok(existsSync(path.join(dir, 'copilot.config.cjs')), 'expected copilot.config.cjs');
    assert.ok(!existsSync(path.join(dir, 'copilot.config.js')), 'must not write ESM copilot.config.js');
    assert.ok(existsSync(path.join(dir, 'src/copilot-health.cjs')), 'expected src/copilot-health.cjs');
    const health = readFileSync(path.join(dir, 'src/copilot-health.cjs'), 'utf8');
    assert.match(health, /module\.exports/, 'CJS health must export via module.exports');
    assert.doesNotMatch(health, /^import /m, 'CJS health must not use ESM import');

    // The CJS health handler must actually load and answer on plain node:http.
    const out = runWorkerCjs(dir, 'src/copilot-health.cjs', 'copilotHealthHandler', {
      port: 14703, method: 'GET', urlPath: '/api/copilot/health',
    });
    assert.notEqual(out.status, 599, `CJS handler threw: ${out.body}`);
    assert.equal(out.status, 503, `expected 503, got ${out.status} (body=${out.body})`);
    assert.equal(JSON.parse(out.body).status, 'unavailable');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('D3: an ESM host still gets .js ESM scaffolds (unchanged)', () => {
  const dir = scaffold(); // scaffold() writes type:module
  try {
    assert.ok(existsSync(path.join(dir, 'copilot.config.js')), 'ESM host keeps copilot.config.js');
    assert.ok(!existsSync(path.join(dir, 'copilot.config.cjs')), 'ESM host must not get .cjs');
    const cfg = readFileSync(path.join(dir, 'copilot.config.js'), 'utf8');
    assert.match(cfg, /^import /m, 'ESM host config uses import');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
