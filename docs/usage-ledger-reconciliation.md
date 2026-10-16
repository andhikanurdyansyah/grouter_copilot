# OPEN-3 usage-ledger reconciliation — contract decision

## Result: blocked, not implemented as a job

The local Copilot ledger is attributable to a license (`licenseId`, request ID,
model, and token usage). The existing gRouter contract exposes
`GET /api/check-usage?key=...` for the one server-side service credential. Its
`usage.tokens` and `requests` values are aggregate infrastructure totals across
all Copilot customers. The chat contract likewise has no documented customer
or request correlation field.

Therefore an aggregate comparison such as:

```text
sum(local ledger tokens) == /check-usage usage.tokens
```

cannot prove a per-customer reconciliation. It can differ because the upstream
scope includes all traffic, and it can appear equal by coincidence. Treating
the difference as a customer discrepancy would create false billing/entitlement
signals.

## Safe slice delivered

`server/src/usageReconciliation.js` exposes `assessUsageReconciliation()`, which
returns an explicit blocked assessment. It does not fetch upstream data, compare
incomparable totals, write ledger records, or mutate production data. The
contract test pins all of those safety properties at the result boundary.

OPEN-3 is marked **BLOCKED (contract)** in `docs/25-pending-implementations.md`.
The existing `/api/admin/usage` remains infrastructure observability only; the
customer dimension remains `/api/admin/ledger`.

## Unblock criteria

Implement a real reconciliation read/job only after gRouter documents and serves
one of these stable capabilities:

1. a per-request correlation ID that is also recorded in the local ledger; or
2. a per-customer/service-scope usage dimension that maps unambiguously to a
   Copilot license or other local billing scope.

The upstream contract must define pagination/window semantics, token/request
units, reset boundaries, and consistency guarantees. Until then, do not add a
scheduled job, synthetic delta, ledger correction, or per-customer pass/fail
status.
