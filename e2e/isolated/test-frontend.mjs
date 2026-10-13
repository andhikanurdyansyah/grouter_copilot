/**
 * Isolated E2E frontend entrypoint (port from FRONTEND_PORT).
 *
 * Reuses the real `createFrontendServer` but points it at the isolated backend
 * via BACKEND_URL. Never loads server/.env.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.NODE_ENV !== 'test') {
  console.error('[test-frontend] refusing to boot: NODE_ENV must be "test"');
  process.exit(3);
}
if (!process.env.BACKEND_URL) {
  console.error('[test-frontend] refusing to boot: BACKEND_URL must be set to the isolated backend');
  process.exit(3);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const { createFrontendServer } = await import(
  path.join(here, '..', '..', 'server', 'src', 'frontendServer.js')
);

const port = parseInt(process.env.FRONTEND_PORT ?? '4691', 10);
const server = createFrontendServer({ port, backendUrl: process.env.BACKEND_URL });

server.listen(port, () => {
  console.log(`[test-frontend] isolated Copilot frontend listening on http://localhost:${port}`);
  console.log(`[test-frontend] proxying /api/* -> ${process.env.BACKEND_URL}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { server.close(() => process.exit(0)); });
}
