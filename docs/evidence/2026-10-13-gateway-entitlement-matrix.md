# Evidence — Gateway entitlement & robustness matrix

Date: 2026-10-13 · Node v26.7.0 · repo `/home/ubuntu/grouter_copilot`
Author: Hermes subagent (gateway regression mandate)

## What was added

New file: `server/test/gateway-entitlement-matrix.test.js` (8 tests). Same style as
`gateway.test.js` / `gateway-failure-gaps.test.js`: in-process `createCopilotServer(...)`
with an injected fake `fetch`, no network, no real keys. Isolation: temp `DATA_FILE`
(`mkdtemp`) per test + temp `AUTH_DB_FILE` copied from the prod schema then cleared
(all rows `DELETE`d with `foreign_keys=OFF`) BEFORE the dynamic `server.js` import.
`server/data/` is never written.

| # | Test | What it pins |
|---|------|--------------|
| 1 | disallowed model | `MODEL_NOT_ALLOWED`, upstream **never called**, ledger row `rejected`/`model_not_allowed`, 0 tokens charged |
| 2 | AI-disabled plan | `AI_DISABLED`, upstream **never called**, ledger row `rejected`/`ai_disabled`, 0 tokens charged |
| 3 | invalid default model | global `provider.model` drifted OUTSIDE the package allowlist → `NOT_CONFIGURED` (fail-closed, no ledger row, no upstream); control: explicit allowlisted model still `ok` |
| 4 | quota boundary | request landing exactly on the limit `ok`(used 100/100), next denied `QUOTA_EXHAUSTED`, HTTP surface → **429** |
| 5 | concurrency | 8 parallel on a 3000 quota with 1000 reservations/usage ⇒ exactly 3 admit, charged == 3000 (never above), ledger partitions ok/rejected cleanly, no dangling `reserved`, denied rows uncharged |
| 6 | streaming path | SSE-framed upstream body (JSON + `data: [DONE]`) is parsed → canonical envelope, usage `{7,5}` ledgered, upstream request is non-stream |
| 7 | cancellation | client abort mid-flight: (a) abort + upstream failure ⇒ reservation released, 0 charge, no partial claim; (b) abort + upstream success ⇒ settles once, **full** reported usage, no dangling reservation |
| 7b| unknown planKey fail-closed | license whose `planKey` is absent from the catalogue → `PLAN_NOT_FOUND`, upstream never called, ledger `rejected`/`plan_not_found` (was a fail-open hole; see below) |
| 7c| control | explicitly package-less license (`planKey: null`) still allowed (legacy unlimited) — the fail-closed rule does not over-reach |

### What was NOT duplicated (already covered upstream)

Read first and deliberately NOT re-added: quota exhausted (existing), AI disabled at the
**HTTP/runtime** level (existing `package entitlement at runtime` covers disallowed-model +
AI-disabled + legacy-without-policy), model resolution from settings, no configured model,
upstream 500 plain-text, timeout mapping, reconciliation, revoke mid-flight, idempotent
replay, ledger endpoint. The matrix adds only genuinely-missing coverage: the **direct
`gateway.chat` ledger-row assertions**, the **quota boundary (==limit then +1)**, the
**concurrency partition invariant**, the **SSE-framed streaming tolerance**, and the
**mid-flight cancellation ledger invariants**.

## Exact commands & results

```
cd server && NODE_ENV=test node --test test/gateway-entitlement-matrix.test.js
```
→ `ℹ tests 9 · pass 9 · fail 0 · cancelled 0 · skipped 0 · todo 0` (9 = 8 matrix + 1 control)

```
cd server && NODE_ENV=test node --test
```
→ `ℹ tests 113 · pass 113 · fail 0 · cancelled 0 · skipped 0 · todo 0`
(after the auth-db isolation regression test and this file's 9th test were added)

(Pre-existing gateway suites: `gateway.test.js` + `gateway-failure-gaps.test.js` = 19 tests,
all green; with the new file the gateway group is 28/28.)

## Meaningfulness (mutation check — tests are NOT trivially green)

Sabotaged each guarded path in `server/src/gateway.js` / `src/adapter/grouter.js`, ran the
targeted test, restored (sha256 verified identical after every run):

| Mutant | Target test | Result |
|--------|-------------|--------|
| baseline (unmutated) | whole file | pass 8 / fail 0 |
| M1 allowlist check disabled | disallowed model | pass 0 / **fail 1** |
| M2 `AI_DISABLED` gate disabled | AI-disabled plan | pass 0 / **fail 1** |
| M3 drifted-default fail-closed disabled | drifted outside allowlist | pass 0 / **fail 1** |
| M4 quota-exhaustion check disabled | quota boundary + parallel | pass 0 / **fail 1** (both) |
| M6 SSE JSON extraction broken | SSE-framed | pass 0 / **fail 1** |
| M7 reservation left dangling on failure | cancellation | pass 0 / **fail 1** |

Every guarded path has a test that fails when that path is broken ⇒ the matrix is
behavioural, not green-by-construction.

## Gap that WAS closed (follow-up by supervisor, 2026-10-13)

**Unknown `planKey` → unlimited quota + no model allowlist — FIXED (fail closed).**
Originally found here as a fail-open hole: `gateway.js` resolved
`plan = (eff.plans||[]).find(p => p.key === lic.planKey)` and `resolvePlanAiPolicy(undefined, eff)`
returned the legacy branch `{enabled:true, allowedModels:null, defaultModel:null, quotaTokens:null}`
→ AI enabled, no allowlist, **unlimited** quota, upstream called. So removing/renaming a plan
silently downgraded existing licenses to "legacy unlimited".

Fix (`server/src/gateway.js` §6a): a **non-empty** `planKey` that does not resolve in the
catalogue now fails closed BEFORE any upstream call — `PLAN_NOT_FOUND` (HTTP 403, mapped in
`server/src/server.js`), ledgered as `rejected`/`plan_not_found`, 0 charge. A **null/empty**
`planKey` (the legitimate "issued without a package" path, e.g. the Mini CRM demo license)
is unchanged.

Tests (in `gateway-entitlement-matrix.test.js`):
- `unknown planKey fails CLOSED …` — error `PLAN_NOT_FOUND`, `providerCalls === 0`, ledger
  `rejected`/`plan_not_found`/0.
- `control: null planKey …` — still `ok`, provider called once, `quota.limit: null`.
- Mutation proof: reverting only `gateway.js` makes the fail-closed test **RED** while the
  control stays **GREEN**; restored → both green.

Also observed (documented, design not defect): the quota reservation is an approximation. If
per-call reservations are smaller than actual token usage, committed tokens can exceed the
quota (reproduced: 3000 quota, 2000 reservations, 4000 actual). The design comment in
`gateway.js` states this explicitly; test #5 therefore pins the invariant for the calibrated
case (reservation ≥ usage) rather than an absolute ceiling.

## Files touched

- **Added:** `server/test/gateway-entitlement-matrix.test.js`
- **Added:** `docs/evidence/2026-10-13-gateway-entitlement-matrix.md` (this file)
- **Unchanged (verified by sha256):** `server/src/gateway.js`, `src/adapter/grouter.js`,
  `server/data/`. No commit, no push.
