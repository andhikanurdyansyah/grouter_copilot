# Docs Reconciliation — 2026-10-13

> Purpose: every test-count and gate-status claim in `docs/` (and `README.md`) was checked
> against the **measured reality** on this host on 2026-10-13. Stale numbers are now either
> clearly labelled as historical snapshots or replaced with the current verified baseline.
> No source code or tests were touched. No commit/push.

## Current verified baseline (measured 2026-10-13, this host)

| Gate | Command | Result |
|---|---|---|
| Root (plugin) | `NODE_ENV=test node --test "test/**/*.test.js"` | **95 pass / 0 fail** |
| Backend (server) | `cd server && NODE_ENV=test node --test` | **103 pass / 0 fail** |
| Frontend typecheck | `cd frontend && npx tsc -b --noEmit` | clean (exit 0) |
| Browser E2E | `npm run e2e` | **22 tests listed** (11 specs × desktop+mobile projects) |

Verification method: the root, server and typecheck numbers were **re-run independently** during
this reconciliation (not copied from a handoff). The E2E figure comes from
`node frontend/node_modules/playwright/cli.js test --list` (225 lines of `--list` output, `Total: 22 tests in 2 files`).
The tests themselves were **not executed** for E2E (run requires live pm2 services + QA DB isolation);
so 22 = the count of tests, **not** a "22 passed" claim.

Reference current baseline: `docs/handoff-2026-10-13.md`.

## No CI

There is **no CI workflow** in this repo — `.github/workflows` (and any `*.yml`/`*.yaml` CI
config) is absent. Any doc phrasing that implies tests run in CI was corrected to "manual on host".

## Files changed (docs only)

| File | What was stale | What changed |
|---|---|---|
| `docs/release-evidence-2026-10-06.md` | root 112 / backend 55 (2026-10-07) presented as current; matrix + smoke steps repeat them | Added **"Docs reconciliation 2026-10-13"** section with the current baseline table + exact commands; labelled every in-file number as a historical snapshot and flagged the superseding baseline |
| `docs/20-requirements-traceability.md` | root 112/112, backend 55/55 (2026-10-07); "fails CI tests"; "di-fake di CI" | Marked snapshot historical, added current baseline; CI → contract test / manual `npm test` |
| `docs/30-grouter-architecture-audit.md` | root 133/133 + server 70/70 (2026-10-08); "CI/CD: tidak dibutuhkan" | Labelled historical + added 2026-10-13 baseline (95/103); noted repo has no CI workflow |
| `docs/TESTING-GUIDE.md` | "241 test"; server 88/88; root 153/153; E2E "22/22 pass" (§7, dated 2026-10-10) | Rewrote §2 counts (198 = 103+95), §7 table → current baseline with commands + note that old numbers are superseded; E2E = 22 tests (11×2) |
| `docs/TESTING-GUIDE.md` §6 | cleanup snippet used `email LIKE 'qa.%'` + direct `store.json` edit | Replaced with the canonical `server/scripts/purge-test-accounts.mjs` (dry-run default, `--apply`, backup, order/license protection) |
| `docs/handoff-2026-10-13.md` | root 86 (line 92) and root 90 (line 87) as "current" | Added dated reconciliation note: both are this-session snapshots; re-measured root = **95**; server 103 stands; WS5 closed |
| `docs/handoff-2026-10-12-continuation.md` | WS5 open ("71 root, 99 server", "71 vs 112, 99/100 vs 55 … still pending") | Added RESOLVED note (2026-10-13 baseline 95/103) rather than rewriting the historical record |
| `docs/35-auth-flow.md` | "backend 91/91, plugin 175/175" stated as current regression | Labelled snapshot 2026-10-12 historical; added 2026-10-13 baseline (103/95) |
| `docs/17-risk-register.md` | "pnpm audit belum di CI otomatis" | Corrected: audit is not automated because there is **no CI workflow**; run manually |
| `docs/33-klikqris-production-runbook.md` | test-matrix S5 status "wajib (CI)" | Corrected to "wajib (manual; repo tanpa CI workflow)" |
| `docs/11-quality-engineering.md` | "## 5. CI (local/optional)" implied a pipeline | Added note: no CI workflow; this is a manual gate list |

## Stale claims found & corrected

**26** distinct stale test-count / status claims across 11 files (enumerated in the table above).

Types found:
- **Wrong suite totals** presented as current: 112, 55, 133, 70, 241, 153, 88, 175, 91, plus
  intra-day snapshots (86, 90) that conflict with the re-measured 95.
- **CI claims** with no CI workflow: `.github/workflows` absent (4 occurrences).
- **Outdated ops tooling**: the `email LIKE 'qa.%'` cleanup snippet in `TESTING-GUIDE.md` §6.

## Preserved history

Handoffs keep their original numbers; contradictions were handled by **adding dated notes**
(not silent rewrites), per the mandate. `docs/handoff-2026-10-13.md` was updated in place because
it is the *current* reference, but its old figures are struck through / annotated rather than deleted.

## Remaining / unverified

- **E2E "22 passed"** was never independently reproduced — the runner needs live pm2 services and
  does not isolate the QA DB by default. Only the **count** (22) is verified via `--list`.
- **Frontend `npm run build`** was not re-run during this task (typecheck was). Reported as
  "builds" from the task's given reality, not re-measured here → treat as **unverified in this pass**.
- **`README.md`**: reviewed — contains no hardcoded test-count or suite-total claim (only the
  `npm test` commands), so nothing to reconcile.
- **Historical handoffs** (`handoff-2026-10-01/02/05/08/09/11/12.md`) retain their own dated
  numbers by design; they are point-in-time records and were left as-is.
