/**
 * gRouter Copilot — FRONTEND server.
 *
 * Serves the static HTML pages (landing, register, user dashboard, admin)
 * on its OWN port (4601 → domain copilot.grouter.id).
 *
 * Proxies /api/* to the BACKEND server (port 4600 → be.grouter.id).
 * This keeps frontend and backend on separate origins as requested.
 *
 * Independent from gRouter (port 20128). Do not touch that process.
 */

import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:4600';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// Route map: path → html file
const PAGES = {
  '/': 'landing.html',
  '/landing': 'landing.html',
  '/register': 'register.html',
  '/login': 'register.html',
  '/user': 'user-dashboard.html',
  '/admin': 'dashboard.html',
};

export function createFrontendServer({ port = 4601, backendUrl = BACKEND_URL } = {}) {
  return createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);

    // Proxy all /api/* to backend
    if (url.pathname.startsWith('/api/')) {
      return proxyToBackend(req, res, `${backendUrl}${url.pathname}${url.search}`);
    }

    // Static assets
    if (url.pathname.startsWith('/assets/')) {
      const file = path.join(PUBLIC_DIR, url.pathname);
      if (existsSync(file)) {
        const ext = path.extname(file).toLowerCase();
        res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
        return res.end(readFileSync(file));
      }
      res.writeHead(404); return res.end('not found');
    }

    // Pages
    if (req.method === 'GET' && PAGES[url.pathname]) {
      const file = path.join(PUBLIC_DIR, PAGES[url.pathname]);
      if (existsSync(file)) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return res.end(readFileSync(file, 'utf8'));
      }
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });
}

function proxyToBackend(req, res, target) {
  const t = new URL(target);
  const isHttps = t.protocol === 'https:';
  const http = isHttps ? httpsRequest : httpRequest;

  const options = {
    hostname: t.hostname,
    port: t.port || (isHttps ? 443 : 80),
    path: t.pathname + t.search,
    method: req.method,
    headers: { ...req.headers, host: t.host },
  };

  const upstream = http(options, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
    upstreamRes.pipe(res);
  });

  upstream.on('error', () => {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'backend unavailable' }));
  });

  req.pipe(upstream);
}
