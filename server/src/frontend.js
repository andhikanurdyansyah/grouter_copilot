/**
 * Frontend server entry point (port 4601 → copilot.grouter.id).
 * Loads .env first (for BACKEND_URL), then starts the frontend server.
 */

import { loadEnv } from './loadEnv.js';
loadEnv();

const { createFrontendServer } = await import('./frontendServer.js');
const port = parseInt(process.env.FRONTEND_PORT ?? '4601', 10);
const server = createFrontendServer({ port });

server.listen(port, () => {
  console.log(`gRouter Copilot frontend listening on http://localhost:${port} (domain: copilot.grouter.id)`);
});
