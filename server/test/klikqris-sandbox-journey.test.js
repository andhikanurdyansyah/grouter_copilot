import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, safeArtifact, parseSimulatorForm, simulate, validateStatus, pollStatus, paidContinuation } from '../scripts/klikqris-sandbox-journey.mjs';

const id = 'ord_test_123';
const plan = { key: 'sandbox-journey', name: 'Sandbox Journey', features: ['core'], quota: 'sandbox-only', expiresInDays: 30 };
const artifact = { version: 1, mode: 'sandbox', orderId: id, amount: 10000, plan, createdAt: 12345, status: 'PENDING', boundary: 'created' };

test('strict args and dry-run defaults (fixture only, no network)', () => {
  assert.equal(parseArgs(['--dry-run']).requestTimeoutMs, 15000);
  for (const args of [['--amount', '0'], ['--amount', '1.2'], ['--unknown'], ['--reuse', 'x', '--order-id', id], ['--no-simulate', '--no-simulate'], ['--order-id', '../x']]) assert.throws(() => parseArgs(args));
});

test('artifact allowlist strips secret fields and rejects unsafe values', () => {
  const clean = safeArtifact({ ...artifact, signature: 'secret', qrImage: 'secret', cookie: 'secret' });
  assert.equal(JSON.stringify(clean).includes('secret'), false);
  assert.throws(() => safeArtifact({ ...artifact, mode: 'production' }));
});

test('simulator form uses real signature field, CSRF, cookies and exact same-origin sandbox action (fixture only)', async () => {
  const html = '<form id="formSimulate"><input type="hidden" name="_token" value="csrf"><input type="hidden" name="signature" value=""><input type="hidden" name="other" value="a&amp;b"></form>';
  const parsed = parseSimulatorForm(html, 'sig');
  assert.equal(parsed.fields.get('signature'), 'sig');
  assert.equal(parsed.fields.get('other'), 'a&b');
  assert.throws(() => parseSimulatorForm(html.replace('form id="formSimulate"', 'form id="other"'), 'sig'));
  assert.throws(() => parseSimulatorForm(html.replace('name="_token"', 'name="other-token"'), 'sig'), /simulator_token_missing/);
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return calls.length === 1 ? new Response(html, { headers: { 'set-cookie': 'session=fixture; Path=/' } }) : new Response('ok');
  };
  assert.equal(await simulate({ fetchImpl, signature: 'sig', timeoutMs: 1000 }), 'status_checked');
  assert.equal(calls[1].url, 'https://klikqris.com/public/sandbox/simulate');
  assert.equal(calls[1].init.method, 'POST');
  assert.equal(calls[1].init.headers.cookie, 'session=fixture');
  assert.equal(calls[1].init.redirect, 'manual');
});

test('upstream ID mismatch and bounded poll timeout (fixture only)', async () => {
  assert.throws(() => validateStatus({ orderId: id, status: 'SUCCESS', raw: { order_id: 'ord_other', amount: 10000 } }, id, 10000));
  let clock = 0;
  const client = { checkStatus: async () => ({ orderId: id, status: 'PENDING', raw: { order_id: id, amount: 10000 } }) };
  assert.equal((await pollStatus(client, id, 10000, { timeoutMs: 10, intervalMs: 3, now: () => clock, sleep: async (ms) => { clock += ms; } })).status, 'TIMEOUT');
});

test('paid continuation requires owned single license and idempotent replay (fixture only)', async () => {
  const license = { id: 'lic_fixture', token: 'fixture-only', accountId: 'acc_fixture', features: ['core'], quota: 'sandbox-only' };
  let webhooks = 0;
  const request = async (method, route) => {
    if (route.endsWith('/webhook')) { webhooks++; return { code: 200, body: { ok: true, licenseId: webhooks === 1 ? license.id : null } }; }
    if (route.endsWith('/latest')) return { code: 200, body: { order: { id, status: 'PAID' }, license } };
    return { code: 200, body: { account: { id: 'acc_fixture' }, licenses: [license] } };
  };
  assert.equal((await paidContinuation({ request, orderId: id, plan })).success, true);
  assert.equal(webhooks, 2);
  const incomplete = await paidContinuation({ request: async () => ({ code: 200, body: { ok: true, ignored: 'unverified:PENDING' } }), orderId: id, plan });
  assert.equal(incomplete.success, false);
});
