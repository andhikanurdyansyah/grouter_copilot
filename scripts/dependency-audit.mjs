#!/usr/bin/env node
/**
 * Audit tracked dependency lockfiles without installing or updating anything.
 *
 * Normal mode performs network-backed audits with the package managers already
 * selected by each workspace. --check is deterministic and network-free; CI
 * contract tests use it to verify the audit policy when the runner is offline.
 */
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HIGH_THRESHOLD = 'high';
const jobs = [
  { name: 'server (npm)', cwd: 'server', lockfile: 'package-lock.json', command: 'npm', args: ['audit', '--omit=dev', '--audit-level=high'] },
  { name: 'frontend (pnpm)', cwd: 'frontend', lockfile: 'pnpm-lock.yaml', command: 'pnpm', args: ['audit', '--prod', '--audit-level', HIGH_THRESHOLD] },
];

// Keep only ordinary process settings needed to locate/run package managers.
// In particular, do not forward arbitrary NPM_CONFIG_* or credential variables.
const secretName = /(secret|token|password|passwd|credential|api[_-]?key|auth|proxy)/i;
const safeEnvironment = (source = process.env) => Object.fromEntries(
  Object.entries(source).filter(([key]) => key === 'PATH' || key === 'SystemRoot' || key === 'WINDIR' || key === 'HOME' || key === 'USERPROFILE' || (!secretName.test(key) && !/^npm_config_/i.test(key))),
);

function redact(text) {
  return text
    .replace(/(authorization\s*:\s*(?:bearer|basic|token)\s+)[^\s,]+/gi, '$1[REDACTED]')
    .replace(/(\b(?:_authToken|_auth|authToken|password)\s*[=:]\s*)[^\s,]+/gi, '$1[REDACTED]')
    .replace(/(https?:\/\/[^\s/@]+):[^\s/@]+@/gi, '$1:[REDACTED]@')
    .replace(/(https?:\/\/[^\s/@]+\/\/[^\s]*?)(?::[^\s/@]+)?@/gi, '$1[REDACTED]@');
}

async function exists(path) {
  try { await access(path, constants.F_OK); return true; } catch { return false; }
}

async function validatePolicy() {
  const errors = [];
  for (const job of jobs) {
    const lockfile = join(root, job.cwd, job.lockfile);
    if (!(await exists(lockfile))) errors.push(`${job.name}: missing ${job.cwd}/${job.lockfile}`);
    if (job.command === 'npm' && !job.args.includes('--omit=dev')) errors.push(`${job.name}: must omit dev dependencies`);
    if (job.command === 'pnpm' && !job.args.includes('--prod')) errors.push(`${job.name}: must audit production dependencies only`);
    if (!job.args.some((arg) => arg.includes('audit-level') || arg === '--audit-level')) errors.push(`${job.name}: must enforce an audit severity threshold`);
    if (job.args.some((arg) => /install|update|upgrade|ci/.test(arg))) errors.push(`${job.name}: audit command must not install or update dependencies`);
  }
  return errors;
}

async function createIsolatedEnvironment(source = process.env) {
  const directory = await mkdtemp(join(tmpdir(), 'dependency-audit-'));
  try {
    const configPath = join(directory, 'empty.npmrc');
    await writeFile(configPath, '', { mode: 0o600 });
    const env = { ...safeEnvironment(source), npm_config_userconfig: configPath };
    return { env, configPath, cleanup: () => rm(directory, { recursive: true, force: true }) };
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function run(job) {
  let isolated;
  try {
    isolated = await createIsolatedEnvironment();
  } catch (error) {
    return { code: 127, output: error instanceof Error ? error.message : String(error) };
  }

  let child;
  try {
    child = spawn(job.command, job.args, {
      cwd: join(root, job.cwd), env: isolated.env, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    await isolated.cleanup().catch(() => {});
    return { code: 127, output: error instanceof Error ? error.message : String(error) };
  }

  return new Promise((resolveRun) => {
    let output = '';
    let settled = false;
    const finish = async (result) => {
      if (settled) return;
      settled = true;
      await isolated.cleanup().catch(() => {});
      resolveRun(result);
    };
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', (error) => finish({ code: 127, output: error instanceof Error ? error.message : String(error) }));
    child.on('close', (code, signal) => finish({ code: code ?? 1, signal, output }));
  });
}

async function main() {
  const policyErrors = await validatePolicy();
  if (policyErrors.length) { for (const error of policyErrors) console.error(`dependency-audit: ${error}`); return 2; }
  if (process.argv.includes('--check')) {
    console.log(`dependency-audit policy OK (${jobs.length} lockfiles; threshold=${HIGH_THRESHOLD}; no installs)`);
    return 0;
  }
  let failed = false;
  for (const job of jobs) {
    console.log(`dependency-audit: ${job.name}`);
    const result = await run(job);
    if (result.output) process.stdout.write(redact(result.output));
    if (result.code !== 0) { failed = true; console.error(`dependency-audit: ${job.name} failed (exit=${result.code}${result.signal ? `, signal=${result.signal}` : ''})`); }
  }
  return failed ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = await main();
export { jobs, redact, validatePolicy, safeEnvironment, createIsolatedEnvironment, run };
