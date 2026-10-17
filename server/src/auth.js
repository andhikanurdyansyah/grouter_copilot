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
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSettings } from './settings.js';
import { createMailer, buildPasswordResetEmail } from './mail.js';

// Password-reset mailer: delegates to the shared mail module (Resend via
// injected/global fetch, settings-gated). Created lazily without store
// access — auth.js builds the Better Auth singleton once at boot, before
// any store exists; settings resolve to defaults + env seeds here, which
// keeps the notifications.email.passwordReset toggle effective for the
// out-of-box configuration. The reset URL lives ONLY inside the email
// payload; logs carry email + status metadata only, never the URL/token.
const resetMailer = createMailer({
  env: process.env,
  settingsGetter: () => resolveSettings({}, process.env),
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the Better Auth SQLite file.
 *
 * SAFETY — test isolation. Better Auth reads this ONCE at import time. An unset
 * AUTH_DB_FILE used to default to the PRODUCTION `data/auth.sqlite`, so every
 * `node --test` run that booted the server wrote QA accounts straight into the
 * production database (the root cause of the historic account accumulation).
 * Under NODE_ENV=test we now DERIVE an isolated per-process temp DB unless the
 * caller explicitly set AUTH_DB_FILE. A bare empty sqlite file makes Better Auth
 * throw SchemaMismatchError (there is no auto-migration), so the temp DB is
 * seeded from the prod schema with all rows cleared.
 */
function resolveAuthDbFile() {
  const explicit = (process.env.AUTH_DB_FILE || '').trim();
  if (explicit) return explicit;
  const prodFile = path.join(__dirname, '..', 'data', 'auth.sqlite');
  if (process.env.NODE_ENV !== 'test') return prodFile;
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-auth-test-'));
  const file = path.join(dir, 'auth.sqlite');
  try {
    copyFileSync(prodFile, file);
    const db = new Database(file);
    db.pragma('foreign_keys = OFF');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all();
    for (const { name } of tables) db.prepare(`DELETE FROM "${name}"`).run();
    db.close();
    console.log(`[auth] NODE_ENV=test tanpa AUTH_DB_FILE → auth DB terisolasi: ${file}`);
  } catch (err) {
    // Prod schema source missing (fresh checkout): still stay OFF production data.
    console.log(
      `[auth] WARN: gagal menyemai auth DB test dari ${prodFile} (${err.message}); memakai ${file}`,
    );
  }
  return file;
}

const dbFile = resolveAuthDbFile();

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
    // Fondasi forgot password: token reset dibuat & disimpan di DB (verification table),
    // endpoint /api/auth/request-password-reset + /reset-password aktif. Anti user-enumeration:
    // response selalu 200 generik, URL reset TIDAK pernah dikirim ke client.
    // Pengiriman email: didelegasikan ke mail module (server/src/mail.js).
    // Bila RESEND_API_KEY diset & email aktif → email nyata via Resend;
    // bila tidak → status log_only. URL reset HANYA di dalam payload email,
    // tidak pernah di-log (hanya email + status).
    sendResetPassword: async ({ user, url }) => {
      const tpl = buildPasswordResetEmail({ url });
      const result = await resetMailer.send({
        to: user.email, subject: tpl.subject, html: tpl.html, text: tpl.text, kind: 'passwordReset',
      });
      // Status metadata only — never the reset URL/token, key, or body.
      console.log(`[auth] password reset email untuk ${user.email}: status=${result.status}`);
    },
    resetPasswordTokenExpiresIn: 3600, // 1 jam
    // Reset password = logout semua sesi user (keamanan standar).
    revokeSessionsOnPasswordReset: true,
    onPasswordReset: ({ user }) => {
      console.log(`[auth] password direset untuk ${user.email}`);
    },
  },
  // Rate limit auth endpoints. Default Better Auth: special rule 3 req/10 dtk
  // untuk /sign-up+/sign-in per IP — terlalu ketat untuk satu kantor/NAT sah
  // (login tim + QA E2E memicu 429 "Too many requests"). customRules override
  // special rule: 20 req/10 dtk per IP masih menahan credential stuffing
  // (sentinel tetap aktif), tapi tidak lagi menolak login sah beruntun.
  rateLimit: {
    enabled: true,
    window: 10,
    max: 100,
    customRules: {
      '/sign-up/email': { window: 10, max: 20 },
      '/sign-in/email': { window: 10, max: 20 },
    },
  },
  ...(socialProviders ? { socialProviders } : {}),
  advanced: {
    // Behind Cloudflare Tunnel + frontend proxy: resolve the real client IP so
    // rate limiting keys on the actual client, not one shared bucket.
    ipAddress: {
      ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for', 'x-real-ip'],
      // Percayai loopback proxy (frontendServer 4601 → 4600, cloudflared) agar
      // rantai x-forwarded-for dengan hop loopback tetap resolve ke client IP;
      // tanpa ini, x-forwarded-for berisi ≥2 hop → null → rate limit satu bucket.
      trustedProxies: ['127.0.0.1', '::1'],
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