/**
 * E2E isolation guard — fail-closed validation of the test environment.
 *
 * WHY: the previous `npm run e2e` ran Playwright against the LIVE production
 * services (localhost:4600/4601) and created QA accounts in production. This
 * module is the single choke point that REFUSES to start unless every signal
 * proves the target is a disposable, isolated instance.
 *
 * It is a pure function (no side effects) so it can be unit-tested: see
 * test/e2e-isolation-guard.test.js.
 *
 * Rules (ALL must hold):
 *   - NODE_ENV must be 'test' (never production/development).
 *   - A mock upstream FETCH must be injected (no real provider is contacted).
 *   - Backend/frontend ports must be non-production, high, and distinct.
 *   - Every data path (DATA_FILE/AUTH_DB_FILE + the run dir) must live OUTSIDE
 *     the production data dir (server/data/).
 *   - The E2E base URL must be loopback (localhost/127.0.0.1/::1), never a
 *     public host.
 *   - Payment mode must never be 'production'.
 */

import path from 'node:path';

export const PROD_PORTS = [4600, 4601];

// Hosts / suffixes that identify production or the provider. A base URL
// resolving to any of these is refused outright.
const FORBIDDEN_HOSTS = [
  'grouter.id',
  'grouter.web.id',
  'klikqris.com',
];
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]'];

export class IsolationViolation extends Error {
  constructor(problems) {
    const list = Array.isArray(problems) ? problems : [problems];
    super(`E2E isolation guard refused to start:\n  - ${list.join('\n  - ')}`);
    this.name = 'IsolationViolation';
    this.code = 'E2E_ISOLATION_VIOLATION';
    this.problems = list;
  }
}

/**
 * Return the list of isolation violations for a candidate config.
 * Empty array = safe to run.
 *
 * @param {object} cfg
 * @param {string} cfg.nodeEnv
 * @param {boolean} cfg.mockUpstream         a fake fetch is injected
 * @param {number} cfg.backendPort
 * @param {number} cfg.frontendPort
 * @param {string} cfg.dataDir               run temp dir
 * @param {string} cfg.dataFile
 * @param {string} cfg.authDbFile
 * @param {string} cfg.baseUrl               Playwright target
 * @param {string} cfg.klikqrisMode
 * @param {string} [cfg.prodDataDir]         default <repo>/server/data
 */
export function collectViolations(cfg = {}) {
  const problems = [];
  const add = (msg) => problems.push(msg);
  const prodDataDir = path.resolve(cfg.prodDataDir || path.join(process.cwd(), 'server', 'data'));

  // 1. Environment.
  if (String(cfg.nodeEnv) !== 'test') {
    add(`NODE_ENV must be 'test' (got ${JSON.stringify(cfg.nodeEnv)})`);
  }

  // 2. Outbound must be mocked — no real provider call can leave the machine.
  if (cfg.mockUpstream !== true) {
    add('mock upstream fetch is NOT injected (real provider calls would be possible)');
  }

  // 3. Ports.
  const beOk = Number.isInteger(cfg.backendPort) && cfg.backendPort > 1024 && !PROD_PORTS.includes(cfg.backendPort);
  const feOk = Number.isInteger(cfg.frontendPort) && cfg.frontendPort > 1024 && !PROD_PORTS.includes(cfg.frontendPort);
  if (!beOk) add(`backendPort ${cfg.backendPort} is invalid or a production port (${PROD_PORTS.join('/')})`);
  if (!feOk) add(`frontendPort ${cfg.frontendPort} is invalid or a production port (${PROD_PORTS.join('/')})`);
  if (cfg.backendPort === cfg.frontendPort) add('backendPort and frontendPort must differ');

  // 4. Data paths must be inside the run dir and OUTSIDE the production data dir.
  const inside = (child, parent) => {
    const rel = path.relative(parent, child);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  };
  for (const [label, p] of [['dataDir', cfg.dataDir], ['dataFile', cfg.dataFile], ['authDbFile', cfg.authDbFile]]) {
    if (!p || typeof p !== 'string') { add(`${label} is missing`); continue; }
    const abs = path.resolve(p);
    if (inside(abs, prodDataDir)) {
      add(`${label} ${abs} resolves INSIDE the production data dir (${prodDataDir})`);
    }
    if (label !== 'dataDir') {
      if (!inside(abs, path.resolve(cfg.dataDir || '/'))) {
        add(`${label} ${abs} is not inside the isolated dataDir (${cfg.dataDir})`);
      }
    }
  }

  // 5. Base URL must be loopback.
  let host = null;
  let port = null;
  try {
    const u = new URL(cfg.baseUrl);
    host = u.hostname;
    port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80);
  } catch {
    add(`baseUrl ${JSON.stringify(cfg.baseUrl)} is not a valid URL`);
  }
  if (host) {
    if (!LOOPBACK_HOSTS.includes(host)) {
      add(`baseUrl host ${host} is not loopback — refuses to target a remote/production origin`);
    }
    if (FORBIDDEN_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
      add(`baseUrl host ${host} is a production host`);
    }
    if (Number.isInteger(cfg.frontendPort) && port !== cfg.frontendPort) {
      add(`baseUrl port ${port} does not match the isolated frontendPort ${cfg.frontendPort}`);
    }
  }

  // 6. Payment must stay in sandbox.
  if (String(cfg.klikqrisMode) === 'production') {
    add("KLIKQRIS mode is 'production' — real-money mode is never allowed in E2E");
  }

  return problems;
}

/** Throwing wrapper: raises IsolationViolation when any rule fails. */
export function assertIsolatedConfig(cfg = {}) {
  const problems = collectViolations(cfg);
  if (problems.length) throw new IsolationViolation(problems);
  return true;
}
