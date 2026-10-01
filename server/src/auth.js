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
import { resolveSettings } from './settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbFile = process.env.AUTH_DB_FILE || path.join(__dirname, '..', 'data', 'auth.sqlite');

// Auth configuration comes from the settings SSOT (defaults <- env seeds).
// The store layer is intentionally NOT read here: this module builds the Better
// Auth singleton ONCE at boot, so store-level auth changes require a restart
// (`pm2 restart copilot-backend --update-env`) to take effect. Env vars remain
// SEEDS (BETTER_AUTH_TRUSTED_ORIGINS etc. keep working as before).
const effAuth = resolveSettings({}, process.env).auth;

// Trusted origins: resolved from settings defaults (+ BETTER_AUTH_TRUSTED_ORIGINS seed).
// NOTE: the retired `be.grouter.id` backend origin is deliberately NOT in the
// default list (single-origin architecture — see docs/handoff §2).
const trustedOrigins = effAuth.trustedOrigins
  .map((s) => String(s).trim())
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

// Cross-subdomain cookie scope is ONLY needed when the frontend and backend are
// served from DIFFERENT subdomains (split-origin OAuth). The default deployment
// is SINGLE-origin (copilot.grouter.id proxying /api/* to the backend), where a
// host-only cookie is correct and safer. Enable it only when explicitly set.
const cookieDomain = (process.env.BETTER_AUTH_COOKIE_DOMAIN || '').trim() || null;

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
        updateInterval: effAuth.activityTrackingIntervalMs ?? 300000,
      },
    }),
    sentinel({
      ...(apiKey ? { apiKey } : {}),
      ...(apiUrl ? { apiUrl } : {}),
      ...(kvUrl ? { kvUrl } : {}),
      security: {
        credentialStuffing: {
          enabled: true,
          thresholds: {
            challenge: effAuth.sentinel?.credentialStuffing?.challenge ?? 3,
            block: effAuth.sentinel?.credentialStuffing?.block ?? 5,
          },
        },
        impossibleTravel: {
          enabled: true,
          maxSpeedKmh: effAuth.sentinel?.impossibleTravelMaxSpeedKmh ?? 1000,
          action: 'challenge',
        },
        compromisedPassword: {
          enabled: true,
          action: 'block',
          minBreachCount: effAuth.sentinel?.compromisedPasswordMinBreaches ?? 1,
        },
        emailValidation: { enabled: true },
      },
    }),
    organization(),
  ],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: effAuth.minPasswordLength ?? 8,
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