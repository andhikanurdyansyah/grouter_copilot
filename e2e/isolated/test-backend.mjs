/**
 * Isolated E2E backend entrypoint.
 *
 * Boots the REAL `createCopilotServer` (no forked logic) but:
 *   - reads DATA_FILE / AUTH_DB_FILE from the run dir (set by the orchestrator),
 *   - injects the mock upstream fetch (no real network, no real credentials),
 *   - seeds a synthetic plan catalogue + a fixed test-only ADMIN_TOKEN,
 *   - NEVER loads server/.env (so no production credential can bleed in).
 *
 * This file is launched by e2e/isolated/setup.mjs as a child process. It must
 * be a separate process (Playwright drives a real HTTP origin), so the
 * orchestrator guarantees the env before this module is imported.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMockUpstream } from './mock-upstream.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

// ── Hard precondition: never run under anything but the isolated test mode ──
if (process.env.NODE_ENV !== 'test') {
  console.error('[test-backend] refusing to boot: NODE_ENV must be "test"');
  process.exit(3);
}
if (!process.env.DATA_FILE || !process.env.AUTH_DB_FILE) {
  console.error('[test-backend] refusing to boot: DATA_FILE and AUTH_DB_FILE must be set');
  process.exit(3);
}

const port = parseInt(process.env.PORT ?? '4690', 10);
const paySeam = process.env.E2E_PAY_SEAM === '1';

// Synthetic plan catalogue — mirrors the production SHAPE (keys/quantities) but
// is entirely self-defined; no customer data is copied.
const SYNTHETIC_PLANS = [
  { key: 'quota-3b-90d', name: '3B · 3 months', amount: 10000, currency: 'IDR', quota: '3B usage', quotaTokens: 3_000_000, features: ['core'], expiresInDays: 90, active: true, ai: { enabled: true, allowedModels: ['mock-model'], defaultModel: 'mock-model' } },
  { key: 'quota-15b-365d', name: '15B · 1 year', amount: 20000, currency: 'IDR', quota: '15B usage', quotaTokens: 15_000_000, features: ['core', 'pro'], expiresInDays: 365, active: true, ai: { enabled: true, allowedModels: ['mock-model'], defaultModel: 'mock-model' } },
  { key: 'custom', name: 'Custom', amount: 0, currency: 'IDR', quota: 'Custom usage', quotaTokens: null, features: ['core', 'pro', 'enterprise'], expiresInDays: 365, active: true },
];

const mockFetch = createMockUpstream({ paySeam });

const { createCopilotServer } = await import(
  path.join(here, '..', '..', 'server', 'src', 'server.js')
);

const { server } = createCopilotServer({
  port,
  dataFile: process.env.DATA_FILE,
  fetch: mockFetch,
  // A fixed, non-empty token keeps admin routes FAIL-CLOSED (401 without it) —
  // exactly the behaviour the admin spec asserts. Values are test-only.
  adminToken: process.env.ADMIN_TOKEN || 'e2e-isolated-admin-token',
  // Ephemeral keypair is fine here (NODE_ENV=test) — no real license persists.
  initialSettings: { plans: SYNTHETIC_PLANS, payment: { mode: 'sandbox' } },
});

server.listen(port, () => {
  console.log(`[test-backend] isolated Copilot backend listening on http://localhost:${port}`);
  console.log(`[test-backend] DATA_FILE=${process.env.DATA_FILE}`);
  console.log(`[test-backend] AUTH_DB_FILE=${process.env.AUTH_DB_FILE}`);
  console.log(`[test-backend] paySeam=${paySeam}`);
});

// Graceful shutdown so the orchestrator can clean up on any signal.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { server.close(() => process.exit(0)); });
}
