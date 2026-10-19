// Publish readiness: the published package must be installable and sane.
//
// Defect found 2026-10-19 while checking npm publish readiness:
//   - `grouter-copilot --version` printed "Unknown command: --version". That is
//     the first command a new user runs to confirm an install worked, so a
//     broken --version makes a good package look broken.
//   - package.json had no `repository` field, so npmjs.com shows no source link
//     and `npm view` gives no provenance for a package that mints licenses.
//
// These assertions are about the tarball contract, not internals.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const binPath = path.join(root, 'bin', 'grouter-copilot.js');

function runBin(args) {
  return execFileSync(process.execPath, [binPath, ...args], { encoding: 'utf8', cwd: root });
}

test('publish: --version prints the package version', () => {
  for (const flag of ['--version', '-v', 'version']) {
    const out = runBin([flag]).trim();
    assert.equal(out, pkg.version, `${flag} must print ${pkg.version}, got ${JSON.stringify(out)}`);
  }
});

test('publish: --help still lists the real commands', () => {
  const out = runBin(['--help']);
  assert.match(out, /grouter-copilot init/);
  assert.match(out, /grouter-copilot install/);
});

test('publish: package metadata is complete enough for npmjs.com', () => {
  assert.ok(pkg.name && pkg.name.includes('/'), 'scoped package name');
  assert.match(pkg.version, /^\d+\.\d+\.\d+/, 'semver version');
  assert.ok(pkg.description && pkg.description.length > 20, 'description present');
  assert.ok(pkg.license, 'license declared');
  assert.ok(pkg.repository?.url, 'repository url declared — npmjs.com needs a source link');
  assert.ok(pkg.homepage, 'homepage declared');
  assert.ok(pkg.bin?.['grouter-copilot'], 'bin entry present');
  assert.deepEqual(pkg.dependencies ?? {}, {}, 'zero runtime dependencies is a feature; keep it');
});

test('publish: the files allowlist ships the bin and src', () => {
  assert.ok(Array.isArray(pkg.files), 'files allowlist declared');
  for (const entry of ['bin', 'src']) {
    assert.ok(pkg.files.includes(entry), `files must include ${entry}`);
  }
});
