# Evidence — production-integrity fixes from the readiness audit (P1)

- **Date:** 2026-10-13 (UTC)
- **Host:** single dev+prod host `/home/ubuntu/grouter_copilot`
- **Scope:** defects found by the mandated end-to-end audit; all are internal,
  reproducible, and fixed with RED→GREEN regression tests.
- **Commits:** `42fbe93`, `5267959`, `859259f`, `0307ca9`, `f06748d`, `568cad3`

## 1. E2E ran against production (P0)

See the dedicated `docs/evidence/2026-10-13-e2e-isolation.md`. Summary: `npm run e2e`
now boots a disposable isolated instance (temp auth DB + temp store + mock upstream,
ports 4690/4691) and tears it down. Guard refuses production configs (11 violations).
E2E 22/22 pass; production `auth.sqlite` + `store.json` sha256 identical before/after.

## 2. STORE leak under NODE_ENV=test (P1) — `568cad3`

**Defect.** `createCopilotServer` defaulted `dataFile` to the PRODUCTION
`server/data/store.json` regardless of `NODE_ENV`. Any `node --test` that booted
the server without an explicit `dataFile` wrote QA licenses/orders into the live
store. **Observed live during this audit:** a new test created **7 licenses in
production** (customers `Real`/`NoPkg`/`Ghost`; prod licenses 2 → 9).

**Fix.** `resolveDataFile()` — under `NODE_ENV=test` with no explicit
`dataFile`/`DATA_FILE`, derive a per-process temp store. Production (default) is
unchanged: no `DATA_FILE` and `NODE_ENV≠test` → `server/data/store.json`.

**Regression.** `server/test/store-db-isolation.test.js` boots the server in a
child with a bare `node --test` env, issues a license, and asserts the production
`store.json` is **byte-for-byte unchanged** (sha256 + collection counts).
RED on pre-fix code (the child wrote to prod) → GREEN after.

**Cleanup.** 7 + 1 test licenses removed from prod with backups
(`/home/ubuntu/backups/iso-lic-cleanup-20261013T190357Z`,
`iso-probe-cleanup-20261013T190929Z`); prod returned to licenses 2 / accounts 3 /
orders 6 / usage 185, and the backend restarted so its in-memory copy matches disk.

## 3. Unknown planKey accepted at license issuance (P1) — `568cad3`

**Defect.** `POST /api/admin/licenses` with a `planKey` absent from the plan
catalogue returned **201** and minted a license. That license is dead on arrival
at the gateway (`PLAN_NOT_FOUND`) and, before the gateway hardening, resolved to an
**unlimited** AI policy. (Cost/entitlement integrity A3 / D-020.)

**Fix.** The issuance route now fails closed: an operator-supplied non-empty
`planKey` that does not resolve in the effective catalogue → `400`
`{ code: "PLAN_NOT_FOUND" }`. An empty/absent `planKey` stays the valid
"issued without a package" path (e.g. the Mini CRM demo). The internal
`service.issue()` contract is unchanged (tests use it directly with synthetic plans).

**Regression.** `server/test/admin-issue-plan-guard.test.js` — unknown → 400 (and
no license created), known → 201, package-less → 201. RED on pre-fix → GREEN after.

## 4. Frontend static server hung on directory paths (P1) — `42fbe93`

**Defect.** `GET /assets/` (a directory) reached `readFileSync(dir)` inside the
async request handler → `EISDIR` thrown, no catch, no response → the request
**hung** until client timeout (live: `/assets/` returned `000` after 3s; a remote
caller could stall connections with a trivial path). Same class for `/app/<dir>/`.

**Fix.** `/assets/*`: containment check + `statSync().isFile()` guard → 404 for
directories; `readFileSync` wrapped in try/catch. `/app/*`: same `isFile()` guard,
directory paths fall through to the SPA fallback / 404.

**Regression.** `server/test/frontend-static-safety.test.js` — boots the real
frontend server and asserts directory paths answer promptly. RED on pre-fix →
GREEN after.

**Deployed:** `pm2 restart copilot-frontend`. Live: `/assets/` 404 (was hang),
`/` 200, `/app/` 200, `/copilot` 200, real asset 200.

## 5. Frontend deploy was manual with no rollback (P1) — `f06748d`

**Defect.** Deploys were a manual `cp frontend/dist/. server/public/app/` with no
pruning (193 orphaned hashed assets had accumulated) and no rollback path.

**Fix.** `scripts/deploy-frontend.sh`: build → validate every referenced asset
exists → back up the current app dir → full swap (prunes orphans) → restart
`copilot-frontend` → health check `/` and `/app/` → **auto-rollback** on any
failure. Ran it: pruned 269 → 76 assets, health 200.

## Suites (measured, this host)

| Suite | Command | Result |
|---|---|---|
| Root | `NODE_ENV=test node --test "test/**/*.test.js"` | **105/105** |
| Server | `cd server && NODE_ENV=test node --test` | **118/118** |
| Isolated E2E | `npm run e2e` | **22/22** |
| Clean-room installer | `bash scripts/cleanroom-verify.sh` | **PASS** (ESM + CJS) |
| Live read-only smoke | `npm run smoke:live` | **PASS** |
| Restore drill | `bash server/scripts/restore-drill.sh` | **PASS** |

Production fingerprint unchanged across all runs:
`store.json` `f6793e6e…`, `auth.sqlite` `560c1f8a…`.
