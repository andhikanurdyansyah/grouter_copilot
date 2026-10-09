/**
 * Admin orders visibility endpoint (customer journey / operator ops).
 * GET /api/admin/orders — read-only, admin-gated, status filter, bounded limit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCopilotServer } from '../src/server.js';

test('admin orders endpoint: gated, filtered, bounded, no payment credentials', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-orders-'));
  const main = createCopilotServer({ dataFile: path.join(dir, 'store.json') });
  main.server.listen(0, () => {});
  const base = `http://127.0.0.1:${main.server.address().port}`;
  try {
    // Gated server: orders are NEVER readable without the admin token.
    const gated = createCopilotServer({
      dataFile: path.join(dir, 'gated.json'),
      adminToken: 'real-admin-token',
      allowUnauthenticatedAdmin: false,
    });
    gated.server.listen(0, () => {});
    try {
      const gatedBase = `http://127.0.0.1:${gated.server.address().port}`;
      const noAuth = await fetch(`${gatedBase}/api/admin/orders`);
      assert.equal(noAuth.status, 401);
      const wrong = await fetch(`${gatedBase}/api/admin/orders`, { headers: { authorization: 'Bearer wrong' } });
      assert.equal(wrong.status, 401);
      const good = await fetch(`${gatedBase}/api/admin/orders`, { headers: { authorization: 'Bearer real-admin-token' } });
      assert.equal(good.status, 200);
    } finally { gated.server.close(); }

    // Seed two orders directly in the store (unit-level fixture, no payment flow).
    main.store.addOrder({ id: 'ord_test_a', accountId: 'acc_x', packageKey: 'quota-3b-90d', planName: '3B', quota: '3B usage', amount: 10000, currency: 'IDR', status: 'PENDING', createdAt: Date.now() - 5000, expiredAt: Date.now() + 86400000 });
    main.store.addOrder({ id: 'ord_test_b', accountId: 'acc_x', packageKey: 'quota-3b-90d', planName: '3B', quota: '3B usage', amount: 10000, currency: 'IDR', status: 'PAID', createdAt: Date.now() - 1000, paidAt: Date.now(), expiredAt: Date.now() + 86400000 });

    const res = await fetch(`${base}/api/admin/orders`, { headers: { authorization: 'Bearer test-admin' } });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.total >= 2);
    // Sanitized fields only; no payment credentials / QR payloads.
    const raw = JSON.stringify(data);
    assert.ok(!raw.includes('qrImage') && !raw.includes('apiKey') && !raw.includes('qrUrl'));
    for (const key of ['id', 'packageKey', 'amount', 'status', 'createdAt']) {
      assert.ok(key in data.orders[0], 'exposes ' + key);
    }
    // Status filter works.
    const paid = await fetch(`${base}/api/admin/orders?status=PAID`, { headers: { authorization: 'Bearer test-admin' } });
    const paidData = await paid.json();
    assert.ok(paidData.orders.length >= 1);
    assert.ok(paidData.orders.every((o) => o.status === 'PAID'));
    // Newest first.
    const desc = data.orders.map((o) => o.createdAt ?? 0);
    assert.deepEqual(desc, [...desc].sort((a, b) => b - a));
    // Bounded limit param respected.
    const capped = await fetch(`${base}/api/admin/orders?limit=1`, { headers: { authorization: 'Bearer test-admin' } });
    assert.equal((await capped.json()).orders.length, 1);
  } finally {
    main.server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
