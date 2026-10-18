// A-08 regression: quota accounting must survive retention of usage[] history.
//
// The defect: usageTotals() summed the entire per-license history, so the only
// way to bound store growth was to prune rows — which would silently under-count
// usage and hand customers free tokens. Quota correctness was coupled to how
// much history happened to be retained.
//
// The fix: a durable per-license cumulative counter, kept in step with every
// usage transition, that quota reads instead of scanning history.
//
// These tests pin the invariants:
//   1. The counter equals the row-derived total (no drift on any transition).
//   2. reserved -> ok charges the real total, not reservation + total.
//   3. reserved -> error releases the reservation entirely.
//   4. Repeated updates cannot double-count.
//   5. Pruning usage[] does NOT reduce the quota total (the whole point).
//   6. A pre-counter store self-heals on load.
//   7. Counters never go negative.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonStore } from '../src/store.js';

function tmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a08-'));
  return path.join(dir, 'store.json');
}

const LIC = 'lic_a08_test';

function reserve(store, requestId, reservedTokens) {
  store.addUsageRecord({
    requestId,
    licenseId: LIC,
    status: 'reserved',
    reservedTokens,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    createdAt: Date.now(),
  });
}

function settleOk(store, requestId, input, output) {
  store.updateUsageRecord(requestId, {
    status: 'ok',
    inputTokens: input,
    outputTokens: output,
    totalTokens: input + output,
    reservedTokens: 0,
    completedAt: Date.now(),
  });
}

test('A-08: a settled request charges its real total', () => {
  const store = new JsonStore(tmpStore());
  reserve(store, 'r1', 500);
  settleOk(store, 'r1', 120, 80);
  const totals = store.usageTotals(LIC);
  assert.equal(totals.usedTokens, 200, 'charges 120+80, not the 500 reservation');
  assert.equal(totals.requestCount, 1);
});

test('A-08: reserved requests count their reservation (quota bypass guard)', () => {
  const store = new JsonStore(tmpStore());
  reserve(store, 'r1', 750);
  const totals = store.usageTotals(LIC);
  assert.equal(totals.usedTokens, 750, 'in-flight reservation must count');
  assert.equal(totals.requestCount, 0, 'reservation is not a completed request');
});

test('A-08: a failed request releases its reservation entirely', () => {
  const store = new JsonStore(tmpStore());
  reserve(store, 'r1', 900);
  store.updateUsageRecord('r1', {
    status: 'error',
    reservedTokens: 0,
    completedAt: Date.now(),
    errorClassification: 'upstream_error',
  });
  const totals = store.usageTotals(LIC);
  assert.equal(totals.usedTokens, 0, 'failed requests are never charged');
  assert.equal(totals.requestCount, 0);
});

test('A-08: repeated updates cannot double-count', () => {
  const store = new JsonStore(tmpStore());
  reserve(store, 'r1', 300);
  settleOk(store, 'r1', 100, 50);
  const first = store.usageTotals(LIC);
  // Re-applying the same terminal patch must be idempotent.
  store.updateUsageRecord('r1', { status: 'ok', totalTokens: 150, reservedTokens: 0 });
  const second = store.usageTotals(LIC);
  assert.equal(second.usedTokens, first.usedTokens, 're-patching must not add tokens again');
  assert.equal(second.requestCount, first.requestCount);
  assert.equal(second.usedTokens, 150);
});

test('A-08: counter matches the row-derived total after mixed traffic', () => {
  const store = new JsonStore(tmpStore());
  reserve(store, 'a', 100); settleOk(store, 'a', 40, 60);   // +100
  reserve(store, 'b', 200); settleOk(store, 'b', 50, 50);   // +100
  reserve(store, 'c', 400); store.updateUsageRecord('c', { status: 'error', reservedTokens: 0 }); // +0
  reserve(store, 'd', 70);                                  // +70 still in flight
  store.addUsageRecord({ requestId: 'e', licenseId: LIC, status: 'rejected', errorClassification: 'ai_disabled' }); // +0

  const counter = store.usageTotals(LIC);
  const derived = store._recomputeUsageCounters()[LIC];
  assert.equal(counter.usedTokens, derived.usedTokens, 'counter must equal row-derived total');
  assert.equal(counter.requestCount, derived.requestCount);
  assert.equal(counter.usedTokens, 270, '100 + 100 + 0 + 70 + 0');
  assert.equal(counter.requestCount, 2, 'only the two ok requests count');
});

test('A-08: pruning usage[] does NOT reduce the quota total', () => {
  const store = new JsonStore(tmpStore());
  reserve(store, 'a', 100); settleOk(store, 'a', 40, 60);
  reserve(store, 'b', 200); settleOk(store, 'b', 50, 50);
  const before = store.usageTotals(LIC);
  assert.equal(before.usedTokens, 200);

  // Simulate archival: drop every retained usage row, then reload from disk.
  store.data.usage = [];
  store._save();
  const reloaded = new JsonStore(store.filePath);
  const after = reloaded.usageTotals(LIC);

  assert.equal(
    after.usedTokens,
    before.usedTokens,
    'archiving history must not grant the customer a fresh quota',
  );
  assert.equal(after.requestCount, before.requestCount);
});

test('A-08: a store written before counters existed self-heals on load', () => {
  const file = tmpStore();
  // Legacy shape: usage rows, no usageCounters key.
  fs.writeFileSync(
    file,
    JSON.stringify({
      accounts: [], licenses: [], orders: [], heartbeats: [], notifications: [], adminNotifications: [], settings: {},
      usage: [
        { requestId: 'a', licenseId: LIC, status: 'ok', totalTokens: 300, reservedTokens: 0 },
        { requestId: 'b', licenseId: LIC, status: 'ok', totalTokens: 200, reservedTokens: 0 },
      ],
    }),
  );
  const store = new JsonStore(file);
  assert.equal(store.usageTotals(LIC).usedTokens, 500);
  assert.equal(store.usageTotals(LIC).requestCount, 2);
  // And the repair is persisted, so it survives the next restart.
  const persisted = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(persisted.usageCounters[LIC].usedTokens, 500);
});

test('A-08: counters never go negative', () => {
  const store = new JsonStore(tmpStore());
  store._bumpUsageCounter(LIC, -999, -999);
  const totals = store.usageTotals(LIC);
  assert.equal(totals.usedTokens, 0);
  assert.equal(totals.requestCount, 0);
});

test('A-08: licenses are counted independently', () => {
  const store = new JsonStore(tmpStore());
  reserve(store, 'a', 100); settleOk(store, 'a', 10, 10);
  store.addUsageRecord({ requestId: 'z', licenseId: 'lic_other', status: 'ok', totalTokens: 999, reservedTokens: 0 });
  assert.equal(store.usageTotals(LIC).usedTokens, 20);
  assert.equal(store.usageTotals('lic_other').usedTokens, 999);
});
