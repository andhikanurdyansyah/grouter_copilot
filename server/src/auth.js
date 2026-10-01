/**
 * Better Auth instance for gRouter Copilot.
 *
 * Providers:
 * - Email/password: enabled.
 * - Google OAuth: enabled ONLY when GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET are set.
 *
 * Plugins:
 * - dash()        — Better Auth Infrastructure dashboard/analytics (BETTER_AUTH_API_KEY).
 * - sentinel()    — security: credential stuffing, impossible travel, compromised
 *                   password, email validation, bot/suspicious-IP blocking.
 * - organization()— multi-tenant orgs (members, roles, invitations, teams).
 *
 * NOTE: frontend (copilot.grouter.id, port 4601) and backend (be.grouter.id,
 * port 4600) are DIFFERENT origins → trustedOrigins is REQUIRED or Better Auth
 * rejects requests with 403 INVALID_ORIGIN.
 *
 * NOTE: this server sits behind Cloudflare Tunnel + the frontend proxy, so the
 * real client IP arrives via cf-connecting-ip. Without ipAddressHeaders,
 * Better Auth rate limiting falls back to one shared bucket.
 */

import { betterAuth } from 'better-auth';
import { organization } from 'better-auth/plugins';
import { dash, sentinel } from '@better-auth/infra';
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

// Better Auth Infrastructure (dash + sentinel).
const apiKey = (process.env.BETTER_AUTH_API_KEY || '').trim();
const apiUrl = (process.env.BETTER_AUTH_API_URL || '').trim() || undefined;
const kvUrl = (process.env.BETTER_AUTH_KV_URL || '').trim() || undefined;

// Cross-subdomain cookie domain: the frontend (copilot.grouter.id) starts the
// Google flow but the callback lands on the backend (be.grouter.id), so the
// OAuth `state` cookie must be shared across both subdomains or Better Auth
// rejects the exchange with `state_mismatch`. Derived from BETTER_AUTH_URL so
// localhost/IP dev origins (which need no sharing) stay on host-only cookies.
function crossSubDomainCookieDomain() {
  const explicit = (process.env.BETTER_AUTH_COOKIE_DOMAIN || '').trim();
  if (explicit) return explicit;
  try {
    const host = new URL(process.env.BETTER_AUTH_URL || '').hostname;
    if (!host || host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
    const parts = host.split('.');
    return parts.length >= 2 ? parts.slice(-2).join('.') : host;
  } catch {
    return null;
  }
}
const cookieDomain = crossSubDomainCookieDomain();

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || undefined,
  trustedOrigins,
  database: new Database(dbFile),
  plugins: [
    dash({
      ...(apiKey ? { apiKey } : {}),
      ...(apiUrl ? { apiUrl } : {}),
      ...(kvUrl ? { kvUrl } : {}),
      activityTracking: {
        enabled: true,
        updateInterval: 300000, // 5 min
      },
    }),
    sentinel({
      ...(apiKey ? { apiKey } : {}),
      ...(apiUrl ? { apiUrl } : {}),
      ...(kvUrl ? { kvUrl } : {}),
      security: {
        credentialStuffing: {
          enabled: true,
          thresholds: { challenge: 3, block: 5 },
        },
        impossibleTravel: { enabled: true, maxSpeedKmh: 1000, action: 'challenge' },
        compromisedPassword: { enabled: true, action: 'block', minBreachCount: 1 },
        emailValidation: { enabled: true },
      },
    }),
    organization(),
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
    // gRouter Copilot runs on TWO origins that must share auth cookies:
    //   copilot.grouter.id (frontend: starts the Google flow)
    //   be.grouter.id      (backend:  receives /api/auth/callback/google)
    // Without a shared parent-domain cookie the OAuth `state` cookie set on the
    // frontend origin is NOT sent to the backend callback → Better Auth rejects
    // the exchange with `state_mismatch` (`State not persisted correctly`).
    // Scoping to the registrable domain makes the cookie visible to both
    // subdomains; null (localhost/IP) keeps host-only cookies.
    ...(cookieDomain
      ? { crossSubDomainCookies: { enabled: true, domain: cookieDomain } }
      : {}),
  },
});