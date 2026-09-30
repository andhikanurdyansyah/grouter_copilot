/**
 * Better Auth instance for gRouter Copilot.
 * Email/password now; Google OAuth is a deferred provider (docs/25-pending).
 *
 * NOTE: frontend (copilot.grouter.id, port 4601) and backend (be.grouter.id,
 * port 4600) are DIFFERENT origins → trustedOrigins is REQUIRED or Better Auth
 * rejects requests with 403 INVALID_ORIGIN. See Better Auth docs (trustedOrigins).
 */

import { betterAuth } from 'better-auth';
import { dash } from '@better-auth/infra';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbFile = process.env.AUTH_DB_FILE || path.join(__dirname, '..', 'data', 'auth.sqlite');

// Trusted origins: the frontend origin (and local dev origins).
// BETTER_AUTH_TRUSTED_ORIGINS is a comma-separated override.
const trustedOrigins = (process.env.BETTER_AUTH_TRUSTED_ORIGINS
  || [
    'https://copilot.grouter.id',
    'https://be.grouter.id',
    'http://localhost:4601',
    'http://127.0.0.1:4601',
  ].join(','))
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || undefined,
  trustedOrigins,
  database: new Database(dbFile),
  plugins: [
    dash(), // Better Auth dashboard/analytics (requires BETTER_AUTH_API_KEY)
  ],
  emailAndPassword: {
    enabled: true,
  },
  // NOTE: Google OAuth provider is PENDING (needs clientId/clientSecret).
  // Add here when credentials are available:
  // socialProviders: { google: { clientId, clientSecret } },
});