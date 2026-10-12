// Regression: an order must never become PAID without a license.
// Before this fix, settlePaid marked the order PAID and saved it BEFORE issuing
// the license. If issuance threw, retries were idempotent and the customer lost
// the entitlement permanently.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PaymentService } from '../src/paymentService.js';

function fakeStore(order) {
  const state = { order: { ...order }, saves: 0 };
  return {
    state,
    getOrder: (id) => (id === state.order.id ? state.order : null),
    getSettings: () => ({}),
    _save() { state.saves += 1; },
  };
}

const settings = {
  plans: [{ key: 'quota-3b-90d', name: '3B', amount: 10000, quota: '3B usage', features: ['core'], expiresInDays: 90 }],
  license: { defaultFeatures: ['core'], defaultExpiresInDays: 30 },
};

test('settle: license issuance failure leaves order PENDING; retry settles exactly once', async () => {
  const store = fakeStore({ id: 'ord_1', packageKey: 'quota-3b-90d', planName: '3B', accountId: 'acc_1', amount: 10000, status: 'PENDING' });
  let fail = true;
  let issued = 0;
  const licenseService = {
    issue() {
      if (fail) throw new Error('signing unavailable');
      issued += 1;
      return { record: { id: 'lic_1' } };
    },
  };
  const svc = new PaymentService({ klikqris: {}, licenseService, store, resolveSettings: () => settings });

  await assert.rejects(() => svc.settlePaid('ord_1'), /signing unavailable/);
  assert.equal(store.state.order.status, 'PENDING', 'order must not be PAID without a license');
  assert.equal(store.state.order.licenseId, undefined);
  assert.equal(issued, 0);
  assert.equal(store.state.saves, 0, 'nothing persisted on failed issuance');

  fail = false;
  const first = await svc.settlePaid('ord_1');
  assert.equal(first.order.status, 'PAID');
  assert.equal(first.order.licenseId, 'lic_1', 'licenseId linked to order');
  assert.equal(first.license.id, 'lic_1');

  const replay = await svc.settlePaid('ord_1');
  assert.equal(replay.license, null, 'replay is idempotent');
  assert.equal(issued, 1, 'exactly one license issued across retry + replay');
});
