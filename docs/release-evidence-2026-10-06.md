# Isolated Release Evidence — gRouter Copilot

Date: 2026-10-06 (superseded snapshot refreshed 2026-10-07)
Scope: install-to-chat proof, P0 acceptance/security, onboarding DX, order/license security, docs reconciliation.

## Verified locally

- Root suite: `NODE_ENV=test node --test` — 112 passed, 0 failed (2026-10-07; was 111).
- Backend suite: `NODE_ENV=test node --test` — 55 passed, 0 failed (2026-10-07; was 54).
- Admin auth sweep: all 9 admin routes 401 without/wrong Bearer token; 200 with the correct token.
- Order ownership: authenticated account receives 404 for another account's order; `/api/orders/latest` empty for a fresh account.
- Context redaction: `gRouter-` provider keys (digit-bearing) scrubbed from skill data before the model sees them; product name `gRouter-copilot` unaffected.
- streamChat license gate: `run.failed`/`SCOPE_DENIED` with zero prior events when unlicensed; complete stream when licensed.
- CLI install: failure path exits 1 with no scaffold; reinstall over a public-key-only `.env` still writes `GROUTER_LICENSE` (exact-key matching).
- Local package tarball verification: `npm pack --dry-run` lists 14 self-contained runtime files; extracted package imports successfully and CLI `init` scaffolds a clean Node app without installing dependencies.
- Isolated customer E2E: `server/test/customer-register-to-chat.e2e.test.js` — 1 passed, 0 failed; register → server-priced checkout → upstream-verified settlement → operator binding → real CLI HTTP install → heartbeat → FakeSupplier chat, all without live payment/supplier calls.
- Changed JavaScript syntax checks — passed.
- `git diff --check` — pass.
- Isolated `/api/resolve` adversarial probe: supplied `baseUrl=https://attacker.invalid` is ignored; response uses server-resolved provider base URL.
- Local read-only smoke (2026-10-07): FE `localhost:4601` `/`, `/copilot`, `/api/plans` 200; BE `/api/plans` 200; plan count 3; PM2 `copilot-backend` + `copilot-frontend` online.
- Non-destructive runtime restart (2026-10-06): `pm2 restart copilot-backend --update-env`; FE/BE `/api/plans` 200 after bounded readiness wait.
- `npm audit --omit=dev --audit-level=high` was attempted but blocked with `ENOLOCK` because the repo has no lockfile. No lockfile/install was created.
- Credential-pattern scan of the full diff: no real credential values; only fake test fixtures (`sweep-token-1`, `gRouter-abc123`) inside isolated test files.
- No npm install, database migration, production data write, commit, or push performed.
- No live gRouter supplier call was made; supplier coverage uses fake adapters/fake fetch.

## Implemented safety/product fixes

1. Public `createCopilot()` now installs a default fail-closed `LicenseGate` while preserving injected adapter/gate seams.
2. Context builder enforces `maxContextBytes` by shrinking data before adapter invocation; it no longer only labels oversized context as partial.
3. Public v1 chat/skill/adapter contract constants and response/SSE contract tests were added.
4. `/api/resolve` returns public verifier material; CLI persists it as escaped `GROUTER_LICENSE_PUBLIC_KEY` so offline verification works after install. Private signing material and provider credential remain protected.
5. P0 requirements traceability now records acceptance tests and failure responses.
6. Heartbeat telemetry `baseUrl` is normalized to bounded HTTP(S) URLs; invalid schemes are stored as null.
7. (2026-10-07) Context redaction now scrubs `gRouter-`-format provider keys and `grouterApiKey`/`grouter_api_key` keys, not only `sk-` tokens.
8. (2026-10-07) CLI `.env` merge uses exact-key matching — a pre-existing `GROUTER_LICENSE_PUBLIC_KEY` no longer suppresses writing `GROUTER_LICENSE` on install/renewal.
9. (2026-10-07) Admin routes fail closed without `ADMIN_TOKEN` unless the caller explicitly opts into test/development fallback; production server boot fails closed without a persisted license keypair.

## Readiness matrix

| Surface | Implemented | Tested | Isolated/runtime evidence | Production enabled |
|---|---|---|---|---|
| License gate + factory | yes | yes | root tests 112/112; chat+stream gate; fake signed licenses | no external package release |
| Context budget/redaction | yes | yes | max rows/bytes + fail-closed envelope + `gRouter-` key redaction tests | no live supplier |
| Resolve/key handoff | yes | yes | handoff + attacker baseUrl regression | no live customer install |
| Heartbeat telemetry | yes | yes | HTTP(S) normalization regression; backend 55/55 | no production rollout |
| Payment/order entitlement | yes | yes | fake KlikQRIS/order tests; ownership 404 regression | KlikQRIS production pending |
| Admin/settings security | yes | yes | auth/masking/SSOT tests + 9-route auth sweep + missing-token fail-closed regression | production credentials pending |
| Onboarding CLI | yes | yes | success/failure/reinstall env regression | public npm package unpublished |
| PM2 runtime | yes | yes | backend restart; FE/BE plans 200 | deployment cutover pending |
| OMC aggregate ledger | artifacts exist | blocked | Claude goal snapshot unavailable | not applicable |
| npm dependency audit | not established | blocked | `ENOLOCK`, no lockfile | release gate pending |


- Runtime PM2 restart on the current host is verified; production deployment/cutover remains pending.
- Live-domain smoke against `copilot.grouter.id` (root, `/copilot`, and `/api/plans`) returned HTTP 200; no production supplier/payment call was made.
- Public npm package publish/clean external install remains unverified.
- Isolated customer purchase→install→host chat E2E is now proven by `server/test/customer-register-to-chat.e2e.test.js` using fake KlikQRIS/FakeSupplier; real payment/domain E2E remains pending.
- KlikQRIS production credentials/mode and Better Auth production configuration remain operator-owned gates.
- Claude `/goal` snapshot/checkpoint was not fabricated; OMC aggregate ledger remains active and must be reconciled by the active Claude session before final ultragoal completion.

## Isolated smoke steps (no production writes)

1. `NODE_ENV=test node --test` from repo root → expect 112 pass / 0 fail.
2. `NODE_ENV=test node --test` from `server/` → expect 55 pass / 0 fail.
3. `NODE_ENV=test node --test test/customer-register-to-chat.e2e.test.js` from `server/` → expect 1 pass / 0 fail.
4. `node --check` each changed JS file (JSX excluded) → no output = OK.
5. Read-only runtime smoke: `curl -o /dev/null -w '%{http_code}' http://localhost:4601/` → 200; same for `/copilot` and `/api/plans`; `http://localhost:4600/api/plans` → 200; plan count 3.
6. Install-path smoke without a server: run `bin/grouter-copilot.js install` against a mocked `/api/resolve` (pattern in `test/cli-install.test.js`) in a temp dir; assert `.env` gains `GROUTER_LICENSE`, `GROUTER_API_KEY`, `GROUTER_BASE_URL`, `GROUTER_LICENSE_PUBLIC_KEY` and stdout never contains the provider key.

## Rollback checklist

- Do not restart production for this checkpoint (no activation, no PM2 restart, no commit, no push).
- Inventory first: `git status --short` + `git diff --stat` — distinguish this session's edits from pre-existing dirty files.
- Revert only this session's files if needed: `src/runtime/context.js`, `bin/grouter-copilot.js`, `test/context.test.js`, `test/cli-install.test.js`, `test/license-gate-runtime.test.js`, `test/runtime.test.js`, `server/test/server.test.js`, `server/test/orders-ownership.test.js`, plus docs snapshots (`docs/20`, `docs/release-evidence-2026-10-06.md`, `README.md`).
- Preserve pre-existing dirty files: `MEMORY.md`, `README.md` path fixes, handoffs, `server/src/server.js` settings/heartbeat wiring, `server/test/{handoff,server,settings-wiring}.test.js` earlier additions, `src/index.js`, `src/license/gate.js`, earlier `src/runtime/context.js` budget work, `.omc/`, `AGENTS.md`, untracked test/protocol files.
- `server/test/orders-ownership.test.js` is a new file — removal is a clean revert.
- After any rollback: re-run both suites and `git diff --check`.

## Exact remaining external actions (PO/operator-owned)

1. `NODE_ENV=production` (or unset) requires `LICENSE_PRIVATE_KEY_PEM` + `LICENSE_PUBLIC_KEY_PEM` or persisted `server/data/keys/license-{private,public}.pem`; missing material fails startup.
2. `ADMIN_TOKEN` is required for admin routes outside explicit test/development fallback.
3. `KLIKQRIS_MODE=production` + production API key/merchant ID in `server/.env` (never committed).
4. Persist the license keypair: set `LICENSE_PRIVATE_KEY_PEM`/`LICENSE_PUBLIC_KEY_PEM` before any real license is issued (ephemeral dev keys are regenerated per restart).
5. Set a production `ADMIN_TOKEN` in `server/.env`.
6. Publish the npm package (`@grouter/copilot`) — `npx` install path is unverified until published.
7. External E2E: real purchase → operator binds a gRouter key to the license → `npx @grouter/copilot install` on a host app → host chat answers from real data.
8. Live-domain smoke against `copilot.grouter.id` after deployment cutover; only then `pm2 restart` with `--update-env` per runbook.
9. Dependency audit stays blocked until a lockfile exists (`ENOLOCK`); decide lockfile policy (repo is intentionally zero-dependency on the server; the plugin package may need one at publish).
