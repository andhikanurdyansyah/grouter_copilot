/**
 * Regression — E2E isolation guard (P0).
 *
 * The previous `npm run e2e` ran against LIVE production and polluted it. The
 * guard (e2e/isolated/guard.mjs) is the single fail-closed choke point. This
 * test proves it REFUSES production-shaped configs and ACCEPTS a correct
 * isolated config, so a regression that points E2E back at production fails CI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { collectViolations, assertIsolatedConfig, IsolationViolation } from '../e2e/isolated/guard.mjs';

const PROD_DATA = path.join(process.cwd(), 'server', 'data');

/** A known-good isolated config used as the baseline for each mutation. */
function goodConfig(overrides = {}) {
  const dataDir = path.join('/tmp', 'copilot-e2e-iso-XXXX', 'data');
  return {
    nodeEnv: 'test',
    mockUpstream: true,
    backendPort: 4690,
    frontendPort: 4691,
    dataDir,
    dataFile: path.join(dataDir, 'store.json'),
    authDbFile: path.join(dataDir, 'auth.sqlite'),
    baseUrl: 'http://localhost:4691',
    klikqrisMode: 'sandbox',
    prodDataDir: PROD_DATA,
    ...overrides,
  };
}

test('guard ACCEPTS a correct isolated config', () => {
  assert.equal(assertIsolatedConfig(goodConfig()), true);
  assert.deepEqual(collectViolations(goodConfig()), []);
});

test('guard REFUSES the production base URL (localhost:4601)', () => {
  const problems = collectViolations(goodConfig({ frontendPort: 4601, baseUrl: 'http://localhost:4601' }));
  assert.ok(problems.length > 0, 'production frontend port must be refused');
  assert.ok(problems.some((p) => /4601|production port/.test(p)), problems.join('; '));
});

test('guard REFUSES production backend port 4600', () => {
  const problems = collectViolations(goodConfig({ backendPort: 4600 }));
  assert.ok(problems.some((p) => /4600|production port/.test(p)), problems.join('; '));
});

test('guard REFUSES a data path inside the production data dir', () => {
  const problems = collectViolations(goodConfig({
    dataDir: PROD_DATA,
    dataFile: path.join(PROD_DATA, 'store.json'),
    authDbFile: path.join(PROD_DATA, 'auth.sqlite'),
  }));
  assert.ok(problems.some((p) => /INSIDE the production data dir/.test(p)), problems.join('; '));
});

test('guard REFUSES NODE_ENV that is not test', () => {
  const problems = collectViolations(goodConfig({ nodeEnv: 'production' }));
  assert.ok(problems.some((p) => /NODE_ENV must be 'test'/.test(p)), problems.join('; '));
});

test('guard REFUSES a non-loopback (public/production) base URL', () => {
  const problems = collectViolations(goodConfig({ baseUrl: 'https://copilot.grouter.id' }));
  assert.ok(problems.some((p) => /not loopback|production host/.test(p)), problems.join('; '));
});

test('guard REFUSES a missing mock upstream (real provider calls possible)', () => {
  const problems = collectViolations(goodConfig({ mockUpstream: false }));
  assert.ok(problems.some((p) => /mock upstream fetch is NOT injected/.test(p)), problems.join('; '));
});

test('guard REFUSES production payment mode', () => {
  const problems = collectViolations(goodConfig({ klikqrisMode: 'production' }));
  assert.ok(problems.some((p) => /real-money mode is never allowed/.test(p)), problems.join('; '));
});

test('guard REFUSES data paths outside the isolated run dir', () => {
  const problems = collectViolations(goodConfig({ authDbFile: '/tmp/somewhere-else/auth.sqlite' }));
  assert.ok(problems.some((p) => /not inside the isolated dataDir/.test(p)), problems.join('; '));
});

test('assertIsolatedConfig throws IsolationViolation with all problems', () => {
  let err = null;
  try {
    assertIsolatedConfig(goodConfig({ frontendPort: 4601, baseUrl: 'http://localhost:4601', mockUpstream: false }));
  } catch (e) { err = e; }
  assert.ok(err instanceof IsolationViolation);
  assert.equal(err.code, 'E2E_ISOLATION_VIOLATION');
  assert.ok(err.problems.length >= 2);
});
