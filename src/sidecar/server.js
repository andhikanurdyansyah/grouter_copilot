// gRouter Copilot sidecar — framework-agnostic standalone server (D-021 gateway mode).
// One process serves /api/copilot/chat, /api/copilot/health, and a prebuilt
// embed widget (copilot.js + copilot.css) so ANY stack (Java, PHP, Python, Go,
// Rails, or plain HTML) integrates with a single <script> tag — zero host code.
// The gRouter service credential never lives here: chat POSTs to the Copilot
// backend gateway with a license token; the gateway forwards to the supplier.
import { createServer } from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WIDGET_SRC = path.join(__dirname, '..', 'widget');
const WIDGET_DIST = path.join(__dirname, '..', '..', 'dist-widget');

const MAX_BODY_BYTES = 64 * 1024; // chat requests are tiny; reject oversized bodies early
const DEFAULT_PORT = Number(process.env.GROUTER_SIDECAR_PORT || 4700);

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function cors(res, origin) {
  // The widget is served same-origin by the sidecar itself; CORS stays closed
  // unless the host explicitly allowlists its app origin. No wildcard ever:
  // chat consumes quota, and open CORS lets any site spend someone's license.
  if (origin && process.env.GROUTER_SIDECAR_ALLOWED_ORIGIN === origin) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'origin');
    res.setHeader('access-control-allow-headers', 'content-type');
  }
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    return undefined; // malformed JSON → 400, not 500
  }
}

/**
 * Create the sidecar request handler. Exported for node:test with an injected
 * copilot (no license needed in tests via a stubbed runtime+adapter).
 */
export function createSidecarHandler({ copilot, gatewayUrl, fetchImpl = globalThis.fetch } = {}) {
  const widgetCache = new Map();
  async function widget(name, type) {
    if (!widgetCache.has(name)) {
      // Prebuilt, dependency-free embed (vanilla JS + CSS) lives in dist-widget;
      // source of truth in src/widget/embed/.
      const base = process.env.GROUTER_SIDECAR_WIDGET_DIR || WIDGET_DIST;
      const buf = await readFile(path.join(base, name));
      widgetCache.set(name, buf);
    }
    return widgetCache.get(name);
  }

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const route = url.pathname.replace(/\/+$/, '') || '/';
    cors(res, req.headers.origin);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    // --- chat --------------------------------------------------------
    if (req.method === 'POST' && route === '/api/copilot/chat') {
      const body = await readBody(req);
      if (body === null) return json(res, 413, { status: 'error', code: 'INVALID_REQUEST', message: 'Request body too large.' });
      if (body === undefined) return json(res, 400, { status: 'error', code: 'INVALID_REQUEST', message: 'Malformed JSON body.' });
      const { message, history, userId, token, skillHint } = body ?? {};
      if (!message || typeof message !== 'string') {
        return json(res, 400, { status: 'error', code: 'INVALID_REQUEST', message: 'message is required.' });
      }
      let result;
      try {
        const { gatewayChat } = await import('../index.js');
        result = await gatewayChat({
          runtime: copilot.runtime,
          gatewayUrl,
          fetchImpl,
          message,
          history: Array.isArray(history) ? history : [],
          userId,
          token,
          skillHint,
        });
      } catch (err) {
        // Never crash the sidecar; keep real error codes (NOT_CONFIGURED → 500,
        // INVALID_REQUEST → 400, upstream failures → 502) — see #11/#12 lessons.
        result = {
          status: 'error',
          code: err?.code || 'UPSTREAM_UNAVAILABLE',
          message: err?.message || 'Unable to reach the Copilot gateway.',
          retryable: err?.retryable ?? true,
        };
      }
      const status = result.status === 'error'
        ? (result.code === 'INVALID_REQUEST' ? 400 : result.code === 'NOT_CONFIGURED' ? 500 : 502)
        : 200;
      return json(res, status, result);
    }

    // --- health ------------------------------------------------------
    if (req.method === 'GET' && route === '/api/copilot/health') {
      try {
        const { getCopilotHealth } = await import('../index.js');
        const health = getCopilotHealth(copilot, process.env.GROUTER_LICENSE, { gatewayUrl });
        return json(res, health.status === 'ok' ? 200 : 503, health);
      } catch {
        return json(res, 503, { status: 'unavailable' });
      }
    }

    // --- embed widget (any stack, one tag) ----------------------------
    if (req.method === 'GET' && (route === '/copilot.js' || route === '/copilot.css')) {
      try {
        const name = route === '/copilot.js' ? 'copilot.js' : 'copilot.css';
        const buf = await widget(name);
        res.writeHead(200, {
          'content-type': route.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8',
          'cache-control': 'public, max-age=300',
          'access-control-allow-origin': '*', // static assets only, no credentials
        });
        return res.end(buf);
      } catch {
        return json(res, 404, { status: 'error', code: 'NOT_FOUND', message: 'widget bundle missing' });
      }
    }

    // --- snippet page (copy-paste for the host app) -------------------
    if (req.method === 'GET' && (route === '/' || route === '/snippet')) {
      if (route === '/snippet') {
        return json(res, 200, {
          tag: `<link rel="stylesheet" href="${process.env.GROUTER_SIDECAR_PUBLIC_URL || ''}/copilot.css">`,
          script: `<script src="${process.env.GROUTER_SIDECAR_PUBLIC_URL || ''}/copilot.js"></script>`,
        });
      }
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('gRouter Copilot sidecar is running.\n\nGET  /api/copilot/health\nPOST /api/copilot/chat\nGET  /copilot.js | /copilot.css\n');
    }

    return json(res, 404, { status: 'error', code: 'NOT_FOUND', message: `No route: ${req.method} ${route}` });
  };
}

/** Start the sidecar. Returns the http.Server (for tests) — resolve on listening. */
export async function startSidecar({ port = DEFAULT_PORT, host = process.env.GROUTER_SIDECAR_HOST || '127.0.0.1', handler, copilot, gatewayUrl, fetchImpl } = {}) {
  const h = handler ?? (copilot ? createSidecarHandler({ copilot, gatewayUrl, fetchImpl }) : await defaultHandler({ configPath: undefined, gatewayUrl }));
  return new Promise((resolve, reject) => {
    const server = createServer(h);
    server.once('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}

/** Build the real handler from env/copilot.config.cjs (used by `serve`). */
export async function defaultHandler({ configPath, gatewayUrl } = {}) {
  const { createCopilot } = await import('../index.js');
  const resolved = configPath ?? path.join(process.cwd(), 'copilot.config.cjs');
  const copilot = await createCopilot({ configPath: resolved });
  return createSidecarHandler({ copilot, gatewayUrl: gatewayUrl ?? process.env.GROUTER_GATEWAY_URL });
}
