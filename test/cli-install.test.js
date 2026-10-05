import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('install accepts only a Copilot license and resolves provider credentials server-side', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-cli-'));
  const licenseServer = 'http://license.test';
  try {
    const fetchMock = `globalThis.fetch = async (url, options) => {\n  const { strictEqual } = await import('node:assert');\n  strictEqual(String(url), '${licenseServer}/api/resolve');\n  strictEqual(JSON.stringify(JSON.parse(options.body)), JSON.stringify({ token: 'copilot-license-test' }));\n  return new Response(JSON.stringify({ apiKey: 'gRouter-server-resolved', baseUrl: 'https://supplier.invalid/v1' }), { status: 200, headers: { 'content-type': 'application/json' } });\n};\n`;
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
    assert.doesNotMatch(run.stdout + run.stderr, /gRouter-server-resolved/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
