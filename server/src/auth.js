/**
 * Better Auth instance for gRouter Copilot.
 * Email/password now; Google OAuth is a deferred provider (docs/25-pending).
 */

import { betterAuth } from 'better-auth';
import { dash } from '@better-auth/infra';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbFile = process.env.AUTH_DB_FILE || path.join(__dirname, '..', 'data', 'auth.sqlite');

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || undefined,
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
