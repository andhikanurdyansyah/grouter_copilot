#!/usr/bin/env node
/** Real sandbox journey; no work or network on import. Run from server/. */
import { randomBytes } from 'node:crypto';
import { copyFileSync, mkdtempSync, chmodSync, readFileSync, writeFileSync, rmSync, openSync, closeSync, lstatSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://klikqris.com/api/sandbox';
const SIM = 'https://klikqris.com/public/sandbox/simulate';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PLAN = { key: 'sandbox-journey', name: 'Sandbox Journey', currency: 'IDR', quota: 'sandbox-only', features: ['core', 'sandbox-journey'], expiresInDays: 30, active: true };
const keys = new Set(['version', 'mode', 'orderId', 'amount', 'plan', 'createdAt', 'status', 'boundary', 'licenseId']);
const boundaries = new Set(['dry_run', 'create_attempted', 'created', 'adopted', 'status_checked', 'simulator_unavailable', 'simulator_token_missing', 'simulator_login', 'simulator_form_invalid', 'simulator_signature_missing', 'simulator_timeout', 'simulator_failed', 'poll_timeout', 'upstream_terminal', 'upstream_paid', 'webhook_failed', 'verification_failed', 'complete', 'request_failed', 'invalid_upstream']);
const orderPattern = /^ord_[a-zA-Z0-9_-]{1,100}$/;
const artifactPlan = (p) => ({ key: p.key, name: p.name, features: p.features, quota: p.quota, expiresInDays: p.expiresInDays });
const safeErrorCode = (err) => {
  const text = String(err?.message || err || '').toUpperCase();
  if (/SIGNUP|AUTH|BETTER.AUTH|SENTINEL|DASH|ORIGIN|CSRF|COOKIE/.test(text)) return 'AUTH_SIGNUP_FAILED';
  if (/SQLITE|DATABASE|SCHEMA|SQL/.test(text)) return 'AUTH_DATABASE_FAILED';
  if (/TRANSACTION.*NOT.*FOUND|ORDER.*NOT.*FOUND|NOT_FOUND/.test(text)) return 'SANDBOX_TRANSACTION_NOT_FOUND';
  if (/TIMEOUT|FETCH|SOCKET|NETWORK|TLS|DNS/.test(text)) return 'EXTERNAL_NETWORK_FAILED';
  if (/SIMULATOR/.test(text)) return 'SIMULATOR_FAILED';
  return 'JOURNEY_FAILED';
};

export function parseArgs(argv) {
  const out = { dryRun: false, amount: 10000, requestTimeoutMs: 15000, pollTimeoutMs: 60000, pollIntervalMs: 3000, simulate: true };
  const values = { '--order-id': 'orderId', '--reuse': 'reuse', '--artifact': 'artifact', '--amount': 'amount', '--request-timeout-ms': 'requestTimeoutMs', '--poll-timeout-ms': 'pollTimeoutMs', '--poll-interval-ms': 'pollIntervalMs' };
  const flags = { '--dry-run': 'dryRun', '--no-simulate': 'simulate' };
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (seen.has(arg)) throw new Error('INVALID_ARGS');
    seen.add(arg);
    if (arg in flags) { out[flags[arg]] = arg === '--dry-run'; continue; }
    if (!(arg in values) || i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new Error('INVALID_ARGS');
    const v = argv[++i];
    if (['amount', 'requestTimeoutMs', 'pollTimeoutMs', 'pollIntervalMs'].includes(values[arg])) {
      if (!/^[1-9][0-9]*$/.test(v) || !Number.isSafeInteger(Number(v))) throw new Error('INVALID_ARGS');
      out[values[arg]] = Number(v);
    } else if (!v || v.startsWith('-')) throw new Error('INVALID_ARGS');
    else out[values[arg]] = v;
  }
  if (out.reuse && (out.orderId || seen.has('--amount'))) throw new Error('INVALID_ARGS');
  if (out.orderId && !orderPattern.test(out.orderId)) throw new Error('INVALID_ARGS');
  if (out.reuse && out.artifact && path.resolve(out.reuse) === path.resolve(out.artifact)) throw new Error('INVALID_ARGS');
  return out;
}

export function safeArtifact(input) {
  const p = input.plan || {};
  const clean = { version: 1, mode: 'sandbox', orderId: input.orderId ?? null, amount: input.amount, plan: artifactPlan(p), createdAt: input.createdAt, status: input.status, boundary: input.boundary, licenseId: input.licenseId ?? null };
  if (input.version !== 1 || input.mode !== 'sandbox' || !boundaries.has(clean.boundary) ||
      (clean.orderId !== null && !orderPattern.test(clean.orderId)) ||
      !Number.isSafeInteger(clean.amount) || clean.amount <= 0 ||
      !Number.isSafeInteger(clean.createdAt) || clean.createdAt <= 0 ||
      p.key !== PLAN.key || p.name !== PLAN.name ||
      !Array.isArray(p.features) || p.features.length > 20 || p.features.some((x) => !/^[a-zA-Z0-9_-]{1,60}$/.test(x)) ||
      typeof p.quota !== 'string' || p.quota.length > 100 || !Number.isSafeInteger(p.expiresInDays) || p.expiresInDays < 1 ||
      !/^[A-Z_]{1,30}$/.test(clean.status || '') ||
      (clean.licenseId !== null && !/^[a-zA-Z0-9_-]{1,100}$/.test(clean.licenseId))) throw new Error('INVALID_ARTIFACT');
  return clean;
}

function writeArtifact(file, data) {
  if (!file) return;
  // Never follow a symlink or overwrite an existing artifact; one attempt per path.
  const fd = openSync(file, 'wx', 0o600);
  try { writeFileSync(fd, JSON.stringify(safeArtifact(data)) + '\n'); } finally { closeSync(fd); }
}

function updateArtifact(file, data) {
  if (!file) return;
  if (!lstatSync(file).isFile()) throw new Error('INVALID_ARTIFACT');
  const temp = `${file}.${randomBytes(8).toString('hex')}.tmp`;
  writeArtifact(temp, data);
  renameSync(temp, file);
}

export function validateStatus(result, orderId, amount) {
  const raw = result?.raw;
  if (!raw || raw.order_id !== orderId || result.orderId !== orderId) throw new Error('INVALID_UPSTREAM');
  const upstreamAmount = raw.amount == null || raw.amount === '' ? null : Number(raw.amount);
  // Some real status responses omit amount. In that case retain the amount from
  // the safe artifact or this runner's create response; if present, verify it.
  if (upstreamAmount !== null && (!Number.isSafeInteger(upstreamAmount) || upstreamAmount <= 0 || upstreamAmount !== amount)) throw new Error('INVALID_UPSTREAM');
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('INVALID_UPSTREAM');
  return String(result.status || 'UNKNOWN').toUpperCase();
}

export async function pollStatus(client, id, amount, { timeoutMs, intervalMs, now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const deadline = now() + timeoutMs;
  do {
    const result = await client.checkStatus(id);
    const status = validateStatus(result, id, amount);
    if (['SUCCESS', 'PAID', 'SETTLEMENT', 'EXPIRED', 'FAILED', 'CANCELLED'].includes(status)) return { status, result };
    const remaining = deadline - now();
    if (remaining <= 0) break;
    await sleep(Math.min(intervalMs, remaining));
  } while (now() < deadline);
  return { status: 'TIMEOUT' };
}

function decodeEntities(v) {
  return v.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|quot|apos|lt|gt);/gi, (_, entity) => {
    const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
    if (entity[0] !== '#') return named[entity.toLowerCase()] || '';
    const n = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
  });
}

function attrs(tag) {
  const result = Object.create(null);
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const name = match[1].toLowerCase();
    if (name in result) throw new Error('simulator_form_invalid');
    result[name] = decodeEntities(match[2] ?? match[3]);
  }
  return result;
}

export function parseSimulatorForm(html, signature, page = SIM) {
  if (typeof html !== 'string' || html.length > 1024 * 1024) throw new Error('simulator_form_invalid');
  const forms = [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form\s*>/gi)];
  if (forms.length !== 1) throw new Error('simulator_form_invalid');
  const form = attrs(forms[0][1]);
  // Official #formSimulate has no HTML method/action: observed page JavaScript
  // submits POST by AJAX to the current simulator URL. Other structures are not
  // guessed; only an explicit POST targeting that exact URL is also accepted.
  const observedAjaxForm = form.id === 'formSimulate' && !form.action && !form.method;
  if (form.id !== 'formSimulate') throw new Error('simulator_form_invalid');
  let action;
  try { action = new URL(form.action || SIM, page); } catch { throw new Error('simulator_form_invalid'); }
  if (action.href !== SIM || action.origin !== 'https://klikqris.com' || action.username || action.password || action.search || action.hash) throw new Error('simulator_form_invalid');
  if (!observedAjaxForm && String(form.method || '').toUpperCase() !== 'POST') throw new Error('simulator_form_invalid');
  if (!observedAjaxForm && !form.action) throw new Error('simulator_form_invalid');
  if (!observedAjaxForm && !form.method) throw new Error('simulator_form_invalid');
  // The observed JavaScript's absolute AJAX URL is SIM; do not derive a new path.
  action = new URL(SIM);

  const fields = new URLSearchParams();
  let hasToken = false;
  let signatureField = null;
  for (const m of forms[0][2].matchAll(/<input\b[^>]*>/gi)) {
    const input = attrs(m[0]);
    if (!input.name || !/^[\w-]{1,80}$/.test(input.name)) continue;
    if (/csrf|_token/i.test(input.name)) { hasToken = Boolean(input.value); if (!hasToken) throw new Error('simulator_token_missing'); }
    if (/signature/i.test(input.name)) signatureField = input.name;
    if (input.type?.toLowerCase() === 'hidden' && !/signature/i.test(input.name)) fields.append(input.name, input.value ?? '');
  }
  if (!hasToken) throw new Error('simulator_token_missing');
  if (!signature || !signatureField) throw new Error('simulator_signature_missing');
  fields.set(signatureField, signature);
  return { action: action.href, fields };
}

function cookieJar(response, jar) {
  for (const line of response.headers.getSetCookie?.() || []) {
    const pair = line.split(';', 1)[0];
    if (/^[\w-]{1,80}=[^;\r\n]*$/.test(pair)) jar.set(pair.split('=')[0], pair.slice(pair.indexOf('=') + 1));
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
}

export async function simulate({ fetchImpl, signature, timeoutMs }) {
  const jar = new Map();
  const request = (url, options = {}) => fetchImpl(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
  try {
    const page = await request(SIM);
    cookieJar(page, jar);
    if (page.status >= 300 && page.status < 400) return 'simulator_login';
    if (page.status !== 200) return 'simulator_unavailable';
    const form = parseSimulatorForm(await page.text(), signature);
    const response = await request(form.action, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') }, body: form.fields.toString() });
    if (response.status >= 300 && response.status < 400) return 'simulator_login';
    return response.ok ? 'status_checked' : 'simulator_failed';
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') return 'simulator_timeout';
    return boundaries.has(err.message) ? err.message : 'simulator_failed';
  }
}

async function jsonRequest(fetchImpl, url, timeoutMs, options = {}) {
  const res = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  return { code: res.status, body: await res.json().catch(() => ({})), cookies: res.headers.getSetCookie?.() || [] };
}

const safeReason = (value, fallback) => {
  const text = String(value ?? '').toUpperCase().replace(/[^A-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  return /^[A-Z0-9_]{1,40}$/.test(text) && text ? text : fallback;
};

export async function paidContinuation({ request, orderId, plan, cookie }) {
  const fail = (reason) => ({ success: false, boundary: 'verification_failed', reason });
  const webhook = () => request('POST', '/api/payment/klikqris/webhook', { order_id: orderId, status: 'SUCCESS' });
  const first = await webhook();
  if (first.code !== 200 || first.body?.ok !== true || first.body?.ignored) {
    return { success: false, boundary: 'webhook_failed', reason: first.code !== 200 ? `HTTP_${safeReason(first.code, 0)}` : safeReason(first.body?.ignored, 'WEBHOOK_REJECTED') };
  }
  const latest = await request('GET', '/api/orders/latest', null, cookie);
  const me = await request('GET', '/api/me', null, cookie);
  const lic = latest.body?.license;
  const matching = me.body?.licenses?.filter((x) => x.id === lic?.id) || [];
  if (latest.code !== 200) return fail(`LATEST_HTTP_${safeReason(latest.code, 0)}`);
  if (latest.body?.order?.id !== orderId) return fail('LATEST_ORDER_MISMATCH');
  if (latest.body?.order?.status !== 'PAID') return fail(`LATEST_STATUS_${safeReason(latest.body?.order?.status, 'UNKNOWN')}`);
  if (!lic) return fail('LICENSE_NOT_RETURNED');
  if (!lic.token) return fail('LICENSE_TOKEN_MISSING');
  if (me.code !== 200) return fail(`ME_HTTP_${safeReason(me.code, 0)}`);
  if (matching.length !== 1) return fail('LICENSE_NOT_IN_ME');
  if (me.body.licenses?.length !== 1) return fail('UNEXPECTED_LICENSE_COUNT');
  if (matching[0].accountId !== me.body.account?.id) return fail('ACCOUNT_MISMATCH');
  if (JSON.stringify(matching[0].features) !== JSON.stringify(plan.features)) return fail('FEATURES_MISMATCH');
  if (matching[0].quota !== plan.quota) return fail('QUOTA_MISMATCH');
  const again = await webhook();
  if (again.code !== 200 || again.body?.ok !== true || again.body?.licenseId !== null) return fail('REPLAY_NOT_IDEMPOTENT');
  const after = await request('GET', '/api/me', null, cookie);
  if (after.code !== 200) return fail(`AFTER_HTTP_${safeReason(after.code, 0)}`);
  if (after.body?.licenses?.length !== 1 || after.body.licenses[0].id !== lic.id) return fail('REPLAY_STATE_CHANGED');
  return { success: true, boundary: 'complete', licenseId: lic.id };
}

export async function run(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const data = { version: 1, mode: 'sandbox', orderId: opts.orderId || null, amount: opts.amount, plan: artifactPlan({ ...PLAN, amount: opts.amount }), createdAt: Date.now(), status: 'PENDING', boundary: 'dry_run', licenseId: null };
  if (opts.reuse) {
    const loaded = JSON.parse(readFileSync(opts.reuse, 'utf8'));
    if (Object.keys(loaded).some((k) => !keys.has(k))) throw new Error('INVALID_ARTIFACT');
    Object.assign(data, safeArtifact(loaded));
    if (!data.orderId) throw new Error('INVALID_ARTIFACT');
  }
  if (opts.dryRun) return { success: true, boundary: 'dry_run', mode: 'sandbox', network: false };
  if (process.cwd() !== ROOT) throw new Error('SERVER_CWD_REQUIRED');
  const { loadEnv } = await import('../src/loadEnv.js');
  loadEnv();
  if (process.env.KLIKQRIS_MODE && process.env.KLIKQRIS_MODE !== 'sandbox') throw new Error('PRODUCTION_REJECTED');
  if (process.env.KLIKQRIS_BASE_URL || process.env.KLIKQRIS_URL || process.env.KLIKQRIS_API_URL) throw new Error('ENDPOINT_OVERRIDE_REJECTED');
  if (!process.env.KLIKQRIS_API_KEY || !process.env.KLIKQRIS_MERCHANT_ID) throw new Error('PAYMENT_NOT_CONFIGURED');
  // Keep Better Auth configuration from the existing server/.env so the
  // deterministic dummy customer uses the real auth security path. Only
  // isolate the database/key material below; never weaken auth checks.
  for (const key of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'LICENSE_PRIVATE_KEY_PEM', 'LICENSE_PUBLIC_KEY_PEM']) delete process.env[key];
  process.env.BETTER_AUTH_URL ||= 'http://127.0.0.1:4600';
  process.env.BETTER_AUTH_TRUSTED_ORIGINS ||= 'http://localhost:4601,http://127.0.0.1:4601,http://127.0.0.1:4600';
  process.env.BETTER_AUTH_COOKIE_DOMAIN = '';
  const scratch = process.env.TMPDIR;
  if (!scratch || !path.isAbsolute(scratch)) throw new Error('TMPDIR_REQUIRED');
  const dir = mkdtempSync(path.join(scratch, 'copilot-sandbox-'));
  chmodSync(dir, 0o700);
  let server;
  let artifactOwned = false;
  try {
    process.env.AUTH_DB_FILE = path.join(dir, 'auth.sqlite');
    copyFileSync(path.join(ROOT, 'data/auth.sqlite'), process.env.AUTH_DB_FILE);
    chmodSync(process.env.AUTH_DB_FILE, 0o600);
    const { default: Database } = await import('better-sqlite3');
    const db = new Database(process.env.AUTH_DB_FILE);
    try {
      db.pragma('foreign_keys = OFF');
      for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) db.prepare(`DELETE FROM "${name.replaceAll('"', '""')}"`).run();
    } finally { db.close(); }
    const { JsonStore } = await import('../src/store.js');
    const { validateSettings } = await import('../src/settings.js');
    const dataFile = path.join(dir, 'store.json');
    const isolated = new JsonStore(dataFile);
    isolated.updateSettings(validateSettings({ plans: [{ ...PLAN, ...data.plan, amount: data.amount }], payment: { mode: 'sandbox', baseUrl: API, klikqrisBaseUrl: API } }));
    chmodSync(dataFile, 0o600);
    const { createCopilotServer } = await import('../src/server.js');
    const adminToken = randomBytes(32).toString('hex');
    const guardedFetch = async (url, init) => {
      const u = new URL(url);
      if (u.origin !== 'https://klikqris.com' || !u.pathname.startsWith('/api/sandbox/qris/')) throw new Error('ENDPOINT_REJECTED');
      if (u.pathname === '/api/sandbox/qris/create') {
        const ref = JSON.parse(init?.body || '{}').order_id;
        if (!orderPattern.test(ref || '') || !artifactOwned || data.boundary !== 'create_attempted') throw new Error('CREATE_REF_REJECTED');
        data.orderId = ref;
        updateArtifact(opts.artifact, data);
      }
      return fetch(url, { ...init, signal: AbortSignal.timeout(opts.requestTimeoutMs), redirect: 'manual' });
    };
    const app = createCopilotServer({ dataFile, adminToken, allowUnauthenticatedAdmin: false, requirePersistedLicenseKeys: false, fetch: guardedFetch });
    server = app.server;
    if (app.klikqris.baseUrl !== API || app.klikqris.mode !== 'sandbox') throw new Error('ENDPOINT_REJECTED');
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const local = `http://127.0.0.1:${server.address().port}`;
    const request = (method, route, body, cookie) => jsonRequest(fetch, local + route, opts.requestTimeoutMs, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const signup = await jsonRequest(fetch, local + '/api/auth/sign-up/email', opts.requestTimeoutMs, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:4601' }, body: JSON.stringify({ name: 'Sandbox Runner', email: `sandbox-${randomBytes(12).toString('hex')}@gmail.com`, password: randomBytes(24).toString('base64url') + 'Aa1!' }) });
    const cookie = signup.cookies.map((x) => x.split(';', 1)[0]).join('; ');
    if (signup.code !== 200 || !cookie) {
      const reason = signup.body?.code || signup.body?.error || signup.body?.message;
      const safe = String(reason || 'UNKNOWN').toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 40);
      throw new Error(`AUTH_SIGNUP_FAILED_${signup.code}_${safe}`);
    }
    const me = await request('GET', '/api/me', null, cookie);
    if (me.code !== 200 || !me.body.account?.id || me.body.licenses?.length !== 0) throw new Error(`SIGNUP_FAILED_ME_${me.code}`);
    if (data.orderId) {
      const result = await app.klikqris.checkStatus(data.orderId);
      const upstreamAmount = Number(result.raw?.amount);
      if (opts.orderId && !opts.reuse && Number.isSafeInteger(upstreamAmount) && upstreamAmount > 0) data.amount = upstreamAmount;
      data.status = validateStatus(result, data.orderId, data.amount);
      app.store.updateSettings(validateSettings({ plans: [{ ...PLAN, ...data.plan, amount: data.amount }] }));
      app.store.addOrder({ id: data.orderId, accountId: me.body.account.id, packageKey: data.plan.key, planName: data.plan.name, quota: data.plan.quota, amount: data.amount, status: 'PENDING', createdAt: data.createdAt, paidAt: null });
      data.boundary = 'adopted';
    } else {
      data.boundary = 'create_attempted';
      if (!opts.artifact) throw new Error('ARTIFACT_REQUIRED_FOR_CREATE');
      writeArtifact(opts.artifact, data); artifactOwned = true;
      const created = await request('POST', '/api/orders', { packageKey: data.plan.key }, cookie);
      if (created.code !== 201 || !orderPattern.test(created.body?.order?.id || '') || created.body.order.amount !== data.amount) throw new Error('CREATE_FAILED');
      data.orderId = created.body.order.id;
      data.createdAt = created.body.order.createdAt;
      data.boundary = 'created';
    }
    if (opts.artifact && !artifactOwned) { writeArtifact(opts.artifact, data); artifactOwned = true; }
    else if (artifactOwned) updateArtifact(opts.artifact, data);
    const initial = await app.klikqris.checkStatus(data.orderId);
    data.status = validateStatus(initial, data.orderId, data.amount);
    data.boundary = 'status_checked';
    if (opts.simulate && !['SUCCESS', 'PAID', 'SETTLEMENT'].includes(data.status)) {
      const signature = initial.raw?.signature;
      data.boundary = signature ? await simulate({ fetchImpl: fetch, signature, timeoutMs: opts.requestTimeoutMs }) : 'simulator_signature_missing';
    }
    const polled = await pollStatus(app.klikqris, data.orderId, data.amount, { timeoutMs: opts.pollTimeoutMs, intervalMs: opts.pollIntervalMs });
    data.status = polled.status;
    let continuation = null;
    if (['SUCCESS', 'PAID', 'SETTLEMENT'].includes(data.status)) {
      data.boundary = 'upstream_paid';
      continuation = await paidContinuation({ request, orderId: data.orderId, plan: data.plan, cookie });
      data.boundary = continuation.boundary;
      data.licenseId = continuation.licenseId ?? null;
    } else if (data.status === 'TIMEOUT') data.boundary = 'poll_timeout';
    else data.boundary = 'upstream_terminal';
    if (artifactOwned) updateArtifact(opts.artifact, data);
    return { success: data.boundary === 'complete', boundary: data.boundary, mode: 'sandbox', orderId: data.orderId, status: data.status, licenseId: data.licenseId, reason: continuation?.reason ?? null, callback: 'local_webhook_replay; actual_upstream_callback_not_observed', adoption: Boolean(opts.orderId || opts.reuse) };
  } catch (err) {
    data.boundary = err.message === 'INVALID_UPSTREAM' ? 'invalid_upstream' : 'request_failed';
    if (artifactOwned && data.orderId) updateArtifact(opts.artifact, data);
    return { success: false, boundary: data.boundary, mode: 'sandbox', orderId: data.orderId, status: data.status, code: safeErrorCode(err), diagnostic: String(err?.message || err?.code || err?.name || 'UNKNOWN_ERROR').toUpperCase().replace(/[^A-Z0-9_]+/g, '_').slice(0, 80) };
  } finally {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().then((result) => { console.log(JSON.stringify(result)); if (!result.success) process.exitCode = 1; }, (err) => {
    console.log(JSON.stringify({ success: false, mode: 'sandbox', code: safeErrorCode(err) }));
    process.exitCode = 1;
  });
}
