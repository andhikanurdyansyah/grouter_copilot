import test from 'node:test';
import assert from 'node:assert/strict';

import { tmpdir } from 'node:os';
import { readdir } from 'node:fs/promises';

import { jobs, redact, validatePolicy, safeEnvironment, createIsolatedEnvironment, run } from '../scripts/dependency-audit.mjs';

test('dependency audit contract uses tracked lockfiles and never installs', async () => {
  assert.deepEqual(await validatePolicy(), []);
  assert.deepEqual(jobs.map(({ cwd, lockfile }) => `${cwd}/${lockfile}`), ['server/package-lock.json', 'frontend/pnpm-lock.yaml']);
  for (const job of jobs) {
    assert.ok(job.args.some((arg) => arg === '--audit-level=high' || arg === '--audit-level'));
    if (job.command === 'pnpm') assert.equal(job.args[job.args.indexOf('--audit-level') + 1], 'high');
    assert.ok(!job.args.some((arg) => /install|update|upgrade|ci/.test(arg)));
  }
});

test('subprocess environment excludes config and credential settings', () => {
  const env = safeEnvironment({ PATH: '/bin', HOME: '/home/test', npm_config_registry: 'https://registry.example', NPM_CONFIG_USERCONFIG: '/secret/.npmrc', CI_TOKEN: 'runtime-secret', HTTPS_PROXY: 'http://user:pass@example' });
  assert.deepEqual(env, { PATH: '/bin', HOME: '/home/test' });
});

test('audit creates an empty platform-neutral npm config and cleans it up', async () => {
  const isolated = await createIsolatedEnvironment({ PATH: '/bin', HOME: '/home/test' });
  assert.equal(isolated.env.npm_config_userconfig, isolated.configPath);
  assert.match(isolated.configPath, /dependency-audit-[^/\\]+[\\/]empty\.npmrc$/);
  const { access } = await import('node:fs/promises');
  await access(isolated.configPath);
  await isolated.cleanup();
  await assert.rejects(access(isolated.configPath));
});

test('audit returns a failure and cleans isolation when the child cannot start', async () => {
  const before = new Set((await readdir(tmpdir())).filter((name) => name.startsWith('dependency-audit-')));
  const result = await Promise.race([
    run({ name: 'regression', cwd: 'server', command: '__dependency_audit_missing_command__', args: [] }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('audit subprocess hung')), 2000)),
  ]);
  assert.equal(result.code, 127);
  assert.match(result.output, /__dependency_audit_missing_command__/);
  const after = new Set((await readdir(tmpdir())).filter((name) => name.startsWith('dependency-audit-')));
  assert.deepEqual(after, before);
});
test('dependency audit output redacts bearer, basic, auth forms, and credential URLs', () => {
  const token = ['tok', 'runtime', 'value'].join('-');
  const basic = Buffer.from(['user', token].join(':')).toString('base64');
  const output = [
    `Authorization: Bearer ${token}`,
    `Authorization: Basic ${basic}`,
    `//registry.example/:_authToken=${token}`,
    `//registry.example/:_auth=${basic}`,
    `https://user:${token}@example.test/pkg`,
  ].join(' ');
  const redacted = redact(output);
  assert.doesNotMatch(redacted, new RegExp(token));
  assert.doesNotMatch(redacted, new RegExp(basic));
  assert.ok(redacted.includes('Bearer [REDACTED]'));
  assert.ok(redacted.includes('Basic [REDACTED]'));
  assert.ok(redacted.includes('_authToken=[REDACTED]'));
  assert.ok(redacted.includes('_auth=[REDACTED]'));
  assert.ok(redacted.includes('https://user:[REDACTED]@example.test'));
});
