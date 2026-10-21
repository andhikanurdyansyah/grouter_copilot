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

test('publish: installs npm 12 into an isolated prefix, never over the toolcache npm', () => {
  // `npm install -g npm@12` menimpa tree npm bawaan toolcache SAAT npm lama
  // masih berjalan. Di runner hosted ini gagal dengan
  // "MODULE_NOT_FOUND: Cannot find module 'promise-retry'" sebelum gate apa pun
  // berjalan - dry-run 2026-10-21 membuktikannya. Pasang ke prefix sendiri.
  const executable = src
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');
  assert.doesNotMatch(
    executable,
    /^\s*npm install -g npm@12\s*$/m,
    'global install over the toolcache npm breaks the runner',
  );
  assert.match(executable, /--prefix/, 'npm 12 must land in a separate prefix');
  assert.match(executable, /GITHUB_PATH/, 'the isolated prefix must be put on PATH');
  assert.match(executable, /npm --version/, 'the installed npm version must be verified');
});

test('publish: installs server deps before the root suite', () => {
  // Root suite BUKAN zero-dependency: test isolasi E2E menyusun schema
  // better-auth di child process dengan cwd server/, jadi `server/node_modules`
  // harus ada. Tanpa langkah ini 4 test gagal dengan
  // "Cannot find package 'better-auth'" - terbukti pada dry-run 2026-10-21.
  const depsIdx = src.indexOf('npm ci --no-audit --no-fund');
  const testIdx = src.indexOf('npm test');
  assert.ok(depsIdx > -1, 'server deps must be installed');
  assert.ok(testIdx > -1, 'root suite must run');
  assert.ok(depsIdx < testIdx, 'server deps must be installed BEFORE the root suite');
});

test('publish: gates the publish behind the test suite', () => {
  const testIdx = src.indexOf('npm test');
  const pubIdx = src.indexOf('npm stage publish');
  assert.ok(testIdx > -1, 'root suite must run');
  assert.ok(pubIdx > -1, 'publish step must exist');
  assert.ok(testIdx < pubIdx, 'tests must run BEFORE publish, not after');
});

test('publish: direct-publishes with provenance, matching the granted permission', () => {
  // Konfigurasi trusted publisher setelah 3 Sep 2026 hanya mengizinkan
  // `npm stage publish` KECUALI "Allow npm publish" dicentang eksplisit.
  // Jie mengonfirmasi centang itu aktif (2026-10-21), jadi workflow boleh
  // memakai publish langsung - dan memang harus, karena staged publish akan
  // menggantung menunggu approval manual yang tidak lagi diperlukan.
  //
  // Kalau izinnya dicabut, satu-satunya perbaikan yang benar adalah kembali ke
  // `npm stage publish` + approval 2FA. Menambahkan token panjang umur bukan
  // jalan keluar: itu justru akar masalah yang trusted publishing hilangkan.
  const executable = src
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');
  assert.match(executable, /npm publish --access public --provenance/, 'must publish directly with provenance');
  assert.doesNotMatch(executable, /npm stage publish/, 'staged publish would stall on a manual approval');
});

test('publish: the registry read-back retries before failing', () => {
  // Registry consistency is not synchronous: npm answers "Your package is
  // being processed and may take a few minutes", and `npm view` for the new
  // version still 404s. Release 0.1.1 failed exactly here AFTER a successful
  // publish, turning a green release red. The verification must poll with a
  // bound - not fire once, and not loop forever.
  const verifyIdx = src.indexOf('Verify published version');
  assert.ok(verifyIdx > -1, 'a registry read-back step must exist');
  const tail = src.slice(verifyIdx);
  assert.match(tail, /seq 1 \d+/, 'the read-back must be a bounded retry loop');
  assert.match(tail, /sleep \d+/, 'retries need a delay between attempts');
  assert.match(tail, /exit 1/, 'an absent version must still fail the job');
});

test('publish: names the registry permission the direct publish depends on', () => {
  // Centang "Allow npm publish" hanya ada di npmjs.com dan tidak bisa diuji
  // dari repo. Kalau baris ini hilang, orang berikutnya akan mengira 403 saat
  // rilis adalah bug kode, bukan izin yang dicabut.
  assert.match(src, /Allow npm publish/, 'the workflow must name its registry-side prerequisite');
});

test('publish: pins a node version npm 12 actually supports', () => {
  // npm 12.2.0 requires node ^22.22.2 || ^24.15.0 || >=26. A floating '22.x'
  // can resolve to 22.14, where `npm install -g npm@12` fails.
  assert.doesNotMatch(src, /node-version:\s*'22\.x'/, 'floating 22.x is not guaranteed to satisfy npm 12');
  assert.match(src, /node-version:\s*'22\.22\.2'/, 'pin a version npm 12 supports');
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
