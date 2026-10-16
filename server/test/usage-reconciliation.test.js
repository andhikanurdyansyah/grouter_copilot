import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assessUsageReconciliation,
  RECONCILIATION_BLOCKER,
  RECONCILIATION_STATUS,
} from '../src/usageReconciliation.js';

test('usage reconciliation remains truthfully blocked by aggregate upstream contract', () => {
  const assessment = assessUsageReconciliation();

  assert.deepEqual(assessment, {
    status: RECONCILIATION_STATUS,
    blocker: RECONCILIATION_BLOCKER,
    comparable: false,
    mutatesLedger: false,
    reason: 'gRouter /check-usage aggregates the single service credential; it cannot be attributed to a Copilot license.',
    unblockWhen: 'gRouter exposes a stable per-customer or per-request correlation field in a documented contract.',
  });
});
