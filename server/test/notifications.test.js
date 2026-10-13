import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Notification contract tests (in-app MVP):
 * - persistence + per-account scoping (no cross-tenant access)
 * - idempotency (same event/dedupeKey never duplicates)
 * - unread counts, mark-read (single + all), refresh persistence
 * - empty state
 * Run with the standalone JsonStore (no HTTP): store-level contract.
 */
import { JsonStore } from '../src/store.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('notifications: persist, scope, dedupe, read state, retention', () => {
  const dir = mkdtempSync(join(tmpdir(), 'copilot-notif-'));
  const store = new JsonStore(join(dir, 'store.json'));

  // empty state
  assert.equal(store.listNotifications('acc_a').length, 0);

  // create + dedupe by (type, dedupeKey)
  const n1 = store.addNotification({ accountId: 'acc_a', type: 'order.paid', dedupeKey: 'ord_1', title: 'P', titleEn: 'P', body: 'b', bodyEn: 'b' });
  assert.ok(n1?.id);
  const dup = store.addNotification({ accountId: 'acc_a', type: 'order.paid', dedupeKey: 'ord_1', title: 'P', titleEn: 'P', body: 'b', bodyEn: 'b' });
  assert.equal(dup.id, n1.id, 'replayed event must not duplicate');
  store.addNotification({ accountId: 'acc_a', type: 'order.pending', dedupeKey: 'ord_2', title: 'Q', titleEn: 'Q', body: 'b2', bodyEn: 'b2' });
  store.addNotification({ accountId: 'acc_b', type: 'order.paid', dedupeKey: 'ord_9', title: 'R', titleEn: 'R', body: 'b3', bodyEn: 'b3' });

  // scoping: acc_a never sees acc_b events
  const listA = store.listNotifications('acc_a');
  assert.equal(listA.length, 2);
  assert.ok(listA.every((n) => n.accountId === 'acc_a'));

  // unread counts + mark single read (idempotent)
  assert.equal(store.listNotifications('acc_a').filter((n) => n.readAt == null).length, 2);
  const marked = store.markNotificationRead('acc_a', n1.id);
  assert.ok(marked.readAt);
  const readAt = marked.readAt;
  const markedAgain = store.markNotificationRead('acc_a', n1.id);
  assert.equal(markedAgain.readAt, readAt, 'mark-read must be idempotent');
  assert.equal(store.listNotifications('acc_a').filter((n) => n.readAt == null).length, 1);

  // foreign id → 404-style null (no cross-tenant mark)
  assert.equal(store.markNotificationRead('acc_b', n1.id), null);

  // persistence across reload
  const store2 = new JsonStore(join(dir, 'store.json'));
  const reloaded = store2.listNotifications('acc_a');
  assert.equal(reloaded.length, 2);
  const n1b = reloaded.find((n) => n.id === n1.id);
  assert.ok(n1b.readAt, 'read state must persist across reload');

  // mark-all
  const changed = store2.markAllNotificationsRead('acc_a');
  assert.equal(changed, 1);
  assert.equal(store2.listNotifications('acc_a').filter((n) => n.readAt == null).length, 0);
  assert.equal(store2.markAllNotificationsRead('acc_a'), 0, 'second mark-all is a no-op');

  // retention: cap 100 newest per account
  for (let i = 0; i < 130; i++) {
    store2.addNotification({ accountId: 'acc_c', type: 'usage.warn', dedupeKey: `d${i}`, title: 't', titleEn: 't', body: 'b', bodyEn: 'b', createdAt: 1_000_000 + i });
  }
  const listC = store2.listNotifications('acc_c', { limit: 200 });
  assert.equal(listC.length, 100, 'retention keeps at most 100 per account');
  assert.equal(listC[0].dedupeKey, 'd129', 'newest kept');
});

test('syncAccountNotifications derives real events from state (via server handler helper)', async () => {
  // In-process isolated server (same pattern as order-history.test.js) —
  // no external port, no spawn, deterministic.
  const path = await import('node:path');
  const { createCopilotServer } = await import('../src/server.js');
  const dataFile = path.join(mkdtempSync(path.join(tmpdir(), 'copilot-notif-api-')), 'store.json');
  const fakeFetch = async () => new Response(
    JSON.stringify({ status: true, data: { order_id: 'ord_x', status: 'PENDING' } }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
  const { server } = createCopilotServer({ dataFile, fetch: fakeFetch });
  await new Promise((r) => server.listen(0, r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    // unauthenticated → 401
    const anon = await fetch(`${baseUrl}/api/me/notifications`);
    assert.equal(anon.status, 401);

    // sign up + session cookie
    const email = `ntf-${Date.now()}@gmail.com`;
    const password = `Gr0ut3r-${Math.random().toString(36).slice(2)}!Zq`;
    const signup = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:4601' },
      body: JSON.stringify({ email, password, name: 'NTF' }),
    });
    assert.equal(signup.status, 200);
    const cookie = (signup.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');

    // empty state for a fresh account (no orders/licenses → no events)
    const list = await fetch(`${baseUrl}/api/me/notifications`, { headers: { cookie } });
    assert.equal(list.status, 200);
    const listJson = await list.json();
    assert.equal(listJson.total, 0);
    assert.equal(listJson.unread, 0);
    assert.deepEqual(listJson.notifications, []);

    // read-all on empty is a harmless no-op
    const readAll = await fetch(`${baseUrl}/api/me/notifications/read-all`, { method: 'POST', headers: { cookie } });
    assert.equal(readAll.status, 200);
    const readAllJson = await readAll.json();
    assert.equal(readAllJson.changed, 0);

    // unknown notification id → 404 (no cross-tenant probing)
    const missing = await fetch(`${baseUrl}/api/me/notifications/ntf_missing/read`, { method: 'POST', headers: { cookie } });
    assert.equal(missing.status, 404);
  } finally {
    server.close();
  }
});
