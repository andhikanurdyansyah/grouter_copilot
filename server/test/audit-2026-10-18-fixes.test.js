/**
 * Regression tests for the 2026-10-18 full-product-readiness audit fixes:
 *  - A-01  corrupt store.json must fail closed, never silently start empty
 *  - A-02  store file is owner-only (0600) after every save
 *  - A-06  settlePaid reuses a license minted for an order whose PAID save
 *          crashed, instead of minting an orphan duplicate
 *  - A-07  mintLicense reserved claims (iat/exp) cannot be overridden by
 *          payload fields
 *  - A-10  /api/orders/latest links the order's own licenseId, not a
 *          time-window heuristic
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { JsonStore } from '../src/store.js';
import { PaymentService } from '../src/paymentService.js';
import { mintLicense, generateKeyPair } from '../../src/license/validate.js';

function tmpStore() {
  const dir = mkdtempSync(join(tmpdir(), 'audit-fix-'));
  const file = join(dir, 'store.json');
  return { dir, file, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('A-01 corrupt store file fails closed instead of silently wiping', () => {
  const { dir, file, cleanup } = tmpStore();
  try {
    writeFileSync(file, '{"licenses":[{"id":"lic_keep"}],CORRUPT');
    assert.throws(() => new JsonStore(file), /corrupt/);
    // The corrupt bytes are still on disk — nothing overwrote them.
    assert.equal(readFileSync(file, 'utf8').includes('lic_keep'), true);
  } finally {
    cleanup();
    assert.ok(dir);
  }
});

test('A-02 store file is written owner-only (0600)', () => {
  const { file, cleanup } = tmpStore();
  try {
    const store = new JsonStore(file);
    store.addLicense({ id: 'lic_mode', customer: 'Probe' });
    assert.equal(statSync(file).mode & 0o777, 0o600);
  } finally {
    cleanup();
  }
});

test('A-06 settlePaid reuses the crashed order license instead of minting an orphan', async () => {
  const { file, cleanup } = tmpStore();
  try {
    const store = new JsonStore(file);
    store.addOrder({ id: 'ord_a06', status: 'PENDING', accountId: 'acc1', packageKey: 'p1', createdAt: Date.now() });
    let issueCalls = 0;
    let seq = 0;
    const licenseService = {
      issue: (a) => {
        issueCalls += 1;
        seq += 1;
        const id = `lic_seq_${seq}`;
        store.addLicense({ id, customer: a.customer, createdAt: Date.now() });
        return { record: { id } };
      },
    };
    const svc = new PaymentService({
      store,
      licenseService,
      resolveSettings: () => ({
        plans: [{ key: 'p1', features: ['core'], expiresInDays: 30 }],
        license: { defaultFeatures: ['core'], defaultExpiresInDays: 30 },
      }),
    });
    // Crash during the second save (the PAID-marking write).
    const orig = store._save.bind(store);
    let saves = 0;
    store._save = () => {
      saves += 1;
      if (saves === 2) throw new Error('crash-during-paid-save');
      return orig();
    };
    await assert.rejects(() => svc.settlePaid('ord_a06'), /crash-during-paid-save/);
    store._save = orig;

    await svc.settlePaid('ord_a06');
    assert.equal(issueCalls, 1, 'retry must not mint a second license');
    assert.equal(store.data.licenses.length, 1);
    assert.equal(store.getOrder('ord_a06')?.status, 'PAID');
    assert.equal(store.getOrder('ord_a06')?.licenseId, 'lic_seq_1');
  } finally {
    cleanup();
  }
});

test('A-07 mintLicense reserved claims cannot be overridden by payload', () => {
  const kp = generateKeyPair();
  const expCap = Math.floor(Date.now() / 1000) + 60;
  const token = mintLicense({
    privateKeyPem: kp.privateKeyPem,
    payload: { aud: 'grouter-copilot', lic: 'lic_x', exp: 9999999999, iat: 1 },
    expiresAt: expCap,
  });
  const body = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  assert.equal(body.exp, expCap);
  assert.ok(body.iat > 1, 'iat must come from the mint call, not the payload');
});

test('A-10 settlement persists licenseId on the order for latest-order lookup', async () => {
  const { file, cleanup } = tmpStore();
  try {
    const store = new JsonStore(file);
    store.addOrder({ id: 'ord_a10', status: 'PENDING', accountId: 'acc9', packageKey: 'p1', createdAt: Date.now() });
    let seq = 0;
    const licenseService = {
      issue: (a) => {
        seq += 1;
        const id = `lic_a10_${seq}`;
        store.addLicense({ id, customer: a.customer, accountId: a.accountId, createdAt: Date.now() });
        return { record: { id } };
      },
    };
    const svc = new PaymentService({
      store,
      licenseService,
      resolveSettings: () => ({
        plans: [{ key: 'p1', features: ['core'], expiresInDays: 30 }],
        license: { defaultFeatures: ['core'], defaultExpiresInDays: 30 },
      }),
    });
    await svc.settlePaid('ord_a10');
    const order = store.getOrder('ord_a10');
    assert.equal(order?.licenseId, 'lic_a10_1', 'settle must persist the issued license id on the order');
    const linked = order?.licenseId ? store.getLicense(order.licenseId) : null;
    assert.equal(linked?.accountId, 'acc9');
  } finally {
    cleanup();
  }
});
