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
import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs';
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
  '.jfif': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp4': 'video/mp4',
};

// Route map: path → html file
const PAGES = {
  '/': 'intro.html',
  '/landing': 'landing.html',
  '/register': 'register.html',
  '/login': 'register.html',
  '/user': 'user-dashboard.html',
  '/success': 'success.html',
  '/checkout/success': 'success.html',
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
    if (req.method === 'GET' && url.pathname === '/favicon.ico') {
      const file = path.join(PUBLIC_DIR, 'favicon.ico');
      if (existsSync(file)) {
        res.writeHead(200, { 'content-type': 'image/x-icon' });
        return res.end(readFileSync(file));
      }
    }
    if (url.pathname.startsWith('/assets/')) {
      const file = path.join(PUBLIC_DIR, url.pathname);
      if (existsSync(file)) {
        const ext = path.extname(file).toLowerCase();
        const type = MIME[ext] || 'application/octet-stream';
        if (ext === '.mp4') {
          const size = statSync(file).size;
          const range = req.headers.range;
          if (range) {
            const match = /^bytes=(\d*)-(\d*)$/.exec(range);
            if (match) {
              const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]) - 1);
              const end = match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
              if (start <= end && start < size) {
                res.writeHead(206, {
                  'content-type': type, 'content-length': end - start + 1,
                  'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes',
                });
                return createReadStream(file, { start, end }).pipe(res);
              }
            }
            res.writeHead(416, { 'content-range': `bytes */${size}` });
            return res.end();
          }
          res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes' });
          return createReadStream(file).pipe(res);
        }
        res.writeHead(200, { 'content-type': type });
        return res.end(readFileSync(file));
      }
      res.writeHead(404); return res.end('not found');
    }

    // Pages (exact map)
    if (req.method === 'GET' && PAGES[url.pathname]) {
      const page = url.pathname === '/' && url.searchParams.get('qa') === 'capabilities-v2'
        ? 'landing.html'
        : PAGES[url.pathname];
      const file = path.join(PUBLIC_DIR, page);
      if (existsSync(file)) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
        return res.end(readFileSync(file, 'utf8'));
      }
    }

    // Real route prefixes: /user/* and /admin/* serve their app shell so the
    // dashboards can use real paths (/user/licenses) instead of hash anchors.
    if (req.method === 'GET' && (url.pathname === '/user' || url.pathname.startsWith('/user/'))) {
      const file = path.join(PUBLIC_DIR, 'user-dashboard.html');
      if (existsSync(file)) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
        return res.end(readFileSync(file, 'utf8'));
      }
    }
    if (req.method === 'GET' && (url.pathname === '/admin' || url.pathname.startsWith('/admin/'))) {
      const file = path.join(PUBLIC_DIR, 'dashboard.html');
      if (existsSync(file)) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
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
