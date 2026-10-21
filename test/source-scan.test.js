import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { scanRoot } from '../scripts/source-scan.mjs';

test('source scan reports only high-confidence production violations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'source-scan-test-'));
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'src', 'sample.js'), [
    "const token = 'this-is-a-real-looking-secret';",
    "const endpoint = process.env.API_URL || 'https://api.example.test';",
    "// mock response is allowed in explanatory comments",
    "const local = 'http://localhost:4600';",
  ].join('\n'));

  assert.deepEqual(scanRoot(root), [
    { file: 'src/sample.js', line: 1, rule: 'hardcoded-secret' },
  ]);
});

test('source scan ignores tests, examples, docs, and generated roots by default', async () => {
  const root = await mkdtemp(join(tmpdir(), 'source-scan-scope-'));
  await mkdir(join(root, 'test'), { recursive: true });
  await mkdir(join(root, 'examples'), { recursive: true });
  await writeFile(join(root, 'test', 'sample.js'), "const token = 'this-is-a-test-secret';");
  await writeFile(join(root, 'examples', 'sample.js'), "const token = 'this-is-an-example-secret';");
  assert.deepEqual(scanRoot(root), []);
});

test('source scan ignores comments and legitimate fake adapter identifiers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'source-scan-comments-'));
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'src', 'sample.js'), [
    "const endpoint = 'https://api.example.test'; // fakeResponse is documented here",
    'class FakeSupplier { get() { return null; } }',
    '/* fixture response is explanatory prose */',
  ].join('\\n'));
  assert.deepEqual(scanRoot(root), []);
});

test('source scan detects code after inline and multiline block comments', async () => {
  const root = await mkdtemp(join(tmpdir(), 'source-scan-block-comments-'));
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'src', 'sample.js'), [
    "/* comment */ const token = 'inline-block-comment-secret';",
    '/* multiline comment starts',
    ' * and ends here */ const fakeResponse = { ok: true };',
  ].join('\n'));
  assert.deepEqual(scanRoot(root), [
    { file: 'src/sample.js', line: 1, rule: 'hardcoded-secret' },
    { file: 'src/sample.js', line: 3, rule: 'mock-data-in-production' },
  ]);
});
test('CLI resolves a repository path containing spaces', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'source scan path-'));
  const root = join(parent, 'repo with spaces');
  await mkdir(join(root, 'src'), { recursive: true });
  const script = fileURLToPath(new URL('../scripts/source-scan.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, '--root', root, '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '[]');
});

test('source scan detects hardcoded secrets inside template interpolations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'source-scan-interpolation-'));
  await mkdir(join(root, 'src'));
  const secret = ['abcdefghijklmnop'].join('');
  await writeFile(join(root, 'src', 'sample.js'), "const message = `value: ${token = '" + secret + "'}`;");
  assert.deepEqual(scanRoot(root), [
    { file: 'src/sample.js', line: 1, rule: 'hardcoded-secret' },
  ]);
});

test('source scan ignores credential-shaped prose inside strings and regex literals', async () => {
  const root = await mkdtemp(join(tmpdir(), 'source-scan-literal-false-positives-'));
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'src', 'sample.js'), [
    'const message = "token = \'abcdefghijklmnop\'";',
    'const matcher = /fakeResponse = { ok: true }/;',
  ].join('\\n'));
  assert.deepEqual(scanRoot(root), []);
});

test('source scan handles nested interpolation and quoted braces', async () => {
  const root = await mkdtemp(join(tmpdir(), 'source-scan-nested-interpolation-'));
  await mkdir(join(root, 'src'));
  const secret = ['abcdefghijklmnop'].join('');
  const source = "const message = `outer ${({ text: \"quoted } brace\", value: `${token = '" + secret + "'}` })}`;";
  await writeFile(join(root, 'src', 'sample.js'), source);
  assert.deepEqual(scanRoot(root), [
    { file: 'src/sample.js', line: 1, rule: 'hardcoded-secret' },
  ]);
});

test('source scan preserves template literal state across lines', async () => {
  const root = await mkdtemp(join(tmpdir(), 'source-scan-literals-'));
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'src', 'sample.js'), 'const message = `template starts here\n  fakeResponse = { hidden: true };`,\nconst fakeResponse = { visible: true };');
  assert.deepEqual(scanRoot(root), [
    { file: 'src/sample.js', line: 3, rule: 'mock-data-in-production' },
  ]);
});
test('source scan is deterministic and supports explicit roots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'source-scan-explicit-'));
  await mkdir(join(root, 'custom'));
  await writeFile(join(root, 'custom', 'sample.js'), "const fakeResponse = { ok: true };\n");
  const expected = [{ file: 'custom/sample.js', line: 1, rule: 'mock-data-in-production' }];
  assert.deepEqual(scanRoot(root, { roots: ['custom'] }), expected);
  assert.deepEqual(scanRoot(root, { roots: ['custom'] }), expected);
});

test('source scan does not inspect regex literals after return or control flow', async () => {
  const root = await mkdtemp(join(tmpdir(), 'source-scan-regex-context-'));
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'src', 'sample.js'), [
    'function response() { return /fakeResponse = { ok: true }/; }',
    'if (ready) /fakeResponse = { ok: true }/.test(value);',
  ].join('\n'));
  assert.deepEqual(scanRoot(root), []);
});

test('source scan detects direct credential-shaped template literals', async () => {
  const root = await mkdtemp(join(tmpdir(), 'source-scan-template-secret-'));
  await mkdir(join(root, 'src'));
  const secret = ['abcdefghijklmnop'].join('');
  await writeFile(join(root, 'src', 'sample.js'), "const token = `" + secret + "`; ");
  assert.deepEqual(scanRoot(root), [
    { file: 'src/sample.js', line: 1, rule: 'hardcoded-secret' },
  ]);
});

test('source scan skips test files that live INSIDE a scanned source root', async () => {
  // Mounted behavior tests sit next to production code (frontend/src/**), so a
  // root-level exclusion never reaches them. They mock the API surface on
  // purpose: flagging them made CI red while production code was clean.
  const root = await mkdtemp(join(tmpdir(), 'source-scan-in-root-tests-'));
  await mkdir(join(root, 'frontend', 'src', 'features'), { recursive: true });
  await writeFile(
    join(root, 'frontend', 'src', 'features', 'panel.behavior.test.tsx'),
    ['const mocks = vi.hoisted(() => ({})),', "vi.mock('@/lib/api', () => ({ fetchMe: vi.fn() }))"].join('\n'),
  );
  await writeFile(
    join(root, 'frontend', 'src', 'features', 'panel.spec.ts'),
    'const mockOrder = { id: 1 };',
  );
  // A production module in the SAME directory must still be scanned.
  await writeFile(
    join(root, 'frontend', 'src', 'features', 'panel.tsx'),
    'const mockData = [];',
  );
  assert.deepEqual(scanRoot(root), [
    { file: 'frontend/src/features/panel.tsx', line: 1, rule: 'mock-data-in-production' },
  ]);
});
