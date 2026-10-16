/**
 * Usage-ledger reconciliation capability assessment.
 *
 * D-021 intentionally gives Copilot two different accounting dimensions:
 * the local ledger is per license, while /check-usage is an aggregate for the
 * single gRouter service credential.  Until gRouter supplies a stable
 * per-request/customer correlation field, an aggregate delta is not evidence
 * of a customer mismatch.  Keep this explicit so a future job cannot quietly
 * turn an invalid comparison into billing state.
 */

export const RECONCILIATION_STATUS = 'blocked';
export const RECONCILIATION_BLOCKER = 'upstream-aggregate-only';

/**
 * Return the current, deliberately non-mutating reconciliation assessment.
 *
 * This function does not fetch upstream data, compare totals, write ledger
 * records, or produce a pass/fail delta.  It is a contract seam for the day
 * gRouter response includes an attributable customer/request dimension.
 */
export function assessUsageReconciliation() {
  return {
    status: RECONCILIATION_STATUS,
    blocker: RECONCILIATION_BLOCKER,
    comparable: false,
    mutatesLedger: false,
    reason: 'gRouter /check-usage aggregates the single service credential; it cannot be attributed to a Copilot license.',
    unblockWhen: 'gRouter exposes a stable per-customer or per-request correlation field in a documented contract.',
  };
}
