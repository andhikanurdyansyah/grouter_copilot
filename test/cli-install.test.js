import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('install accepts only a Copilot license and resolves provider credentials server-side', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-cli-'));
  const licenseServer = 'http://license.test';
  try {
    const fetchMock = `globalThis.fetch = async (url, options) => {\n  const { strictEqual } = await import('node:assert');\n  strictEqual(String(url), '${licenseServer}/api/resolve');\n  strictEqual(JSON.stringify(JSON.parse(options.body)), JSON.stringify({ token: 'copilot-license-test' }));\n  return new Response(JSON.stringify({ apiKey: 'gRouter-server-resolved', baseUrl: 'https://supplier.invalid/v1', licensePublicKey: 'public-key-pem' }), { status: 200, headers: { 'content-type': 'application/json' } });\n};\n`;
    const preloadPath = path.join(dir, 'fetch-mock.mjs');
    const preload = pathToFileURL(preloadPath).href;
    writeFileSync(preloadPath, fetchMock);
    const run = spawnSync(process.execPath, ['--import', preload, path.join(root, 'bin/grouter-copilot.js'), 'install', '--license', 'copilot-license-test', '--license-server', licenseServer], {
      cwd: dir, encoding: 'utf8', timeout: 10_000,
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const env = readFileSync(path.join(dir, '.env'), 'utf8');
    assert.match(env, /GROUTER_LICENSE=copilot-license-test/);
    assert.match(env, /GROUTER_API_KEY=gRouter-server-resolved/);
    assert.match(env, /GROUTER_BASE_URL=https:\/\/supplier\.invalid\/v1/);
    assert.match(env, /GROUTER_LICENSE_PUBLIC_KEY=public-key-pem/);
    assert.doesNotMatch(run.stdout + run.stderr, /gRouter-server-resolved/);
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

test('reinstall over an env that only has the public key still writes the license', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-cli-reinstall-'));
  const licenseServer = 'http://license.test';
  try {
    writeFileSync(path.join(dir, '.env'), 'GROUTER_LICENSE_PUBLIC_KEY=old-pem\n', 'utf8');
    const fetchMock = `globalThis.fetch = async () => new Response(JSON.stringify({ apiKey: 'gRouter-renewed', baseUrl: 'https://renewed.invalid/v1', licensePublicKey: 'new-pem' }), { status: 200, headers: { 'content-type': 'application/json' } });\n`;
    const preloadPath = path.join(dir, 'fetch-mock.mjs');
    const preload = pathToFileURL(preloadPath).href;
    writeFileSync(preloadPath, fetchMock);
    const run = spawnSync(process.execPath, ['--import', preload, path.join(root, 'bin/grouter-copilot.js'), 'install', '--license', 'lic-NEW', '--license-server', licenseServer], {
      cwd: dir, encoding: 'utf8', timeout: 10_000,
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const env = readFileSync(path.join(dir, '.env'), 'utf8');
    assert.match(env, /GROUTER_LICENSE=lic-NEW/, 'license must be written even when only the public key pre-exists');
    assert.match(env, new RegExp(`GROUTER_${'API_KEY'}=gRouter-renewed`));
    assert.equal((env.match(/GROUTER_LICENSE_PUBLIC_KEY=/g) || []).length, 1, 'pre-existing public key must not be duplicated');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
