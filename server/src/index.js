/**
 * Entry point: run the license server + admin dashboard.
 * Loads .env FIRST (before any module that reads env at import time, e.g. auth.js dash()).
 * Then dynamically imports the server.
 */

import { loadEnv } from './loadEnv.js';
import { loadPersistedKeys } from './loadKeys.js';
import { evaluateProductionReadiness, formatReadinessReport } from './readiness.js';

loadEnv(); // MUST run before importing server.js / auth.js (dash reads BETTER_AUTH_API_KEY at init)
const keys = loadPersistedKeys();

const { createCopilotServer } = await import('./server.js');
const port = parseInt(process.env.PORT ?? '4600', 10);
// DATA_FILE lets an isolated instance (E2E / staging) keep its own store.json
// without touching the production data directory.
const { server } = createCopilotServer({
  port,
  privateKeyPem: keys.privateKeyPem,
  publicKeyPem: keys.publicKeyPem,
  ...(process.env.DATA_FILE ? { dataFile: process.env.DATA_FILE } : {}),
});

// Advisory readiness report: logs which go-live gates are open. Hard failures
// (no admin token / no persisted keypair in production) already refuse to boot
// inside createCopilotServer; this surfaces the remaining advisory items.
console.log(formatReadinessReport(evaluateProductionReadiness({
  licenseKeysPersisted: keys.persisted,
  paymentMode: process.env.KLIKQRIS_MODE || 'sandbox',
})));

server.listen(port, () => {
  console.log(`gRouter Copilot license server listening on http://localhost:${port}`);
  if (!keys.persisted) {
    console.warn('WARNING: no persisted license keypair — using an ephemeral keypair (licenses invalidate on restart).');
  } else {
    console.log('License keypair: persisted (stable across restarts).');
  }
});
