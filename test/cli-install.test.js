import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('install exchanges the license for NON-SECRET gateway config (D-021: no credential handoff)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-cli-'));
  const licenseServer = 'http://license.test';
  try {
    const fetchMock = `globalThis.fetch = async (url, options) => {\n  const { strictEqual } = await import('node:assert');\n  strictEqual(String(url), '${licenseServer}/api/resolve');\n  strictEqual(JSON.stringify(JSON.parse(options.body)), JSON.stringify({ token: 'copilot-license-test' }));\n  return new Response(JSON.stringify({ baseUrl: 'https://prod.grouter.web.id', gatewayUrl: '${licenseServer}/api/copilot/chat', licensePublicKey: 'public-key-pem' }), { status: 200, headers: { 'content-type': 'application/json' } });\n};\n`;
    const preloadPath = path.join(dir, 'fetch-mock.mjs');
    const preload = pathToFileURL(preloadPath).href;
    writeFileSync(preloadPath, fetchMock);
    const run = spawnSync(process.execPath, ['--import', preload, path.join(root, 'bin/grouter-copilot.js'), 'install', '--license', 'copilot-license-test', '--license-server', licenseServer], {
      cwd: dir, encoding: 'utf8', timeout: 10_000,
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const env = readFileSync(path.join(dir, '.env'), 'utf8');
    assert.match(env, /GROUTER_LICENSE=copilot-license-test/);
    assert.match(env, /GROUTER_GATEWAY_URL=http:\/\/license\.test\/api\/copilot\/chat/);
    assert.match(env, /GROUTER_LICENSE_PUBLIC_KEY=public-key-pem/);
    // D-021: the customer .env must never contain provider credentials.
    assert.doesNotMatch(env, /GROUTER_API_KEY=/, 'no provider key in customer .env');
    assert.doesNotMatch(env, /GROUTER_BASE_URL=/, 'no provider base URL in customer .env');
    assert.doesNotMatch(run.stdout + run.stderr, /gRouter-/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('install refuses a legacy server that still hands off an api key (defense in depth)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-cli-legacy-'));
  const licenseServer = 'http://license.test';
  try {
    const fetchMock = `globalThis.fetch = async () => new Response(JSON.stringify({ apiKey: 'legacy-handoff-attempt', baseUrl: 'https://prod.grouter.web.id', licensePublicKey: 'public-key-pem' }), { status: 200, headers: { 'content-type': 'application/json' } });\n`;
    const preloadPath = path.join(dir, 'fetch-mock.mjs');
    const preload = pathToFileURL(preloadPath).href;
    writeFileSync(preloadPath, fetchMock);
    const run = spawnSync(process.execPath, ['--import', preload, path.join(root, 'bin/grouter-copilot.js'), 'install', '--license', 'copilot-license-test', '--license-server', licenseServer], {
      cwd: dir, encoding: 'utf8', timeout: 10_000,
    });
    assert.equal(run.status, 1, 'must fail closed on credential handoff');
    assert.match(run.stderr, /hand off a provider credential/);
    assert.equal(existsSync(path.join(dir, '.env')), false, 'no .env when the server tries a handoff');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('install fails closed: no scaffold and non-zero exit when resolve is rejected', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-cli-fail-'));
  const licenseServer = 'http://license.test';
  try {
    const fetchMock = `globalThis.fetch = async () => new Response(JSON.stringify({ error: 'not activated' }), { status: 404, headers: { 'content-type': 'application/json' } });\n`;
    const preloadPath = path.join(dir, 'fetch-mock.mjs');
    const preload = pathToFileURL(preloadPath).href;
    writeFileSync(preloadPath, fetchMock);
    const run = spawnSync(process.execPath, ['--import', preload, path.join(root, 'bin/grouter-copilot.js'), 'install', '--license', 'copilot-license-test', '--license-server', licenseServer], {
      cwd: dir, encoding: 'utf8', timeout: 10_000,
    });
    assert.equal(run.status, 1, `expected exit 1, got ${run.status}`);
    assert.match(run.stderr, /not activated|License verification failed/);
    assert.equal(existsSync(path.join(dir, '.env')), false, 'no .env on failure');
    assert.equal(existsSync(path.join(dir, 'copilot.config.js')), false, 'no config scaffold on failure');
    assert.equal(existsSync(path.join(dir, 'skills')), false, 'no skills scaffold on failure');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reinstall over an env that only has the public key still writes the license + gateway url', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-cli-reinstall-'));
  const licenseServer = 'http://license.test';
  try {
    writeFileSync(path.join(dir, '.env'), 'GROUTER_LICENSE_PUBLIC_KEY=old-pem\n', 'utf8');
    const fetchMock = `globalThis.fetch = async () => new Response(JSON.stringify({ baseUrl: 'https://prod.grouter.web.id', gatewayUrl: '${licenseServer}/api/copilot/chat', licensePublicKey: 'new-pem' }), { status: 200, headers: { 'content-type': 'application/json' } });\n`;
    const preloadPath = path.join(dir, 'fetch-mock.mjs');
    const preload = pathToFileURL(preloadPath).href;
    writeFileSync(preloadPath, fetchMock);
    const run = spawnSync(process.execPath, ['--import', preload, path.join(root, 'bin/grouter-copilot.js'), 'install', '--license', 'lic-NEW', '--license-server', licenseServer], {
      cwd: dir, encoding: 'utf8', timeout: 10_000,
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const env = readFileSync(path.join(dir, '.env'), 'utf8');
    assert.match(env, /GROUTER_LICENSE=lic-NEW/, 'license must be written even when only the public key pre-exists');
    assert.match(env, /GROUTER_GATEWAY_URL=http:\/\/license\.test\/api\/copilot\/chat/);
    assert.equal((env.match(/GROUTER_LICENSE_PUBLIC_KEY=/g) || []).length, 1, 'pre-existing public key must not be duplicated');
    assert.doesNotMatch(env, /GROUTER_API_KEY=/, 'no provider key in customer .env');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});


test('init generates a Pages Router handler in the detected router without overwriting project files', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-cli-pages-'));
  try {
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { next: '14.0.0' } }));
    mkdirSync(path.join(dir, 'src/pages/api/copilot'), { recursive: true });
    writeFileSync(path.join(dir, 'src/pages/index.js'), 'keep');
    const run = spawnSync(process.execPath, [path.join(root, 'bin/grouter-copilot.js'), 'init'], { cwd: dir, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.match(run.stdout, /Pages Router layout/);
    assert.equal(readFileSync(path.join(dir, 'src/pages/index.js'), 'utf8'), 'keep');
    assert.equal(existsSync(path.join(dir, 'app/api/copilot/chat/route.js')), false);
    assert.match(readFileSync(path.join(dir, 'src/pages/api/copilot/chat.js'), 'utf8'), /Next\.js Pages Router/);
    assert.match(readFileSync(path.join(dir, 'components/CopilotWidget.jsx'), 'utf8'), /CopilotChat firstUseSetup/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('scaffolded chat routes call the backend gateway, never a local provider adapter (D-021)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-cli-scaffold-'));
  try {
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { next: '14.0.0' } }));
    mkdirSync(path.join(dir, 'app'));
    const run = spawnSync(process.execPath, [path.join(root, 'bin/grouter-copilot.js'), 'init'], { cwd: dir, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const route = readFileSync(path.join(dir, 'app/api/copilot/chat/route.js'), 'utf8');
    assert.match(route, /gatewayChat/);
    assert.match(route, /GATEWAY_URL/);
    assert.doesNotMatch(route, /GrouterAdapter/);
    const config = readFileSync(path.join(dir, 'copilot.config.js'), 'utf8');
    assert.doesNotMatch(config, /apiKey/, 'config template must not reference provider credentials');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

for (const { name, dependencies, setup, target } of [
  { name: 'Next App Router', dependencies: { next: '14.0.0' }, setup: 'app', target: 'app/api/copilot/health/route.js' },
  { name: 'Next Pages Router', dependencies: { next: '14.0.0' }, setup: 'pages', target: 'pages/api/copilot/health.js' },
  { name: 'Express', dependencies: { express: '4.0.0' }, target: 'routes/copilot-health.js' },
]) {
  test(`init creates host-local health route for ${name} without replacing existing files`, () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'copilot-cli-health-'));
    try {
      writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies }));
      if (setup) mkdirSync(path.join(dir, setup));
      const run = () => spawnSync(process.execPath, [path.join(root, 'bin/grouter-copilot.js'), 'init'], { cwd: dir, encoding: 'utf8' });
      assert.equal(run().status, 0);
      const source = readFileSync(path.join(dir, target), 'utf8');
      assert.match(source, /getCopilotHealth/);
      assert.match(source, /GROUTER_LICENSE/);
      assert.match(source, /503/);
      assert.doesNotMatch(source, /\/api\/health/);
      writeFileSync(path.join(dir, target), 'user route');
      assert.equal(run().status, 0);
      assert.equal(readFileSync(path.join(dir, target), 'utf8'), 'user route');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}
