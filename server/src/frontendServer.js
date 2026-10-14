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
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json; charset=utf-8',
  '.jfif': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp4': 'video/mp4',
};

// Route map: path → html file
const PAGES = {
  '/': 'intro.html',
  '/copilot': 'landing.html',
  '/landing': 'landing.html',
  '/login': 'register.html',
  '/reset-password': 'reset-password.html',
  '/success': 'success.html',
  '/checkout/success': 'success.html',
};

// Security headers utk SEMUA response frontend (halaman statis, SPA, aset).
// API tetap lewat proxy backend (backend punya policy sendiri).
const SEC_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  // CSP: halaman butuh inline script (Aurora login) + Tailwind CDN (register/login)
  // + fonts + aset statis berikut yang MEMANG dipakai intro/landing:
  //   - cdn.jsdelivr.net  → three.module.js (intro 3D) + unicornStudio.umd.js (landing)
  //   - code.iconify.design → iconify-icon (55 ikon di landing)
  //   - api.iconify.design / api.simplesvg.com / api.unisvg.com → data ikon iconify
  //   - assets.unicorn.studio → scene unicorn.studio
  //   - static.cloudflareinsights.com → beacon Web Analytics yang disuntik edge
  //     Cloudflare ke SETIAP pageview (bukan kode kita); tanpa ini selalu ada
  //     CSP violation di console produksi.
  // Tanpa origin ini, intro TIDAK menyelesaikan boot() (loader tak pernah hilang =
  // "stuck") dan ikon landing tidak render. Daftar ini presisi (bukan wildcard).
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://code.iconify.design https://static.cloudflareinsights.com",
    // Sign-up password tooling spawns a Web Worker from a blob: URL; without an
    // explicit worker-src it falls back to script-src, which forbids blob: and
    // throws a CSP violation on every /app/sign-up render.
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.tailwindcss.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https:",
    "connect-src 'self' https://api.iconify.design https://api.simplesvg.com https://api.unisvg.com https://assets.unicorn.studio",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
};

export function createFrontendServer({ port = 4601, backendUrl = BACKEND_URL } = {}) {
  return createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);

    // Suntik security headers ke SEMUA response frontend (termasuk writeHead eksisting).
    const _origWriteHead = res.writeHead.bind(res);
    res.writeHead = (statusCode, headersOrReason, headersArg) => {
      let extra = { ...SEC_HEADERS };
      let args;
      if (typeof headersOrReason === 'string') {
        args = [statusCode, headersOrReason, { ...(headersArg || {}), ...extra }];
      } else if (headersOrReason && typeof headersOrReason === 'object') {
        // jangan timpa header yang sudah diset eksplisit pemanggil
        args = [statusCode, { ...headersOrReason, ...extra }];
      } else {
        args = [statusCode, extra];
      }
      return _origWriteHead(...args);
    };

    // Proxy all /api/* to backend
    if (url.pathname.startsWith('/api/')) {
      return proxyToBackend(req, res, `${backendUrl}${url.pathname}${url.search}`);
    }

    // E2E instance identity probe (TEST-ONLY). The isolated runner passes a
    // per-run nonce via E2E_INSTANCE_ID; this route echoes it back so the runner
    // can prove (a) THIS frontend process is the one it just spawned, and
    // (b) this frontend proxies to the SAME isolated backend (via /instanceId).
    // Absent in production: without NODE_ENV=test + the nonce it is a plain 404,
    // so no diagnostic surface leaks in prod.
    if (url.pathname === '/__e2e/id') {
      if (process.env.NODE_ENV !== 'test' || !process.env.E2E_INSTANCE_ID) {
        res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found');
      }
      let backendId = null;
      try {
        const r = await fetch(`${backendUrl}/api/health`, { signal: AbortSignal.timeout(3000) });
        const j = await r.json();
        backendId = j?.instanceId ?? null;
      } catch { /* backendId stays null → runner treats as mismatch */ }
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      return res.end(JSON.stringify({ instanceId: process.env.E2E_INSTANCE_ID, backendInstanceId: backendId }));
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
      const resolved = path.resolve(path.join(PUBLIC_DIR, url.pathname));
      const assetsRoot = path.resolve(PUBLIC_DIR);
      // Containment + must-be-a-FILE: a directory path (/assets/, /assets/sub/)
      // previously hit readFileSync on a dir → EISDIR thrown inside the async
      // handler → the request hung with no response. Now it 404s cleanly.
      if (!(resolved === assetsRoot || resolved.startsWith(assetsRoot + path.sep))) {
        res.writeHead(404); return res.end('not found');
      }
      let st = null;
      try { st = statSync(resolved); } catch { st = null; }
      if (!st || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
      const ext = path.extname(resolved).toLowerCase();
      const type = MIME[ext] || 'application/octet-stream';
      if (ext === '.mp4') {
        const size = st.size;
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
              return createReadStream(resolved, { start, end }).pipe(res);
            }
          }
          res.writeHead(416, { 'content-range': `bytes */${size}` });
          return res.end();
        }
        res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes' });
        return createReadStream(resolved).pipe(res);
      }
      try {
        res.writeHead(200, { 'content-type': type });
        return res.end(readFileSync(resolved));
      } catch {
        res.writeHead(404); return res.end('not found');
      }
    }

    // SPA: /login/sign-up memakai design shadcn sign-up (route SPA /login/sign-up)
    if (url.pathname === '/login/sign-up') {
      const spaIndex = path.join(PUBLIC_DIR, 'app', 'index.html');
      if (existsSync(spaIndex)) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
        return res.end(readFileSync(spaIndex));
      }
    }

    // SPA dashboard baru (Vite build di public/app, base '/app/')
    if (url.pathname.startsWith('/app/')) {
      const rel = url.pathname.slice('/app/'.length) || 'index.html';
      const file = path.join(PUBLIC_DIR, 'app', rel);
      const resolved = path.resolve(file);
      const root = path.resolve(path.join(PUBLIC_DIR, 'app'));
      if (!(resolved === root || resolved.startsWith(root + path.sep))) { res.writeHead(404); return res.end('not found'); }
      let st = null;
      try { st = statSync(resolved); } catch { st = null; }
      // Only serve regular files — a directory path must fall through to the SPA
      // fallback (or 404), never readFileSync on a dir (EISDIR → hung request).
      if (st && st.isFile()) {
        const ext = path.extname(resolved).toLowerCase();
        const type = MIME[ext] || 'application/octet-stream';
        res.writeHead(200, { 'content-type': type, 'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable' });
        try { return res.end(readFileSync(resolved)); } catch { res.writeHead(404); return res.end('not found'); }
      }
      // SPA fallback: /app/<route> tanpa ekstensi (mis. /app/sign-up) → app shell.
      if (!path.extname(rel.replace(/\/$/, ''))) {
        const spaIndex = path.join(PUBLIC_DIR, 'app', 'index.html');
        if (existsSync(spaIndex)) {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
          return res.end(readFileSync(spaIndex));
        }
      }
      res.writeHead(404); return res.end('not found');
    }

    const SPA_INDEX = () => {
      const f = path.join(PUBLIC_DIR, 'app', 'index.html');
      return existsSync(f) ? f : null;
    };

    // Legacy /register → halaman sign-up baru (hierarki: /login = signin, /login/sign-up = signup)
    if (req.method === 'GET' && (url.pathname === '/register' || url.pathname === '/register/')) {
      res.writeHead(302, { location: '/login/sign-up' });
      return res.end();
    }

    // Pages (exact map)
    if (req.method === 'GET' && PAGES[url.pathname]) {
      const page = PAGES[url.pathname];
      const file = path.join(PUBLIC_DIR, page);
      if (existsSync(file)) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
        return res.end(readFileSync(file, 'utf8'));
      }
    }

    // Real route prefixes: /user/* and /admin/* serve their app shell so the
    // dashboards can use real paths (/user/licenses) instead of hash anchors.
    if (req.method === 'GET' && (url.pathname === '/user' || url.pathname.startsWith('/user/'))) {
      const spa = SPA_INDEX();
      const file = spa || path.join(PUBLIC_DIR, 'user-dashboard.html');
      if (existsSync(file)) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
        return res.end(readFileSync(file, 'utf8'));
      }
    }
    if (req.method === 'GET' && (url.pathname === '/admin' || url.pathname === '/admin-gate' || url.pathname.startsWith('/admin/'))) {
      const spa = SPA_INDEX();
      const file = spa || path.join(PUBLIC_DIR, 'dashboard.html');
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
