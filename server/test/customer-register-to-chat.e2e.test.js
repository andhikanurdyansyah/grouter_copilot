/**
 * E2E — customer register → purchase → verified payment → license → install → chat.
 *
 * Proves, on ONE isolated server instance, the whole D-013 customer path with
 * zero network and zero production changes:
 *
 *   sign-up (Better Auth, temp auth DB) → GET /api/plans → checkout
 *   (POST /api/orders, price resolved server-side — cost integrity D-020)
 *   → KlikQRIS webhook forgery ignored (upstream still PENDING)
 *   → webhook settles after upstream re-verification reports SUCCESS
 *   → license issued to the account with the PLAN entitlement (A3)
 *   → operator binds the supplier key (D-016 manual binding)
 *   → CLI install (real bin/grouter-copilot.js over real HTTP /api/resolve)
 *     writes server-side app credentials, printing neither key nor token
 *   → heartbeat records the install
 *   → host-app createCopilot() + runtime.chat() completes on the issued
 *     license via FakeSupplier (no real supplier call)
 *
 * Isolation: temp auth DB (copied from the prod-schema auth.sqlite, all rows
 * cleared), temp store.json, faked KlikQRIS fetch, ephemeral port, FakeSupplier
 * for the chat leg. Nothing leaves the machine.
 *
 * SEAM RATIONALE (token capture): the raw license token is deliberately never
 * persisted (licenseService.js — "returned to the operator ONCE at issue time;
 * not persisted") and settlePaid() mints it internally, so no HTTP surface
 * returns it. Rather than inventing a production endpoint, this test wraps
 * payment.licenseService.issue on the instance returned by createCopilotServer
 * — a test-only interception that restores the original in `finally`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { mkdtempSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// KlikQRIS must be "configured" to reach the (faked) fetch path.
process.env.KLIKQRIS_API_KEY ||= 'test-key';
process.env.KLIKQRIS_MERCHANT_ID ||= 'test-merchant';

// auth.js reads env ONCE at import time → point it at ONE shared temp auth DB
// for this whole test file, prepared BEFORE the first server.js import. A
// fresh/empty auth.sqlite crashes Better Auth (SchemaMismatchError), so start
// from a copy of the prod-schema DB with all rows cleared.
const sharedDir = mkdtempSync(path.join(tmpdir(), 'copilot-e2e-auth-'));
process.env.AUTH_DB_FILE = path.join(sharedDir, 'auth.sqlite');
copyFileSync(path.join(__dirname, '..', 'data', 'auth.sqlite'), process.env.AUTH_DB_FILE);

async function clearAuthDb(file) {
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(file);
  db.pragma('foreign_keys = OFF');
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  for (const { name } of tables) db.prepare(`DELETE FROM "${name}"`).run();
  db.close();
}
await clearAuthDb(process.env.AUTH_DB_FILE);

/**
 * Fake KlikQRIS upstream: createQris succeeds and echoes the requested amount;
 * /qris/status reports a controllable status (PENDING until the test flips it
 * to SUCCESS — mimicking the customer actually paying). Nothing hits the net.
 */
function makeFakeKlikqris() {
  const createCalls = [];
  let upstreamStatus = 'PENDING';
  const fakeFetch = async (url, init) => {
    const u = String(url);
    if (u.endsWith('/qris/create')) {
      const body = JSON.parse(init?.body || '{}');
      createCalls.push({ orderId: body.order_id, amount: body.amount });
      return new Response(
        JSON.stringify({
          status: true,
          data: {
            order_id: body.order_id ?? 'ord_x',
            amount: String(body.amount ?? 0),
            total_amount: String(Number(body.amount ?? 0) + 825),
            status: 'PENDING',
            qris_url: 'https://sandbox.qris.example/qr.png',
            qris_image: 'data:image/png;base64,iVBORw0KGgo=',
            expired_at: '2026-12-31 23:59:59',
            signature: 'SANDBOX_SIG',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (u.includes('/qris/status/')) {
      const orderId = decodeURIComponent(u.split('/qris/status/')[1] || '');
      return new Response(
        JSON.stringify({
          status: true,
          data: {
            order_id: orderId,
            status: upstreamStatus,
            paid_at: upstreamStatus === 'PENDING' ? null : '2026-10-07 00:00:00',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response(
      JSON.stringify({ error: 'unexpected upstream call' }),
      { status: 404, headers: { 'content-type': 'application/json' } },
    );
  };
  return { fakeFetch, createCalls, setUpstream: (s) => { upstreamStatus = s; } };
}

async function req(baseUrl, method, p, body, cookie, auth) {
  const res = await fetch(`${baseUrl}${p}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...(auth ? { authorization: 'Bearer e2e-admin-token-local' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

test('E2E: register → purchase → verified payment → license → install → chat', async () => {
  const adminToken = 'e2e-admin-token-local';
  const { createCopilotServer } = await import('../src/server.js');
  const storeDir = mkdtempSync(path.join(tmpdir(), 'copilot-e2e-store-'));
  const dataFile = path.join(storeDir, 'store.json');
  const { fakeFetch, createCalls, setUpstream } = makeFakeKlikqris();
  const { server, payment } = createCopilotServer({ dataFile, fetch: fakeFetch, adminToken });
  await new Promise((r) => server.listen(0, r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  // Test-only seam: capture the raw token settlePaid() mints internally.
  // The token is never persisted and no HTTP surface returns it by design.
  const originalIssue = payment.licenseService.issue.bind(payment.licenseService);
  let issued = null;
  payment.licenseService.issue = (...args) => {
    const r = originalIssue(...args);
    issued = r;
    return r;
  };

  let projectDir = null;
  const previousLicense = process.env.GROUTER_LICENSE;
  const previousPublicKey = process.env.GROUTER_LICENSE_PUBLIC_KEY;
  try {
    // Admin auth fails closed: settings PATCH without the token → 401.
    const unauth = await req(baseUrl, 'PATCH', '/api/admin/settings', { plans: [] });
    assert.equal(unauth.status, 401);

    // Configure a priced plan catalogue (operator action, authenticated).
    const patch = await req(baseUrl, 'PATCH', '/api/admin/settings', {
      plans: [
        {
          key: 'starter', name: 'Starter', amount: 99000, currency: 'IDR',
          quota: '5M tokens', features: ['core'], expiresInDays: 365, active: true,
        },
      ],
    }, null, true);
    assert.equal(patch.status, 200, `settings patch failed: ${JSON.stringify(patch.json)}`);

    // The public catalogue the customer UI buys from carries the real price.
    const plans = await req(baseUrl, 'GET', '/api/plans');
    assert.equal(plans.status, 200);
    const starter = (plans.json.plans || []).find((p) => p.key === 'starter');
    assert.ok(starter, 'starter plan must be public');
    assert.equal(starter.amount, 99000);

    // Customer registers (email/password, same call the register page makes).
    const email = `e2e-${Date.now()}@gmail.com`;
    const signUpRes = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:4601' },
      body: JSON.stringify({ email, password: `Gr0ut3r-${Math.random().toString(36).slice(2)}!Zq`, name: 'E2E Customer' }),
    });
    const signUpBody = await signUpRes.json().catch(() => ({}));
    assert.equal(signUpRes.status, 200, `sign-up failed: ${JSON.stringify(signUpBody)}`);
    const cookie = signUpRes.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    assert.ok(cookie, 'session cookie must be set');

    // Fresh account: no licenses yet.
    const me0 = await req(baseUrl, 'GET', '/api/me', null, cookie);
    assert.equal(me0.status, 200);
    assert.deepEqual(me0.json.licenses, []);

    // Cost integrity: a client-supplied amount must never be honoured (D-020).
    const cheat = await req(baseUrl, 'POST', '/api/orders', { packageKey: 'starter', amount: 1 }, cookie);
    assert.equal(cheat.status, 400);
    assert.match(String(cheat.json.error), /server-side/i);

    // Legit checkout: the order carries the server-resolved plan price.
    const order = await req(baseUrl, 'POST', '/api/orders', { packageKey: 'starter' }, cookie);
    assert.equal(order.status, 201, `checkout failed: ${JSON.stringify(order.json)}`);
    assert.equal(order.json.order.amount, 99000);
    assert.equal(order.json.order.planName, 'Starter');
    assert.equal(order.json.order.quota, '5M tokens');
    assert.equal(order.json.order.status, 'PENDING');
    assert.equal(order.json.order.packageKey, 'starter');
    assert.ok(order.json.qr.qrUrl, 'QR url must be present');
    assert.equal(createCalls.length, 1);
    assert.equal(createCalls[0].amount, 99000, 'KlikQRIS must be asked for the server-resolved price');
    const orderId = order.json.order.id;

    // Webhook forgery guard: a claimed PAID is ignored while upstream says PENDING.
    const forged = await req(baseUrl, 'POST', '/api/payment/klikqris/webhook', { order_id: orderId, status: 'PAID' });
    assert.equal(forged.status, 200);
    assert.equal(forged.json.ok, true);
    assert.match(String(forged.json.ignored), /unverified/i);
    const meForge = await req(baseUrl, 'GET', '/api/me', null, cookie);
    assert.deepEqual(meForge.json.licenses, [], 'a forged paid claim must issue nothing');

    // Customer pays upstream → KlikQRIS (source of truth) now reports SUCCESS.
    setUpstream('SUCCESS');
    const settle = await req(baseUrl, 'POST', '/api/payment/klikqris/webhook', { order_id: orderId, status: 'SUCCESS' });
    assert.equal(settle.status, 200, `settle failed: ${JSON.stringify(settle.json)}`);
    assert.equal(settle.json.ok, true);
    assert.ok(settle.json.licenseId, 'verified payment must issue a license');

    // The seam captured the minted token + record (never exposed over HTTP).
    assert.ok(issued, 'issue() must have been called by settlePaid');
    assert.ok(typeof issued.token === 'string' && issued.token.length > 0);
    assert.equal(issued.record.id, settle.json.licenseId);
    assert.deepEqual(issued.record.features, ['core'], 'entitlement comes from the plan (A3)');

    // The license is owned by the registered account with the plan entitlement.
    const me = await req(baseUrl, 'GET', '/api/me', null, cookie);
    assert.equal(me.status, 200);
    assert.equal(me.json.licenses.length, 1);
    const lic = me.json.licenses[0];
    assert.equal(lic.id, issued.record.id);
    assert.equal(lic.customer, 'Starter');
    assert.deepEqual(lic.features, ['core']);
    assert.equal(lic.installCount, 0);
    const expectedExp = Date.now() + 365 * 24 * 3600 * 1000;
    assert.ok(Math.abs(lic.expiresAt - expectedExp) < 5000, `expiresAt ~ +365d (got ${lic.expiresAt})`);

    // /success page data: latest order is PAID and carries the license.
    const latest = await req(baseUrl, 'GET', '/api/orders/latest', null, cookie);
    assert.equal(latest.status, 200);
    assert.equal(latest.json.order.status, 'PAID');
    assert.equal(latest.json.license?.id, issued.record.id);
    assert.equal(latest.json.license?.token, issued.token, 'authenticated purchaser must receive the license key for install');

    // The admin license list must never leak the raw token or the api key.
    const rawMe = JSON.stringify(me.json);
    assert.ok(!rawMe.includes(issued.token), 'me response must not contain the raw license token');
    const list = await req(baseUrl, 'GET', '/api/admin/licenses', null, null, true);
    assert.equal(list.status, 200);

    // Operator binds the supplier key (D-016: manual binding until auto-provisioning).
    const supplierKey = 'gRouter-e2e-supplier-000123';
    const bind = await req(baseUrl, 'POST', `/api/admin/licenses/${issued.record.id}/bind`, { grouterApiKey: supplierKey }, null, true);
    assert.equal(bind.status, 200, `bind failed: ${JSON.stringify(bind.json)}`);
    assert.equal(bind.json.bound, true);
    assert.equal(bind.json.license.grouterApiKey, undefined, 'bind response must not echo the key');
    const rawList = JSON.stringify(list.json) + JSON.stringify(bind.json);
    assert.ok(!rawList.includes(supplierKey), 'admin projections must not contain the api key');

    // CLI install: the real installer exchanges the license via /api/resolve
    // and writes server-side app credentials (never printed).
    const root = path.resolve(__dirname, '..', '..');
    projectDir = mkdtempSync(path.join(tmpdir(), 'copilot-e2e-app-'));
    // Async spawn (not spawnSync): the license server runs in THIS process, so
    // a synchronous wait would block the event loop and the child's
    // /api/resolve call could never be answered (deadlock until timeout).
    const run = await new Promise((resolve) => {
      const child = spawn(process.execPath, [
        path.join(root, 'bin', 'grouter-copilot.js'),
        'install', '--license', issued.token, '--license-server', baseUrl,
      ], { cwd: projectDir });
      let out = '';
      const timer = setTimeout(() => child.kill(), 15_000);
      child.stdout.on('data', (c) => { out += c; });
      child.stderr.on('data', (c) => { out += c; });
      child.on('close', (code) => { clearTimeout(timer); resolve({ status: code, output: out }); });
    });
    assert.equal(run.status, 0, `install failed: ${run.output}`);
    const envText = readFileSync(path.join(projectDir, '.env'), 'utf8');
    const env = {};
    for (const line of envText.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#') || !t.includes('=')) continue;
      const i = t.indexOf('=');
      env[t.slice(0, i)] = t.slice(i + 1);
    }
    assert.equal(env.GROUTER_LICENSE, issued.token);
    assert.equal(env.GROUTER_API_KEY, supplierKey);
    assert.equal(env.GROUTER_BASE_URL, 'https://prod.grouter.web.id');
    assert.equal(env.GROUTER_LICENSE_SERVER, baseUrl);
    assert.ok(env.GROUTER_LICENSE_PUBLIC_KEY && env.GROUTER_LICENSE_PUBLIC_KEY.includes('BEGIN PUBLIC KEY'), 'public verifier key must be written');
    assert.ok(!(run.output).includes(supplierKey), 'installer must not print the supplier key');
    assert.ok(!(run.output).includes(issued.token), 'installer must not print the license token');

    // Heartbeat (online leg of the hybrid model): install is counted.
    const hb = await req(baseUrl, 'POST', '/api/heartbeat', { token: issued.token, installId: 'e2e-install-1', baseUrl: 'https://hostapp.invalid' });
    assert.equal(hb.status, 200);
    assert.equal(hb.json.ok, true);
    const stats = await req(baseUrl, 'GET', '/api/admin/stats', null, null, true);
    assert.equal(stats.status, 200);
    assert.ok(stats.json.totalInstalls >= 1, 'heartbeat must record the install');
    const me2 = await req(baseUrl, 'GET', '/api/me', null, cookie);
    assert.equal(me2.json.licenses[0].installCount, 1);

    // Host-app chat on the issued license: config + adapter exactly as the
    // installer scaffolded them, FakeSupplier standing in for the real
    // supplier (zero external calls; adapter contract unchanged).
    writeFileSync(path.join(projectDir, 'copilot.config.mjs'), `export default {
  model: 'grouter-default',
  systemPrompt: 'Answer only from the data provided.',
  skills: [
    {
      name: 'sales-summary',
      description: 'Summarize sales',
      parameters: { type: 'object', properties: {}, required: [] },
      readOnly: true,
      async run() { return { total: 42 }; }
    }
  ],
  limits: { maxRows: 500, maxContextBytes: 32000, maxTokens: 2000 }
};
`, 'utf8');
    process.env.GROUTER_LICENSE = issued.token;
    process.env.GROUTER_LICENSE_PUBLIC_KEY = env.GROUTER_LICENSE_PUBLIC_KEY.replace(/\\n/g, '\n');
    const plugin = await import(pathToFileURL(path.join(root, 'src', 'index.js')).href);
    const supplier = new plugin.FakeSupplier();
    let supplierReq = null;
    const fetchImpl = async (url, init) => {
      supplierReq = { url: String(url), auth: init?.headers?.authorization };
      return supplier.fetch(url, init);
    };
    const adapter = new plugin.GrouterAdapter({ apiKey: env.GROUTER_API_KEY, baseUrl: env.GROUTER_BASE_URL, fetchImpl });
    const { runtime } = await plugin.createCopilot({
      configPath: path.join(projectDir, 'copilot.config.mjs'),
      adapter,
    });
    const result = await runtime.chat({ message: 'summarize sales' });
    assert.equal(result.status, 'complete');
    assert.ok(String(result.answer).includes('42'));
    assert.equal(result.skill, 'sales-summary');
    assert.equal(supplierReq.url, 'https://prod.grouter.web.id/v1/chat/completions');
    assert.equal(supplierReq.auth, `Bearer ${supplierKey}`);
    assert.ok(!String(result.answer).includes(supplierKey), 'answer must not echo the supplier key');
  } finally {
    payment.licenseService.issue = originalIssue;
    server.close();
    if (projectDir) rmSync(projectDir, { recursive: true, force: true });
    rmSync(storeDir, { recursive: true, force: true });
    // The chat leg seeds the plugin's env defaults; restore them (factory
    // tests treat these as global state — never leak across test files).
    if (previousLicense === undefined) delete process.env.GROUTER_LICENSE;
    else process.env.GROUTER_LICENSE = previousLicense;
    if (previousPublicKey === undefined) delete process.env.GROUTER_LICENSE_PUBLIC_KEY;
    else process.env.GROUTER_LICENSE_PUBLIC_KEY = previousPublicKey;
  }
});
