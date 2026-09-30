/**
 * Entry point: run the license server + admin dashboard.
 * Usage: node src/server.js  (or `npm start` in server/)
 */

import { createCopilotServer } from './server.js';

const port = parseInt(process.env.PORT ?? '4600', 10);
const { server, keys } = createCopilotServer({ port });

server.listen(port, () => {
  console.log(`gRouter Copilot license server listening on http://localhost:${port}`);
  if (!process.env.LICENSE_PRIVATE_KEY_PEM) {
    console.warn('WARNING: no LICENSE_PRIVATE_KEY_PEM set — using an ephemeral keypair.');
    console.warn('Persist keys before production. Public key (compile into plugin):');
    console.warn(keys.publicKeyPem);
  }
});
