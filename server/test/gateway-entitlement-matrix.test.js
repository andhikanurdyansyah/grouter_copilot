/**
 * Gateway entitlement + robustness matrix (2026-10-13 mandate).
 *
 * Covers the gaps that gateway.test.js / gateway-failure-gaps.test.js do NOT
 * already assert, with the exact same in-process-server + injected fake fetch
 * style (no real key, no network, no production data):
 *
 *   1. DISALLOWED MODEL      → MODEL_NOT_ALLOWED, upstream never called, ledger
 *                              row is a released `rejected` charge.
 *   2. AI-DISABLED PLAN      → AI_DISABLED, upstream never called, ledger row
 *                              reflects the rejection (`ai_disabled`).
 *   3. INVALID DEFAULT MODEL → a global provider.model that drifted OUTSIDE a
 *                              package allowlist must fail closed (NOT_CONFIGURED)
 *                              instead of silently running an un-allowed model;
 *                              an explicit allowlisted model still works.
 *   4. QUOTA BOUNDARY        → the request that reaches the limit succeeds, the
 *                              very next is QUOTA_EXHAUSTED (in-process + HTTP 429).
 *   5. CONCURRENCY           → parallel requests on a small quota never over-grant;
 *                              the ledger partitions cleanly with no dangling
 *                              reservation and upstream calls == admitted.
 *   6. SSE-FRAMED UPSTREAM   → the backend's only streaming shape (gRouter may
 *                              answer text/event-stream even for a non-streaming
 *                              call) is parsed, the envelope is sane and usage is
 *                              ledgered.
 *   7. CANCELLATION          → a client abort mid-flight never leaves a partial
 *                              `ok` claim or a dangling reservation, and a failure
 *                              after abort releases the reservation (0 charge).
 *
 * Known open gaps are pinned as characterization tests and flagged in
 * docs/evidence/2026-10-13-gateway-entitlement-matrix.md.
 *
 * Isolation: temp DATA_FILE + temp AUTH_DB_FILE only; server/data/ is never
 * written. The prod auth.sqlite is COPIED (schema only) then cleared.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Dummy payment creds so KlikQris constructs (never used by these tests).
process.env.KLIKQRIS_API_KEY ||= 'dummy-klikqris-key';
process.env.KLIKQRIS_MERCHANT_ID ||= 'dummy-merchant';

// auth.js reads AUTH_DB_FILE ONCE at import time → point it at a temp DB BEFORE
// the first server.js import. A fresh empty auth.sqlite crashes Better Auth
// (SchemaMismatchError), so start from the prod-schema DB with all rows cleared.
const authDir = mkdtempSync(path.join(tmpdir(), 'copilot-ent-auth-'));
process.env.AUTH_DB_FILE = path.join(authDir, 'auth.sqlite');
copyFileSync(path.join(__dirname, '..', 'data', 'auth.sqlite'), process.env.AUTH_DB_FILE);
{
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(process.env.AUTH_DB_FILE);
  db.pragma('foreign_keys = OFF');
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  for (const { name } of tables) db.prepare(`DELETE FROM "${name}"`).run();
  db.close();
}

const { createCopilotServer } = await import('../src/server.js');

const MESSAGES = [{ role: 'user', content: 'hi' }];

function makeServer({ fetchImpl, apiKey = 'dummy-service-key', settingsPatch } = {}) {
  // The gateway adapter reads the credential from server-side env AT
  // CONSTRUCTION — tests must set it before creating the server.
  const prev = process.env.GROUTER_API_KEY;
  process.env.GROUTER_API_KEY = apiKey;
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-ent-gw-'));
  const created = createCopilotServer({
    dataFile: path.join(dir, 'store.json'),
    fetch: fetchImpl,
    initialSettings: settingsPatch,
  });
  created.server.listen(0, () => {});
  const { port } = created.server.address();
  return {
    ...created,
    dir,
    baseUrl: `http://127.0.0.1:${port}`,
    restore() {
      created.server.close();
      if (prev === undefined) delete process.env.GROUTER_API_KEY;
      else process.env.GROUTER_API_KEY = prev;
    },
  };
}

function jsonProvider({ answer = 'ok', usage = { prompt_tokens: 10, completion_tokens: 5 } } = {}) {
  return async () => new Response(
    JSON.stringify({ choices: [{ message: { content: answer } }], usage }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

async function httpChat(baseUrl, body) {
  const res = await fetch(`${baseUrl}/api/copilot/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

// 1 ─────────────────────────────────────────────────────────────────────────
test('entitlement: disallowed model is denied before any upstream call and ledgered as rejected', async () => {
  let providerCalls = 0;
  const env = makeServer({
    fetchImpl: async () => { providerCalls++; return jsonProvider()(); },
    settingsPatch: {
      plans: [{
        key: 'locked', name: 'Locked', amount: 0, currency: 'IDR', expiresInDays: 90, active: true,
        ai: { enabled: true, provider: 'grouter', allowedModels: ['DeepSeek-V4-Flash'], defaultModel: 'DeepSeek-V4-Flash', quotaTokens: 5000 },
      }],
    },
  });
  try {
    const { token } = env.service.issue({ customer: 'LOCK', planKey: 'locked' });
    const out = await env.gateway.chat({ token, messages: MESSAGES, model: 'kimi-k3', requestId: 'req_deny_model' });
    assert.equal(out.status, 'error', JSON.stringify(out));
    assert.equal(out.code, 'MODEL_NOT_ALLOWED');
    assert.equal(providerCalls, 0, 'upstream must NEVER be called for a disallowed model');
    const rec = env.store.getUsageRecord('req_deny_model');
    assert.equal(rec.status, 'rejected');
    assert.equal(rec.errorClassification, 'model_not_allowed');
    assert.equal(rec.reservedTokens, 0);
    const totals = env.store.usageTotals(env.service.list()[0].id);
    assert.equal(totals.usedTokens, 0, 'rejection is never charged');
    assert.equal(totals.requestCount, 0);
  } finally {
    env.restore();
  }
});

// 2 ─────────────────────────────────────────────────────────────────────────
test('entitlement: AI-disabled plan fails closed (no upstream call) and ledger row reflects the rejection', async () => {
  let providerCalls = 0;
  const env = makeServer({
    fetchImpl: async () => { providerCalls++; return jsonProvider()(); },
    settingsPatch: {
      plans: [{
        key: 'noai', name: 'NoAI', amount: 0, currency: 'IDR', expiresInDays: 90, active: true,
        ai: { enabled: false, provider: 'grouter', allowedModels: [] },
      }],
    },
  });
  try {
    const { token } = env.service.issue({ customer: 'NOAI', planKey: 'noai' });
    const out = await env.gateway.chat({ token, messages: MESSAGES, requestId: 'req_deny_ai' });
    assert.equal(out.status, 'error', JSON.stringify(out));
    assert.equal(out.code, 'AI_DISABLED');
    assert.equal(providerCalls, 0, 'upstream must NEVER be called for an AI-disabled plan');
    const rec = env.store.getUsageRecord('req_deny_ai');
    assert.equal(rec.status, 'rejected');
    assert.equal(rec.errorClassification, 'ai_disabled');
    assert.equal(rec.reservedTokens, 0);
    assert.equal(env.store.usageTotals(env.service.list()[0].id).usedTokens, 0);
  } finally {
    env.restore();
  }
});

// 3 ─────────────────────────────────────────────────────────────────────────
test('entitlement: default model drifted outside the package allowlist fails closed; explicit allowlisted model still works', async () => {
  let providerCalls = 0;
  const env = makeServer({
    fetchImpl: async (url, init) => { providerCalls++; return jsonProvider()(url, init); },
    settingsPatch: {
      // Global infrastructure default is OUTSIDE the package allowlist.
      provider: { model: 'drifted-global-model' },
      plans: [{
        key: 'pkg', name: 'Pkg', amount: 0, currency: 'IDR', expiresInDays: 90, active: true,
        // Multi-model allowlist with NO package defaultModel: the package cannot
        // supply a default, so the drifted global default must be refused.
        ai: { enabled: true, provider: 'grouter', allowedModels: ['m1', 'm2'], quotaTokens: 5000 },
      }],
    },
  });
  try {
    const { token } = env.service.issue({ customer: 'DRIFT', planKey: 'pkg' });

    // (a) no model in request → global default will not be used → NOT_CONFIGURED.
    const drifted = await env.gateway.chat({ token, messages: MESSAGES, requestId: 'req_drift' });
    assert.equal(drifted.status, 'error', JSON.stringify(drifted));
    assert.equal(drifted.code, 'NOT_CONFIGURED');
    assert.equal(providerCalls, 0, 'the un-allowed drifted default must never reach upstream');
    assert.equal(env.store.getUsageRecord('req_drift'), null, 'fail-closed before reservation → no ledger row');
    assert.equal(env.store.usageTotals(env.service.list()[0].id).usedTokens, 0);

    // (b) control: an explicit ALLOWLISTED model under the same drifted config is accepted.
    const allowed = await env.gateway.chat({ token, messages: MESSAGES, model: 'm2', requestId: 'req_drift_ok' });
    assert.equal(allowed.status, 'ok', JSON.stringify(allowed));
    assert.equal(providerCalls, 1, 'only the allowlisted request reaches upstream');
    const rec = env.store.getUsageRecord('req_drift_ok');
    assert.equal(rec.status, 'ok');
    assert.equal(rec.model, 'm2');
    assert.equal(rec.totalTokens, 15);
  } finally {
    env.restore();
  }
});

// 4 ─────────────────────────────────────────────────────────────────────────
test('entitlement: quota boundary — the request that reaches the limit succeeds, the next is denied (429)', async () => {
  // 100-token quota; each call costs exactly 100 → first lands ON the boundary,
  // second must be denied (429 QUOTA_EXHAUSTED), and nothing extra is charged.
  const env = makeServer({
    fetchImpl: jsonProvider({ usage: { prompt_tokens: 60, completion_tokens: 40 } }),
    settingsPatch: {
      plans: [{ key: 'edge', name: 'Edge', amount: 0, currency: 'IDR', quotaTokens: 100, expiresInDays: 90, active: true }],
    },
  });
  try {
    const { token } = env.service.issue({ customer: 'EDGE', planKey: 'edge' });

    const first = await env.gateway.chat({ token, messages: MESSAGES, requestId: 'req_edge_1' });
    assert.equal(first.status, 'ok', JSON.stringify(first));
    assert.equal(first.quota.usedTokens, 100, 'reaches exactly the limit');
    assert.equal(first.quota.limit, 100);

    const second = await env.gateway.chat({ token, messages: MESSAGES, requestId: 'req_edge_2' });
    assert.equal(second.status, 'error');
    assert.equal(second.code, 'QUOTA_EXHAUSTED');
    const rec = env.store.getUsageRecord('req_edge_2');
    assert.equal(rec.status, 'rejected');
    assert.equal(rec.errorClassification, 'quota_exhausted');
    assert.equal(rec.reservedTokens, 0);
    assert.equal(env.store.usageTotals(env.service.list()[0].id).usedTokens, 100, 'only the boundary call is charged');

    // HTTP surface maps QUOTA_EXHAUSTED → 429 (proven end-to-end).
    const http = await httpChat(env.baseUrl, { token, messages: MESSAGES, requestId: 'req_edge_3' });
    assert.equal(http.status, 429);
    assert.equal(http.json.code, 'QUOTA_EXHAUSTED');
  } finally {
    env.restore();
  }
});

// 5 ─────────────────────────────────────────────────────────────────────────
test('entitlement: parallel requests on a small quota never over-grant and the ledger partitions cleanly', async () => {
  // 3000-token quota, a 1000-token reservation and 1000-token actual usage per
  // call: the synchronous check-then-reserve admits exactly 3 (3000/1000) and
  // committed tokens can never exceed the quota. This pins the "no over-grant"
  // guarantee for the case the reservation is calibrated to real usage.
  const env = makeServer({
    fetchImpl: async () => {
      await new Promise((r) => setTimeout(r, 15)); // widen the in-flight window
      return jsonProvider({ usage: { prompt_tokens: 600, completion_tokens: 400 } })();
    },
    settingsPatch: {
      provider: { gateway: { defaultReservationTokens: 1000, maxReservationTokens: 20000, maxMessageBytes: 32000 } },
      plans: [{ key: 'small', name: 'Small', amount: 0, currency: 'IDR', quotaTokens: 3000, expiresInDays: 90, active: true }],
    },
  });
  try {
    const { record, token } = env.service.issue({ customer: 'PAR', planKey: 'small' });
    const N = 8;
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) => env.gateway.chat({ token, messages: MESSAGES, requestId: `req_par_${i}` })),
    );

    const ok = results.filter((r) => r.status === 'ok');
    const denied = results.filter((r) => r.code === 'QUOTA_EXHAUSTED');
    assert.equal(ok.length + denied.length, N, 'every request resolves to ok or QUOTA_EXHAUSTED');

    // Ledger rows partition: no request is both, none is left dangling reserved.
    const rows = env.store.data.usage.filter((u) => u.licenseId === record.id);
    assert.equal(rows.length, N, 'one ledger row per requestId');
    assert.ok(rows.every((r) => r.status !== 'reserved'), 'no reservation may dangle');
    const okRows = rows.filter((r) => r.status === 'ok');
    const rejectedRows = rows.filter((r) => r.status === 'rejected');
    assert.equal(okRows.length, ok.length, 'ok rows == admitted requests');
    assert.equal(rejectedRows.length, denied.length, 'rejected rows == denied requests');
    assert.ok(rejectedRows.every((r) => r.reservedTokens === 0), 'denied rows carry no reservation');
    assert.ok(rejectedRows.every((r) => r.totalTokens === null), 'denied rows are never charged');

    // The hard invariant: charged tokens can never exceed the quota, and the
    // synchronous reservation caps admission at quota / reservation.
    const totals = env.store.usageTotals(record.id);
    assert.equal(ok.length, 3, `exactly 3 of 8 admit (got ${ok.length})`);
    assert.equal(totals.usedTokens, 3000, 'charged == quota exactly, never above');
    assert.equal(totals.usedTokens, okRows.reduce((s, r) => s + (r.totalTokens ?? 0), 0), 'ledger totals match ok rows');
    assert.equal(totals.requestCount, 3);
  } finally {
    env.restore();
  }
});

// 6 ─────────────────────────────────────────────────────────────────────────
test('streaming path: SSE-framed upstream answer is parsed, envelopped, and ledgered with real usage', async () => {
  // gRouter may answer text/event-stream even for a non-streaming gateway call:
  // a single JSON object followed by SSE framing. The backend must extract the
  // JSON, return the canonical envelope, and charge the reported usage.
  let seenBody = null;
  const env = makeServer({
    fetchImpl: async (url, init) => {
      seenBody = JSON.parse(init.body);
      const framed = JSON.stringify({ choices: [{ message: { content: 'framed answer' } }], usage: { prompt_tokens: 7, completion_tokens: 5 } })
        + '\n\ndata: [DONE]\n\n';
      return new Response(framed, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    },
    settingsPatch: {
      plans: [{ key: 's', name: 'S', amount: 0, currency: 'IDR', quotaTokens: 3000, expiresInDays: 90, active: true }],
    },
  });
  try {
    const { token } = env.service.issue({ customer: 'SSE', planKey: 's' });
    const out = await env.gateway.chat({ token, messages: MESSAGES, requestId: 'req_sse' });
    assert.equal(out.status, 'ok', JSON.stringify(out));
    assert.deepEqual(out.usage, { inputTokens: 7, outputTokens: 5 });
    assert.equal(out.answer, 'framed answer');
    assert.equal(out.quota.usedTokens, 12);
    // The request that left the backend is a normal (non-stream) completion.
    assert.equal(seenBody.stream, undefined, 'gateway chat is non-streaming upstream');
    const rec = env.store.getUsageRecord('req_sse');
    assert.equal(rec.status, 'ok');
    assert.equal(rec.totalTokens, 12);
    assert.equal(rec.reservedTokens, 0);
  } finally {
    env.restore();
  }
});

// 7 ─────────────────────────────────────────────────────────────────────────
test('cancellation: client abort mid-flight leaves no partial ok claim and no dangling reservation', async () => {
  // The gateway holds no per-client AbortSignal today, so an abort is observed
  // only as the client socket closing. Two invariants must still hold.
  // (a) abort + upstream FAILURE → reservation released, nothing charged.
  {
    let release;
    const gate = new Promise((r) => { release = r; });
    const env = makeServer({
      fetchImpl: async () => { await gate; return new Response('boom', { status: 500 }); },
      settingsPatch: { plans: [{ key: 'q', name: 'Q', amount: 0, currency: 'IDR', quotaTokens: 5000, expiresInDays: 90, active: true }] },
    });
    try {
      const { record, token } = env.service.issue({ customer: 'CA', planKey: 'q' });
      const ac = new AbortController();
      const pending = fetch(`${env.baseUrl}/api/copilot/chat`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, messages: MESSAGES, requestId: 'req_abort_fail' }),
        signal: ac.signal,
      }).then((r) => r.text()).catch((e) => ({ aborted: e.name }));
      await new Promise((r) => setTimeout(r, 100));
      ac.abort(); // client goes away while the upstream call is still pending
      assert.deepEqual(await pending, { aborted: 'AbortError' });
      release();
      await new Promise((r) => setTimeout(r, 150));
      const rec = env.store.getUsageRecord('req_abort_fail');
      assert.equal(rec.status, 'error', 'aborted + failed upstream settles as error');
      assert.equal(rec.reservedTokens, 0, 'reservation released');
      assert.equal(rec.totalTokens, null, 'no partial token claim');
      assert.equal(env.store.usageTotals(record.id).usedTokens, 0, 'nothing charged');
    } finally {
      env.restore();
    }
  }

  // (b) abort + upstream SUCCESS → settles exactly once as ok with the FULL
  //     reported usage (never a partial claim, never a dangling reservation).
  {
    let release;
    const gate = new Promise((r) => { release = r; });
    const env = makeServer({
      fetchImpl: async () => { await gate; return jsonProvider({ usage: { prompt_tokens: 10, completion_tokens: 10 } })(); },
      settingsPatch: { plans: [{ key: 'q', name: 'Q', amount: 0, currency: 'IDR', quotaTokens: 5000, expiresInDays: 90, active: true }] },
    });
    try {
      const { record, token } = env.service.issue({ customer: 'CB', planKey: 'q' });
      const ac = new AbortController();
      const pending = fetch(`${env.baseUrl}/api/copilot/chat`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, messages: MESSAGES, requestId: 'req_abort_ok' }),
        signal: ac.signal,
      }).then((r) => r.text()).catch((e) => ({ aborted: e.name }));
      await new Promise((r) => setTimeout(r, 100));
      ac.abort();
      assert.deepEqual(await pending, { aborted: 'AbortError' });
      release();
      await new Promise((r) => setTimeout(r, 150));
      const rows = env.store.data.usage.filter((u) => u.licenseId === record.id);
      assert.equal(rows.length, 1, 'exactly one ledger row');
      const rec = rows[0];
      assert.equal(rec.status, 'ok');
      assert.equal(rec.reservedTokens, 0, 'no dangling reservation');
      assert.equal(rec.totalTokens, 20, 'full reported usage, never partial');
      assert.equal(env.store.usageTotals(record.id).usedTokens, 20);
    } finally {
      env.restore();
    }
  }
});

// 7b ────────────────────────────────────────────────────────────────────────
test('unknown planKey fails CLOSED: no upstream call, no unmetered AI (was a fail-open hole)', async () => {
  // An entitlement hole found during this matrix work: if an admin removes or
  // renames a plan after licenses were issued, those licenses resolved to NO
  // plan → legacy policy → AI enabled, no allowlist, UNLIMITED quota. FIXED:
  // a non-empty planKey that no longer resolves now fails closed (PLAN_NOT_FOUND)
  // before any upstream call. See the control test below for the null-planKey
  // path, which stays legitimate.
  let providerCalls = 0;
  const env = makeServer({
    fetchImpl: async () => { providerCalls++; return jsonProvider()(); },
    settingsPatch: {
      plans: [{ key: 'known', name: 'Known', amount: 0, currency: 'IDR', quotaTokens: 100, expiresInDays: 90, active: true }],
    },
  });
  try {
    const { token } = env.service.issue({ customer: 'GHOST', planKey: 'ghost-plan' });
    const out = await env.gateway.chat({ token, messages: MESSAGES, requestId: 'req_ghost' });
    assert.equal(out.status, 'error', JSON.stringify(out));
    assert.equal(out.code, 'PLAN_NOT_FOUND');
    assert.equal(out.retryable, false);
    assert.equal(providerCalls, 0, 'upstream must NOT be called for an unknown package');
    // Reason trail: the rejection is ledgered (never a silent grant).
    const led = env.store.getUsageRecord('req_ghost');
    assert.equal(led.status, 'rejected');
    assert.equal(led.errorClassification, 'plan_not_found');
    assert.equal(led.reservedTokens, 0);
  } finally {
    env.restore();
  }
});

// control: an explicitly package-less license (planKey null) is NOT a hole —
// it is the legitimate "issued without a package" path and keeps working.
test('control: null planKey (issued without a package) is unaffected by the fail-closed rule', async () => {
  let providerCalls = 0;
  const env = makeServer({
    fetchImpl: async () => { providerCalls++; return jsonProvider()(); },
    settingsPatch: {
      plans: [{ key: 'known', name: 'Known', amount: 0, currency: 'IDR', quotaTokens: 100, expiresInDays: 90, active: true }],
    },
  });
  try {
    const { token } = env.service.issue({ customer: 'NOPLAN', planKey: null });
    const out = await env.gateway.chat({ token, messages: MESSAGES, requestId: 'req_noplan' });
    assert.equal(out.status, 'ok', JSON.stringify(out));
    assert.equal(providerCalls, 1);
    assert.equal(out.quota.limit, null, 'package-less license keeps the documented legacy (unlimited) policy');
  } finally {
    env.restore();
  }
});
