/**
 * Better Auth instance for gRouter Copilot.
 * Email/password now; Google OAuth is a deferred provider (docs/25-pending).
 */

import { betterAuth } from 'better-auth';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbFile = process.env.AUTH_DB_FILE || path.join(__dirname, '..', 'data', 'auth.sqlite');

export const auth = betterAuth({
  database: new Database(dbFile),
  emailAndPassword: {
    enabled: true,
  },
  // NOTE: Google OAuth provider is PENDING (needs clientId/clientSecret).
  // Add here when credentials are available:
  // socialProviders: { google: { clientId, clientSecret } },
});
