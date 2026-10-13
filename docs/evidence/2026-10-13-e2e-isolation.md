# Evidence — E2E fully isolated from production (P0)

- **Date:** 2026-10-13 (UTC)
- **Host:** single dev+prod host `/home/ubuntu/grouter_copilot`
- **Severity:** P0 (production data integrity)
- **Status:** FIXED and verified with real execution + production hash comparison.
- **Commit:** `859259f` (feat(P0): fully isolate E2E from production)

## Defect

`npm run e2e` (`scripts/run-e2e.sh`) required the LIVE production services to be up
(`curl ... http://localhost:4600/api/health` + `:4601/app/`), read the production
`ADMIN_TOKEN` from `server/.env`, and ran Playwright against `http://localhost:4601`.
Every run created QA accounts/orders/licenses **in production**. The earlier auth-DB
isolation fix covered in-process server tests but neither E2E nor `store.json`.

## Fix — architecture

`npm run e2e` now boots a **disposable isolated instance** and tears it down:

```
scripts/run-e2e.sh
  └─ node e2e/isolated/run.mjs                 # boots instance → runs Playwright → always stops
       ├─ e2e/isolated/instance.mjs            # lifecycle: temp dir, synth auth DB, spawn, health, stop
       │    ├─ e2e/isolated/guard.mjs          # fail-closed config validation (choke point)
       │    ├─ e2e/isolated/test-backend.mjs    # real createCopilotServer + injected mock fetch
       │    └─ e2e/isolated/test-frontend.mjs   # real createFrontendServer → isolated backend
       └─ e2e/isolated/mock-upstream.mjs       # KlikQRIS + gRouter responses, no network
```

Properties:
- **Synthetic auth DB** — built from `better-auth` migrations (all tables, **0 rows**),
  never a copy of production. No customer data enters the test env.
- **Synthetic store** — temp `store.json` seeded with a self-defined plan catalogue.
- **Mock upstream** — the single injected `fetch` answers KlikQRIS create/status and
  gRouter chat/usage; **any unexpected outbound call throws** (a real provider call
  cannot slip through).
- **No `.env` load** — the children never `loadEnv()`, so no production credential is read.
- **Ports 4690/4691** — never 4600/4601.
- **Cleanup on every exit path** — success, failure (thrown error), and SIGINT/SIGTERM
  all remove the run dir and kill both children.

### Guard (fail-closed) — `e2e/isolated/guard.mjs`

Refuses to start unless ALL hold: `NODE_ENV=test`; mock upstream injected; ports are
non-production and distinct; `DATA_FILE`/`AUTH_DB_FILE` live OUTSIDE `server/data/` and
inside the run dir; base URL is loopback; payment mode ≠ `production`.

### Suite-level guard — `e2e/helpers.mjs`

The mutating spec helper refuses to load unless `E2E_ISOLATED=1` and the base URL host
is loopback.

## Evidence

### 1. Isolated E2E run — 22/22 pass

```
$ npm run e2e            # (bash scripts/run-e2e.sh)
[e2e-iso] isolation guard: PASS
[e2e-iso] auth schema: synthesised (.../copilot-e2e-iso-XXXX/data, 0 rows, no production copy)
[test-frontend] isolated Copilot frontend listening on http://localhost:4691
[test-backend]  isolated Copilot backend  listening on http://localhost:4690
[e2e-iso] both isolated services healthy
...
  22 passed (3.1m)
EXIT=0
```

### 2. Production UNCHANGED (the invariant that matters)

```
# before → after (identical)
560c1f8acb788f327a6cdbacb75e4d4f9238a207322e0bd4491c455beb1950bf  server/data/auth.sqlite
f6793e6eba7f985ec3d8868f80fd1ba754c74356ab9c5efe023f6b39a6c55e1c  server/data/store.json

auth users: 3   accounts 3   licenses 2   orders 6   usage 185   notif 1   # unchanged
```

No QA account/order/license/usage/notification was added to production.

### 3. Guard refuses a production-shaped config (11 violations)

```
$ node -e "collectViolations({nodeEnv:'production', mockUpstream:false, backendPort:4600,
  frontendPort:4601, dataDir:'.../server/data', baseUrl:'https://copilot.grouter.id',
  klikqrisMode:'production', ...})"
VIOLATIONS=11
  - NODE_ENV must be 'test' (got "production")
  - mock upstream fetch is NOT injected (real provider calls would be possible)
  - backendPort 4600 is invalid or a production port (4600/4601)
  - frontendPort 4601 is invalid or a production port (4600/4601)
  - dataDir ... resolves INSIDE the production data dir
  - dataFile ... resolves INSIDE the production data dir
  - authDbFile ... resolves INSIDE the production data dir
  - baseUrl host copilot.grouter.id is not loopback — refuses to target a remote/production origin
  - baseUrl host copilot.grouter.id is a production host
  - baseUrl port 443 does not match the isolated frontendPort 4601
  - KLIKQRIS mode is 'production' — real-money mode is never allowed in E2E
```

### 4. Suite refuses a non-isolated invocation

```
$ E2E_ISOLATED='' E2E_BASE_URL=http://localhost:4601 node -e "import('e2e/helpers.mjs')..."
REFUSED: E2E refused: E2E_ISOLATED!=1. This mutating suite must run against the isolated...

$ E2E_ISOLATED=1 E2E_BASE_URL=https://copilot.grouter.id node -e "import('e2e/helpers.mjs')..."
REFUSED: E2E refused: base URL host "copilot.grouter.id" is not loopback
```

### 5. Cleanup on the FAILURE path

```
$ node -e "instance.start(); throw new Error('simulated failure'); instance.stop()"
RUN_DIR=.../copilot-e2e-iso-AoGGwl
DIR_EXISTS_AFTER_STOP=false
[5] leftover run dirs after failure path: NONE (clean)
```

Ports 4690/4691 released; no leftover run dirs under the temp root.

### 6. Regression test

`test/e2e-isolation-guard.test.js` — **10/10 pass** (root suite now 105/105). Proves the
guard refuses: production ports, prod data paths, `NODE_ENV≠test`, non-loopback URL,
missing mock, production payment mode, external data paths.

### 7. Read-only production smoke (separate, non-mutating)

`npm run smoke:live` → all ✔ (BE health 200, FE root 200, /app/ 200, public health 200,
public root 200, plans 200, admin 401 without token). `RESULT: PASS`.

## Idempotence / no repetitive cleanup

E2E no longer creates production residue, so NO post-run production purge is required.
The auth/store sweeper scripts remain only as housekeeping tools for pre-existing residue.

## Files

- **Added:** `e2e/isolated/{guard,mock-upstream,instance,test-backend,test-frontend,run}.mjs`,
  `scripts/e2e-smoke-live.sh`, `test/e2e-isolation-guard.test.js`, this file
- **Modified:** `scripts/run-e2e.sh` (isolated default), `e2e/helpers.mjs` (isolation assertion),
  `package.json` (`e2e`, `smoke:live`, `test:server` scripts)
- **Docs:** `docs/25-pending-implementations.md`, `docs/TESTING-GUIDE.md`,
  `docs/20-requirements-traceability.md`
