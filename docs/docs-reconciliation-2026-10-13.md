# Docs Reconciliation — 2026-10-13

> Purpose: every test-count and gate-status claim in `docs/` (and `README.md`) was checked
> against the **measured reality** on this host on 2026-10-13. Stale numbers are now either
> clearly labelled as historical snapshots or replaced with the current verified baseline.
> No source code or tests were touched. No commit/push.

## SECOND PASS (final) — re-measured 2026-10-13, HEAD `3d2bda8`

> Note: **another session was concurrently committing to this repo** during the pass, advancing
> HEAD several times (`5267959` → `42fbe93` → `f06748d` → `568cad3` → `3d2bda8`) and adding tests
> (`server/test/frontend-static-safety.test.js`, `admin-issue-plan-guard.test.js`, store-isolation
> tests). The numbers below are the **tracked-file baseline re-measured at `3d2bda8`**. If HEAD has
> moved again, re-run the two commands to refresh.

| Gate | Command | Result (HEAD `3d2bda8`) |
|---|---|---|
| Root (plugin) | `NODE_ENV=test node --test "test/**/*.test.js"` | **105 pass / 0 fail** (exit 0) |
| Backend (server), tracked tests | `cd server && NODE_ENV=test node --test $(git ls-files 'test/*.test.js')` | **118 pass / 0 fail** (exit 0) |
| Frontend typecheck | `cd frontend && npx tsc -b --noEmit` | clean (exit 0) |
| Browser E2E | `npm run e2e` | **22 tests** (11 specs × desktop+mobile); isolated run `22 passed` per `docs/evidence/2026-10-13-e2e-isolation.md` |

Both suite numbers were **re-run end-to-end** during this second pass (fresh process, exit codes
captured). The E2E *count* was verified via `... test --list` → `Total: 22 tests in 2 files`; the
E2E *pass* (22/22) is evidenced by the isolated run recorded in
`docs/evidence/2026-10-13-e2e-isolation.md`, not re-executed here.
The intermediate figures recorded earlier in this pass (server 103 → 113 → 114) were each superseded
within the same day by concurrent commits; **118 is the final measured value here**.

### Files re-corrected in the second pass (95/103 → 105/118)

| File | Old (first pass) | New (this pass) |
|---|---|---|
| `docs/docs-reconciliation-2026-10-13.md` (this file) | root 95 / server 103 "current" | superseded — see table above |
| `docs/release-evidence-2026-10-06.md` | baseline table root 95 / server 103 | → 105 / 118 |
| `docs/30-grouter-architecture-audit.md` §9 | root 95/95 + server 103/103 | → 105/105 + 118/118 |
| `docs/35-auth-flow.md` | backend 103 / plugin 95 | → 118 / 105 |
| `docs/handoff-2026-10-13.md` | root 95 (reconciliation note) | → 105; and the "run-e2e targets prod" gotcha struck as historical (E2E is now isolated) |
| `docs/handoff-2026-10-12-continuation.md` | root 95 / server 103 | → 105 / 118 |
| `docs/handoff-2026-10-12.md` | three open auth findings | RESOLVED note added (all three closed 2026-10-13) |
| `docs/12-sre-and-operations.md` §1 | "Copilot tidak menjalankan service sendiri di v1" | added correction: runs `copilot-backend`/`copilot-frontend` under pm2 |
| `docs/20-requirements-traceability.md` | baseline referenced `handoff-2026-10-13` | now points to this reconciliation file + HEAD `3d2bda8` |
| `docs/18-mvp-backlog.md` | "plugin tests 159/159" (2026-10-12) + open items 1–3 | labelled historical → 105; open items re-indexed to single list (`docs/25`) |
| `docs/17-risk-register.md` | ⚠ items floating | mapped to single list (OPEN-1/5/6/7/8 in `docs/25`) |
| `MEMORY.md` | root 95; E2E "targets prod" | → 105; E2E now isolated; pending section → single source of truth |

### Status-claim contradictions resolved in the second pass

| File | Old claim | Corrected truth (verified against code) |
|---|---|---|
| `docs/04-solution-architecture.md` §5/§6 | "`plan.quota` label deskriptif; enforcement **belum diimplementasi**"; "usage ledger Copilot (**belum ada** — GAP-002/003)" | **Implemented**: `server/src/gateway.js` enforces quota (`QUOTA_EXHAUSTED`/429), `settings.js` has numeric `quotaTokens` (3M/15M), ledger in `store.js` + `GET /api/admin/ledger` |
| `docs/08-security-privacy-threat-model.md` §1 | "usage ledger backend **belum ada**; enforcement quota backend **belum ada**" | same as above — both exist now |
| `docs/16-glossary.md` | Usage ledger "(implementasi: GAP audit)" | implemented (gateway ledger) |
| `docs/12-sre-and-operations.md` §1 | "Copilot **tidak menjalankan service sendiri** di v1" | false since Phase 0c: `copilot-backend` (:4600) + `copilot-frontend` (:4601) run under pm2 + license server + AI gateway |
| `docs/25-pending-implementations.md` §"Temuan verifikasi CLI installer" items 1–5 | five open CLI findings | all **resolved/historical** (D2/D3/D4/D5 patched + committed; dashboard token finding fixed by WS-A token recovery) |
| `docs/handoff-2026-10-13.md` gotcha | "`run-e2e.sh` menarget **prod** (`:4601`)" | historical — `859259f` made `npm run e2e` fully isolated (ports 4690/4691, fail-closed guard) |

---

## FIRST PASS (historical) — measured earlier on 2026-10-13 (pre `859259f`)

> Numbers in this section are a **historical snapshot** taken before the E2E-isolation and
> clean-room commits landed. Superseded by the second-pass table above.

## Current verified baseline (first pass — superseded, kept for history)

| Gate | Command | Result |
|---|---|---|
| Root (plugin) | `NODE_ENV=test node --test "test/**/*.test.js"` | **95 pass / 0 fail** *(historical)* |
| Backend (server) | `cd server && NODE_ENV=test node --test` | **103 pass / 0 fail** *(historical)* |
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

## Files changed (first pass — HISTORICAL; the second-pass table above supersedes the numbers)

> The rows below list the **first-pass** corrections. Numbers they cite (95/103) were later
> superseded by the second-pass re-measure (105/118) — see the top of this file.

| File | What was stale | What changed |
|---|---|---|
| `docs/release-evidence-2026-10-06.md` | root 112 / backend 55 (2026-10-07) presented as current; matrix + smoke steps repeat them | Added **"Docs reconciliation 2026-10-13"** section with the current baseline table + exact commands; labelled every in-file number as a historical snapshot and flagged the superseding baseline |
| `docs/20-requirements-traceability.md` | root 112/112, backend 55/55 (2026-10-07); "fails CI tests"; "di-fake di CI" | Marked snapshot historical, added current baseline; CI → contract test / manual `npm test` |
| `docs/30-grouter-architecture-audit.md` | root 133/133 + server 70/70 (2026-10-08); "CI/CD: tidak dibutuhkan" | Labelled historical + added 2026-10-13 baseline (95/103); noted repo has no CI workflow |
| `docs/TESTING-GUIDE.md` | "241 test"; server 88/88; root 153/153; E2E "22/22 pass" (§7, dated 2026-10-10) | Rewrote §2 counts (198 = 103+95), §7 table → current baseline with commands + note that old numbers are superseded; E2E = 22 tests (11×2) |
| `docs/TESTING-GUIDE.md` §6 | cleanup snippet used `email LIKE 'qa.%'` + direct `store.json` edit | Replaced with the canonical `server/scripts/purge-test-accounts.mjs` (dry-run default, `--apply`, backup, order/license protection) |
| `docs/handoff-2026-10-13.md` | root 86 (line 92) and root 90 (line 87) as "current" | Added dated reconciliation note: both are this-session snapshots; re-measured root = **105** (superseding the same-day 95); server 118; WS5 closed |
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

> **Updated second pass (2026-10-13):** the points below were true of the FIRST pass. Since then
> the E2E runner was made fully **isolated** (`859259f`) and the isolated `22 passed` run was
> captured in `docs/evidence/2026-10-13-e2e-isolation.md`, closing the first bullet.

- **E2E "22 passed"** — *first pass:* not independently reproduced (old runner needed live pm2).
  *Now:* run is isolated and `22 passed` is evidenced (`docs/evidence/2026-10-13-e2e-isolation.md`);
  the count (22) is also verified via `--list` → `Total: 22 tests in 2 files`.
- **Frontend `npm run build`** was not re-run during the first pass (typecheck was). **In the second
  pass typecheck WAS re-run (clean, exit 0); `npm run build` remains un-re-measured → unverified here.**
- **`README.md`**: reviewed — contains no hardcoded test-count or suite-total claim (only the
  `npm test` commands), so nothing to reconcile.
- **Historical handoffs** (`handoff-2026-10-01/02/05/08/09/11/12.md`) retain their own dated
  numbers by design; they are point-in-time records and were left as-is.
