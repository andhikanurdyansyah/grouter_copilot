/**
 * gRouter Copilot — license server + admin dashboard.
 * Zero-dependency Node http server (no external packages, no npm install).
 *
 * Endpoints:
 *   GET  /api/admin/stats    → aggregate stats (admin only)
 *   GET  /api/admin/licenses → list licenses (no raw tokens)
 *   POST /api/admin/licenses → issue license { customer, features?, expiresInDays? }
 *   POST /api/admin/licenses/:id/revoke → revoke
 *   POST /api/heartbeat      → { token, installId, baseUrl } (called by plugin)
 *   GET  /                  → admin dashboard HTML
 *
 * Auth: simple admin token via ADMIN_TOKEN env (Bearer). In MVP, heartbeat is
 * unauthenticated (it carries a signed license), but issue/revoke require admin.
 */

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JsonStore } from './store.js';
import { LicenseService } from './licenseService.js';
import { UsageResolver } from './usageResolver.js';
import { KlikQris, isPaidStatus } from './klikqris.js';
import { PaymentService } from './paymentService.js';
import { auth } from './auth.js';
import { toNodeHandler } from 'better-auth/node';
import { AccountService } from './accountService.js';
import {
  resolveSettings, validateSettings, stripMaskedSecrets, maskSettings, publicPlans, findPlan,
} from './settings.js';
import { generateKeyPair } from '../../src/license/validate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authHandler = toNodeHandler(auth.handler);

export function createCopilotServer({
  port = 4600,
  dataFile = path.join(__dirname, '..', 'data', 'store.json'),
  privateKeyPem = null,
  publicKeyPem = null,
  adminToken = process.env.ADMIN_TOKEN || null,
  checkUsageUrl = process.env.GROUTER_CHECK_USAGE_URL || undefined,
  fetch = globalThis.fetch,
} = {}) {
  // Generate a keypair if not provided (ephemeral for local dev; production must persist).
  let keys = { privateKeyPem, publicKeyPem };
  if (!keys.privateKeyPem || !keys.publicKeyPem) {
    keys = generateKeyPair();
  }

  const store = new JsonStore(dataFile);
  const effSettings = resolveSettings(store.getSettings());
  const service = new LicenseService({ store, privateKeyPem: keys.privateKeyPem });
  // Settings SSOT (D-020): the usage URL/TTL and the KlikQRIS mode/base URL are
  // read from the resolved settings (defaults <- env seeds <- store), with the
  // explicit constructor args (used by tests) winning over everything else.
  const usage = new UsageResolver({
    fetchImpl: fetch,
    checkUsageUrl: checkUsageUrl ?? effSettings.usage.checkUsageUrl,
    ttlMs: effSettings.usage.cacheTtlMs,
  });
  const klikqris = new KlikQris({
    fetchImpl: fetch,
    mode: effSettings.payment.mode,
    baseUrl: effSettings.payment.klikqrisBaseUrl || effSettings.payment.baseUrl,
  });
  const payment = new PaymentService({ klikqris, licenseService: service, store });
  const accounts = new AccountService({ store });

  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    const route = `${req.method} ${url.pathname}`;

    // Better Auth: hand off all /api/auth/* routes.
    if (url.pathname.startsWith('/api/auth')) {
      return authHandler(req, res);
    }

    // /api/me — authenticated account + licenses (uses Better Auth session).
    if (req.method === 'GET' && url.pathname === '/api/me') {
      return (async () => {
        const session = await auth.api.getSession({ headers: req.headers });
        if (!session?.user) {
          return sendJson(res, 401, { error: 'unauthenticated' });
        }
        const account = accounts.ensureAccount(session.user);
        const licenses = store.licensesByAccount(account.id).map(sanitizeLicense);
        return sendJson(res, 200, {
          account: { id: account.id, name: account.name, email: account.email },
          licenses,
        });
      })();
    }

    if (req.method === 'GET' && url.pathname === '/') {
      return sendHtml(res, 200, readFileSync(path.join(__dirname, '..', 'public', 'landing.html'), 'utf8'));
    }

    // Admin console is a SEPARATE surface from the customer site: it lives at
    // /admin (never at /), so a customer OAuth callback or error never lands on
    // the "Masuk sebagai Admin" gate.
    if (req.method === 'GET' && url.pathname === '/admin') {
      return sendHtml(res, 200, renderDashboardHtml(service));
    }

    if (req.method === 'GET' && url.pathname === '/landing') {
      return sendHtml(res, 200, readFileSync(path.join(__dirname, '..', 'public', 'landing.html'), 'utf8'));
    }

    if (req.method === 'GET' && url.pathname === '/register') {
      return sendHtml(res, 200, readFileSync(path.join(__dirname, '..', 'public', 'register.html'), 'utf8'));
    }

    if (req.method === 'GET' && url.pathname === '/login') {
      return sendHtml(res, 200, readFileSync(path.join(__dirname, '..', 'public', 'register.html'), 'utf8'));
    }

    if (req.method === 'GET' && url.pathname === '/user') {
      return sendHtml(res, 200, readFileSync(path.join(__dirname, '..', 'public', 'user-dashboard.html'), 'utf8'));
    }

    // Post-payment landing (KlikQRIS redirect URL target).
    if (req.method === 'GET' && (url.pathname === '/success' || url.pathname === '/checkout/success')) {
      return sendHtml(res, 200, readFileSync(path.join(__dirname, '..', 'public', 'success.html'), 'utf8'));
    }

    // Static assets (css)
    if (req.method === 'GET' && url.pathname.startsWith('/assets/')) {
      const file = path.join(__dirname, '..', 'public', url.pathname);
      try {
        const content = readFileSync(file, 'utf8');
        const type = file.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/octet-stream';
        res.writeHead(200, { 'content-type': type });
        return res.end(content);
      } catch {
        return sendJson(res, 404, { error: 'not found' });
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/admin/stats') {
      if (!requireAdmin(req, adminToken)) return sendJson(res, 401, { error: 'unauthorized' });
      return sendJson(res, 200, service.stats());
    }

    if (req.method === 'GET' && url.pathname === '/api/admin/licenses') {
      if (!requireAdmin(req, adminToken)) return sendJson(res, 401, { error: 'unauthorized' });
      const list = service.list().map(sanitizeLicense);
      return sendJson(res, 200, { licenses: list });
    }

    if (req.method === 'POST' && url.pathname === '/api/admin/licenses') {
      if (!requireAdmin(req, adminToken)) return sendJson(res, 401, { error: 'unauthorized' });
      return readBody(req).then((body) => {
        const { record, token } = service.issue({
          customer: body.customer,
          accountId: body.accountId ?? null,
          features: body.features,
          expiresInDays: body.expiresInDays,
          grouterApiKey: body.grouterApiKey ?? null,
        });
        return sendJson(res, 201, { license: sanitizeLicense(record), token });
      });
    }

    // Bind a gRouter api key to a license (admin).
    if (req.method === 'POST' && /^\/api\/admin\/licenses\/([^/]+)\/bind$/.test(url.pathname)) {
      if (!requireAdmin(req, adminToken)) return sendJson(res, 401, { error: 'unauthorized' });
      const id = url.pathname.split('/')[4];
      return readBody(req).then((body) => {
        const bound = service.bindApiKey(id, body.grouterApiKey);
        if (!bound) return sendJson(res, 404, { error: 'not found' });
        return sendJson(res, 200, { license: sanitizeLicense(bound), bound: true });
      });
    }

    // Key handoff: plugin exchanges a valid license for the bound gRouter api key.
    // This returns the api key (server-side handoff over TLS); it must NOT be
    // exposed to a browser. In production this is called by the CLI/installer.
    if (req.method === 'POST' && url.pathname === '/api/resolve') {
      return readBody(req).then((body) => {
        const result = service.validate(body.token, keys.publicKeyPem);
        if (result.status !== 'valid') {
          return sendJson(res, 403, { error: result.error ?? 'invalid license' });
        }
        const lic = service.list().find((l) => l.id === result.payload.lic);
        if (lic?.revokedAt) {
          return sendJson(res, 403, { error: 'license revoked' });
        }
        const apiKey = service.resolveApiKey(result.payload.lic);
        if (!apiKey) {
          return sendJson(res, 404, { error: 'no api key bound to this license' });
        }
        return sendJson(res, 200, { apiKey, baseUrl: body.baseUrl ?? null });
      });
    }

    if (req.method === 'POST' && /^\/api\/admin\/licenses\/([^/]+)\/revoke$/.test(url.pathname)) {
      if (!requireAdmin(req, adminToken)) return sendJson(res, 401, { error: 'unauthorized' });
      const id = url.pathname.split('/')[4];
      const revoked = service.revoke(id);
      if (!revoked) return sendJson(res, 404, { error: 'not found' });
      return sendJson(res, 200, { license: sanitizeLicense(revoked) });
    }

    if (req.method === 'POST' && url.pathname === '/api/heartbeat') {
      return readBody(req).then((body) => {
        // Validate the license offline (we have the public key) before recording.
        const result = service.validate(body.token, keys.publicKeyPem);
        if (result.status !== 'valid') {
          return sendJson(res, 403, { error: result.error ?? 'invalid license' });
        }
        // If the license was revoked server-side, reject.
        const lic = service.list().find((l) => l.id === result.payload.lic);
        if (lic?.revokedAt) {
          return sendJson(res, 403, { error: 'license revoked' });
        }
        store.recordHeartbeat({
          licenseId: result.payload.lic,
          installId: body.installId ?? 'unknown',
          baseUrl: body.baseUrl ?? null,
        });
        return sendJson(res, 200, { ok: true });
      });
    }

    // Usage endpoint (admin): fetch gRouter /check-usage for each license with a
    // bound api key. Read-only consumption of gRouter.
    if (req.method === 'GET' && url.pathname === '/api/admin/usage') {
      if (!requireAdmin(req, adminToken)) return sendJson(res, 401, { error: 'unauthorized' });
      return (async () => {
        const licenses = service.list();
        const results = [];
        for (const l of licenses) {
          if (!l.grouterApiKey) continue;
          try {
            const data = await usage.fetchUsage(l.id, l.grouterApiKey);
            results.push({ licenseId: l.id, customer: l.customer, usage: data });
          } catch {
            results.push({ licenseId: l.id, customer: l.customer, usage: null });
          }
        }
        return sendJson(res, 200, { usage: results });
      })();
    }

    // Public config: which auth providers are enabled (for the frontend UI).
    if (req.method === 'GET' && url.pathname === '/api/config') {
      const googleEnabled = Boolean(
        (process.env.GOOGLE_CLIENT_ID || '').trim() && (process.env.GOOGLE_CLIENT_SECRET || '').trim(),
      );
      const eff = resolveSettings(store.getSettings());
      return sendJson(res, 200, {
        providers: { google: googleEnabled },
        basePath: '/api/auth',
        payment: {
          enabled: klikqris.configured,
          mode: klikqris.mode,
        },
        branding: {
          productName: eff.branding.productName,
          publicDomain: eff.branding.publicDomain,
          currency: eff.branding.currency,
        },
      });
    }

    // Public plan catalogue — safe for the customer UI (no internals/secrets).
    // Consumed by landing + user dashboard instead of a hardcoded PACKAGES array.
    if (req.method === 'GET' && url.pathname === '/api/plans') {
      const eff = resolveSettings(store.getSettings());
      return sendJson(res, 200, { plans: publicPlans(eff), currency: eff.branding?.currency || 'IDR' });
    }

    // Admin: read the effective settings (secrets masked, never raw).
    if (req.method === 'GET' && url.pathname === '/api/admin/settings') {
      if (!requireAdmin(req, adminToken)) return sendJson(res, 401, { error: 'unauthorized' });
      const eff = resolveSettings(store.getSettings());
      return sendJson(res, 200, { settings: maskSettings(eff) });
    }

    // Admin: patch settings (validated; masked/empty secrets are kept as-is).
    if (req.method === 'PATCH' && url.pathname === '/api/admin/settings') {
      if (!requireAdmin(req, adminToken)) return sendJson(res, 401, { error: 'unauthorized' });
      return readBody(req).then((body) => {
        try {
          const clean = stripMaskedSecrets(body);
          const patch = validateSettings(clean);
          store.updateSettings(patch);
          const eff = resolveSettings(store.getSettings());
          return sendJson(res, 200, { settings: maskSettings(eff) });
        } catch (err) {
          return sendJson(res, err.code === 'INVALID_SETTINGS' ? 400 : 500, { error: err.message });
        }
      });
    }

    // Customer: the authenticated account's most recent order (for /success).
    if (req.method === 'GET' && url.pathname === '/api/orders/latest') {
      return (async () => {
        const session = await auth.api.getSession({ headers: req.headers });
        if (!session?.user) return sendJson(res, 401, { error: 'unauthenticated' });
        const account = accounts.ensureAccount(session.user);
        const orders = store.listOrders().filter((o) => o.accountId === account.id);
        const order = orders.length ? orders[orders.length - 1] : null;
        if (!order) return sendJson(res, 200, { order: null });
        const license = store.licensesByAccount(account.id)
          .filter((l) => l.createdAt >= order.createdAt)
          .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
        return sendJson(res, 200, {
          order: sanitizeOrder(order),
          license: license ? sanitizeLicense(license) : null,
        });
      })();
    }

    // Customer: poll a single order (session-scoped — never exposes other accounts).
    if (req.method === 'GET' && /^\/api\/orders\/([^/]+)$/.test(url.pathname)) {
      return (async () => {
        const session = await auth.api.getSession({ headers: req.headers });
        if (!session?.user) return sendJson(res, 401, { error: 'unauthenticated' });
        const account = accounts.ensureAccount(session.user);
        const id = decodeURIComponent(url.pathname.split('/')[3]);
        const order = store.getOrder(id);
        if (!order || order.accountId !== account.id) {
          return sendJson(res, 404, { error: 'not found' });
        }
        return sendJson(res, 200, { order: sanitizeOrder(order) });
      })();
    }

    // Admin: manually settle an order (ops/testing; same verified path as webhook).
    if (req.method === 'POST' && /^\/api\/admin\/orders\/([^/]+)\/settle$/.test(url.pathname)) {
      if (!requireAdmin(req, adminToken)) return sendJson(res, 401, { error: 'unauthorized' });
      const orderId = url.pathname.split('/')[4];
      return payment.settlePaid(orderId).then(({ order, license }) => {
        if (!order) return sendJson(res, 404, { error: 'order not found' });
        return sendJson(res, 200, { ok: true, licenseId: license?.id ?? null });
      });
    }

    // Create a payment order (customer checkout). Returns KlikQRIS QR.
    // SECURITY (A1 / cost-integrity, D-020): the price and entitlement are
    // resolved SERVER-SIDE from the plan catalogue by packageKey — the request
    // body is never trusted for the amount (a client could otherwise pay Rp1
    // for a Rp249.000 plan). The accountId is derived from the authenticated
    // session, never from the request body.
    if (req.method === 'POST' && url.pathname === '/api/orders') {
      return (async () => {
        const session = await auth.api.getSession({ headers: req.headers });
        if (!session?.user) return sendJson(res, 401, { error: 'unauthenticated' });
        const account = accounts.ensureAccount(session.user);
        const body = await readBody(req);
        if (body.amount !== undefined) {
          return sendJson(res, 400, { error: 'amount is resolved server-side; send packageKey only' });
        }
        if (body.description !== undefined) {
          return sendJson(res, 400, { error: 'description is derived server-side from the plan; send packageKey only' });
        }
        if (!body.packageKey || typeof body.packageKey !== 'string') {
          return sendJson(res, 400, { error: 'packageKey is required' });
        }
        const eff = resolveSettings(store.getSettings());
        const plan = findPlan(eff, body.packageKey);
        if (!plan || plan.active === false) {
          return sendJson(res, 400, { error: 'unknown or inactive package' });
        }
        try {
          const { order, qr } = await payment.createOrder({ plan, accountId: account.id });
          return sendJson(res, 201, { order, qr: { qrUrl: qr.qrUrl, qrImage: qr.qrImage, expiredAt: qr.expiredAt } });
        } catch (err) {
          return sendJson(res, err.code === 'AUTH_FAILED' ? 502 : 500, { error: err.message });
        }
      })();
    }

    // KlikQRIS webhook callback. Marks order paid and issues a license.
    // SECURITY: the webhook body is NOT trusted for the PAID decision — we
    // re-verify the order status against KlikQRIS (source of truth) before
    // settling, so a forged {status:"PAID"} request cannot issue a license.
    if (req.method === 'POST' && url.pathname === '/api/payment/klikqris/webhook') {
      return readBody(req).then(async (body) => {
        const orderId = body?.order_id ?? body?.data?.order_id ?? null;
        const claimed = String(body?.status ?? body?.data?.status ?? '').toUpperCase();
        if (!orderId) return sendJson(res, 400, { error: 'order_id required' });

        // Ignore non-paid claims outright (accept SUCCESS/PAID/SETTLEMENT).
        if (!isPaidStatus(claimed)) {
          return sendJson(res, 200, { ok: true, ignored: claimed || 'unknown' });
        }

        // Verify against KlikQRIS before issuing anything.
        let verifiedStatus = null;
        try {
          const status = await klikqris.checkStatus(orderId);
          verifiedStatus = String(status.status || '').toUpperCase();
        } catch (err) {
          return sendJson(res, 502, { error: 'unable to verify payment status' });
        }
        // KlikQRIS reports a completed payment as SUCCESS (older payloads may say
        // PAID/SETTLEMENT) — treat all as paid, or real payments get dropped.
        if (!isPaidStatus(verifiedStatus)) {
          return sendJson(res, 200, { ok: true, ignored: `unverified:${verifiedStatus || 'unknown'}` });
        }

        const { order, license } = await payment.settlePaid(orderId);
        if (!order) return sendJson(res, 404, { error: 'order not found' });
        return sendJson(res, 200, { ok: true, licenseId: license?.id ?? null });
      });
    }

    return sendJson(res, 404, { error: 'not found' });
  });

  return {
    server, store, service, usage, keys, payment, accounts, klikqris,
    settings: () => resolveSettings(store.getSettings()),
    listen: () => new Promise((r) => server.listen(port, r)),
  };
}

function sanitizeLicense(l) {
  return {
    id: l.id,
    customer: l.customer,
    accountId: l.accountId ?? null,
    features: l.features,
    createdAt: l.createdAt,
    expiresAt: l.expiresAt,
    revokedAt: l.revokedAt,
    installCount: l.installIds?.length ?? 0,
    lastSeenAt: l.lastSeenAt,
  };
}

function sanitizeOrder(o) {
  return {
    id: o.id,
    accountId: o.accountId,
    packageKey: o.packageKey,
    planName: o.planName ?? null,
    quota: o.quota ?? null,
    amount: o.amount,
    status: o.status,
    createdAt: o.createdAt,
    paidAt: o.paidAt ?? null,
    expiredAt: o.expiredAt ?? null,
  };
}

function requireAdmin(req, adminToken) {
  if (!adminToken) return true; // dev: no auth
  const auth = req.headers.authorization ?? '';
  return auth === `Bearer ${adminToken}`;
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(body);
}

function sendHtml(res, status, html) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}

function renderDashboardHtml(service) {
  const stats = service.stats();
  const licenses = service.list().map(sanitizeLicense);
  const base = readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');
  return base
    .replace('__STATS_JSON__', JSON.stringify(stats))
    .replace('__LICENSES_JSON__', JSON.stringify(licenses));
}
