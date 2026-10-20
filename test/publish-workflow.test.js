// Kontrak workflow publish (trusted publishing / OIDC).
//
// Kenapa diuji: publish langsung dengan token sudah dipensiunkan (changelog
// GitHub 2026-07-08) dan dihapus penuh sekitar Januari 2027. Satu-satunya jalur
// otomatis yang bertahan adalah OIDC. Kalau seseorang menghapus `id-token:
// write` atau menambahkan token, workflow tetap "terlihat benar" di YAML tetapi
// gagal di menit terakhir sebuah rilis - persis saat paling mahal.
//
// Ini test source-string, bukan bukti workflow benar-benar jalan. Batas itu
// dinyatakan eksplisit, sama seperti test kontrak lain di repo ini.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(root, '.github', 'workflows', 'publish.yml');
const src = readFileSync(workflowPath, 'utf8');

test('publish: OIDC identity permission is granted', () => {
  assert.match(src, /id-token:\s*write/, 'trusted publishing needs id-token: write');
});

test('publish: repo permission stays read-only', () => {
  assert.match(src, /contents:\s*read/, 'publish workflow must not write repo contents');
});

test('publish: no long-lived token anywhere executable', () => {
  // Komentar yang menyebut NPM_TOKEN boleh; penggunaan nyata tidak.
  const executable = src
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');
  assert.doesNotMatch(executable, /NPM_TOKEN/, 'a long-lived token defeats trusted publishing');
  assert.doesNotMatch(executable, /secrets\./, 'no repository secret should be needed');
  assert.doesNotMatch(executable, /_authToken/, 'no registry token should be written');
});

test('publish: uses the npm version that supports trusted publishing', () => {
  assert.match(src, /npm@12/, 'npm 12 carries the stable trusted-publishing flow');
});

test('publish: gates the publish behind the test suite', () => {
  const testIdx = src.indexOf('npm test');
  const pubIdx = src.indexOf('npm publish');
  assert.ok(testIdx > -1, 'root suite must run');
  assert.ok(pubIdx > -1, 'publish step must exist');
  assert.ok(testIdx < pubIdx, 'tests must run BEFORE publish, not after');
});

test('publish: publishes with provenance and public access', () => {
  assert.match(src, /npm publish --access public --provenance/);
});

test('publish: does not publish on a dry run', () => {
  assert.match(src, /inputs\.dry_run == false/, 'publish must be conditional on dry_run being false');
});

test('publish: declares the environment npm verifies against', () => {
  assert.match(src, /environment:\s*npm-publish/, 'environment name must match the trusted publisher entry');
});

test('publish: documents the exact trusted-publisher fields', () => {
  // Salah satu penyebab gagal paling umum: field di npmjs.com tidak persis sama.
  for (const field of ['andhikanurdyansyah', 'grouter_copilot', 'publish.yml', 'npm-publish']) {
    assert.ok(src.includes(field), `workflow should document trusted-publisher field ${field}`);
  }
});
