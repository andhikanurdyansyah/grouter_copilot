/**
 * Entry point: run the license server + admin dashboard.
 * Usage: node src/server.js  (or `npm start` in server/)
 */

import { createCopilotServer } from './server.js';
import { loadEnv } from './loadEnv.js';
import { loadPersistedKeys } from './loadKeys.js';

loadEnv(); // load .env (zero-dependency) before reading config
const keys = loadPersistedKeys(); // stable keypair (persisted), never ephemeral in production

const port = parseInt(process.env.PORT ?? '4600', 10);
const { server } = createCopilotServer({ port, privateKeyPem: keys.privateKeyPem, publicKeyPem: keys.publicKeyPem });

server.listen(port, () => {
  console.log(`gRouter Copilot license server listening on http://localhost:${port}`);
  if (!keys.persisted) {
    console.warn('WARNING: no persisted license keypair — using an ephemeral keypair (licenses invalidate on restart).');
    console.warn('Persist keys in server/data/keys/ or LICENSE_PRIVATE_KEY_PEM / LICENSE_PUBLIC_KEY_PEM env.');
  } else {
    console.log('License keypair: persisted (stable across restarts).');
  }
});
