/**
 * gRouter Copilot — license server + admin dashboard.
 * Zero-dependency Node http server (no external packages, no npm install).
 *
 * Endpoints:
 *   GET  /api/stats          → aggregate stats
 *   GET  /api/licenses       → list licenses (no raw tokens)
 *   POST /api/licenses       → issue license { customer, features?, expiresInDays? }
 *   POST /api/licenses/:id/revoke → revoke
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
import { generateKeyPair } from '../../src/license/validate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createCopilotServer({
  port = 4600,
  dataFile = path.join(__dirname, '..', 'data', 'store.json'),
  privateKeyPem = null,
  publicKeyPem = null,
  adminToken = process.env.ADMIN_TOKEN || null,
} = {}) {
  // Generate a keypair if not provided (ephemeral for local dev; production must persist).
  let keys = { privateKeyPem, publicKeyPem };
  if (!keys.privateKeyPem || !keys.publicKeyPem) {
    keys = generateKeyPair();
  }

  const store = new JsonStore(dataFile);
  const service = new LicenseService({ store, privateKeyPem: keys.privateKeyPem });

  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    const route = `${req.method} ${url.pathname}`;

    if (req.method === 'GET' && url.pathname === '/') {
      return sendHtml(res, 200, renderDashboardHtml(service));
    }

    if (req.method === 'GET' && url.pathname === '/api/stats') {
      return sendJson(res, 200, service.stats());
    }

    if (req.method === 'GET' && url.pathname === '/api/licenses') {
      const list = service.list().map(sanitizeLicense);
      return sendJson(res, 200, { licenses: list });
    }

    if (req.method === 'POST' && url.pathname === '/api/licenses') {
      if (!requireAdmin(req, adminToken)) return sendJson(res, 401, { error: 'unauthorized' });
      return readBody(req).then((body) => {
        const { record, token } = service.issue({
          customer: body.customer,
          features: body.features,
          expiresInDays: body.expiresInDays,
        });
        return sendJson(res, 201, { license: sanitizeLicense(record), token });
      });
    }

    if (req.method === 'POST' && /^\/api\/licenses\/([^/]+)\/revoke$/.test(url.pathname)) {
      if (!requireAdmin(req, adminToken)) return sendJson(res, 401, { error: 'unauthorized' });
      const id = url.pathname.split('/')[3];
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

    return sendJson(res, 404, { error: 'not found' });
  });

  return { server, store, service, keys, listen: () => new Promise((r) => server.listen(port, r)) };
}

function sanitizeLicense(l) {
  return {
    id: l.id,
    customer: l.customer,
    features: l.features,
    createdAt: l.createdAt,
    expiresAt: l.expiresAt,
    revokedAt: l.revokedAt,
    installCount: l.installIds?.length ?? 0,
    lastSeenAt: l.lastSeenAt,
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
