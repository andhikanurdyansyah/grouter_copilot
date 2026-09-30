/**
 * Better Auth instance for gRouter Copilot.
 *
 * - Email/password: enabled.
 * - Google OAuth: enabled ONLY when GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET are set.
 * - dash(): dashboard/analytics plugin (requires BETTER_AUTH_API_KEY).
 *
 * NOTE: frontend (copilot.grouter.id, port 4601) and backend (be.grouter.id,
 * port 4600) are DIFFERENT origins → trustedOrigins is REQUIRED or Better Auth
 * rejects requests with 403 INVALID_ORIGIN.
 *
 * NOTE: this server sits behind Cloudflare Tunnel + the frontend proxy, so the
 * real client IP arrives via cf-connecting-ip / x-forwarded-for. Without
 * ipAddressHeaders, Better Auth rate limiting falls back to one shared bucket.
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

// Google OAuth is only active when both credentials are present.
const googleClientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
const googleClientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
const socialProviders = (googleClientId && googleClientSecret)
  ? {
      google: {
        clientId: googleClientId,
        clientSecret: googleClientSecret,
        prompt: 'select_account',
      },
    }
  : undefined;

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || undefined,
  trustedOrigins,
  database: new Database(dbFile),
  plugins: [
    dash(), // Better Auth dashboard/analytics (requires BETTER_AUTH_API_KEY)
  ],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  ...(socialProviders ? { socialProviders } : {}),
  advanced: {
    // Behind Cloudflare Tunnel + frontend proxy: resolve the real client IP so
    // rate limiting keys on the actual client, not one shared bucket.
    ipAddress: {
      ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for', 'x-real-ip'],
    },
  },
});