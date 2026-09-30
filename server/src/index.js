/**
 * Entry point: run the license server + admin dashboard.
 * Loads .env FIRST (before any module that reads env at import time, e.g. auth.js dash()).
 * Then dynamically imports the server.
 */

import { loadEnv } from './loadEnv.js';
import { loadPersistedKeys } from './loadKeys.js';

loadEnv(); // MUST run before importing server.js / auth.js (dash reads BETTER_AUTH_API_KEY at init)
const keys = loadPersistedKeys();

const { createCopilotServer } = await import('./server.js');
const port = parseInt(process.env.PORT ?? '4600', 10);
const { server } = createCopilotServer({ port, privateKeyPem: keys.privateKeyPem, publicKeyPem: keys.publicKeyPem });

server.listen(port, () => {
  console.log(`gRouter Copilot license server listening on http://localhost:${port}`);
  if (!keys.persisted) {
    console.warn('WARNING: no persisted license keypair — using an ephemeral keypair (licenses invalidate on restart).');
  } else {
    console.log('License keypair: persisted (stable across restarts).');
  }
});
