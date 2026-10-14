# Evidence — E2E instance ownership & identity hardening (P0)

- **Date:** 2026-10-14 (UTC)
- **Host:** single dev+prod host `/home/ubuntu/grouter_copilot`
- **Runtime:** Node v26.7.0 (`node:sqlite` unflagged), pnpm 10.34.6
- **Scope:** close the port-ownership + instance-identity gap in the isolated E2E
  runner, prove the DUT is the process the runner spawned, and prove production
  is untouched by any test run.

## 1. Defect (proven by regression, not assumed)

`e2e/isolated/instance.mjs` `waitForHealth()` accepted **any HTTP status < 500**
as "healthy" and never verified *who* answered:

```js
const res = await fetch(url, ...);
if (res.status >= 200 && res.status < 500) return true;   // ← original
```

Consequence: with backend/frontend pinned to fixed ports 4690/4691, if a port was
already taken the child failed to `listen()` while the probe happily accepted the
**foreign** server's response — so Playwright could run against the wrong origin.

## 2. Fix

**A. Port preflight (fail-closed).** Before spawning anything, both ports are
probed with a real `net` bind. A conflict is a hard failure that names the
offending port. The foreign process is never killed; there is no fallback to the
production ports 4600/4601.

**B. Instance identity (per-run nonce).** Each run generates
`E2E_INSTANCE_ID = 'e2e-' + 16 random bytes` and hands it to both children.
- Backend `GET /api/health` echoes `instanceId` **only** when
  `NODE_ENV=test` **and** the nonce is set (`server/src/server.js`).
- Frontend `GET /__e2e/id` (test-only; plain 404 in prod) returns
  `{ instanceId, backendInstanceId }` — `backendInstanceId` is read from the
  backend the frontend proxies to.
- The runner refuses to proceed unless BOTH echo its nonce AND the frontend
  reports a `backendInstanceId` equal to it — proving the frontend is wired to
  *our* backend, not another instance.

**C. Cleanup on every path.** Children + run dir are torn down on startup
failure, test failure, exception, SIGINT, SIGTERM; `stop()` is idempotent.

**D. Config fail-closed.** `playwright.config.mjs` now refuses to even load
unless `E2E_ISOLATED=1` + a loopback `E2E_BASE_URL` are set, so a bare
`npx playwright test` can never point at localhost:4601.

## 3. Regression tests (real processes + real sockets)

`test/e2e-isolation-hardening.test.js` — 8 tests, all spawning actual node
processes and binding real TCP ports:

| # | Scenario | Assertion |
|---|---|---|
| 1 | Both ports free | instance starts; backend + frontend echo our nonce |
| 2 | Backend port occupied by foreign server | startup refused, error names the port, **foreign server survives** |
| 3 | Frontend port occupied | startup refused safely; foreign survives |
| 4 | Health answers 200 but **wrong** instance id | identity probe rejects (never silently accepts a 200) |
| 5 | Frontend healthy but wired to a **foreign backend** | rejected (`backendInstanceId` mismatch) |
| 6 | Startup identity failure after spawn | children killed, temp dir removed, ports released |
| 7 | Playwright finds no tests (exit≠0) | runner still tears the instance down, ports released |
| 8 | `stop()` idempotency | second `stop()` is a no-op |

`test/e2e-mock-upstream.test.js` — 4 tests: known provider endpoints answer
deterministically; an **unexpected outbound request THROWS** (no silent egress);
`playwright.config` refuses a bare run and refuses a non-loopback base URL.

**RED→GREEN:** on the pre-hardening `instance.mjs` the hardening suite fails to
even import (0/1); after the fix all 12 tests pass.

```
$ NODE_ENV=test node --test test/e2e-isolation-hardening.test.js
✔ both ports free → isolated instance starts and self-identifies
✔ backend port occupied → startup refused; foreign server keeps running
✔ frontend port occupied → startup refused safely
✔ healthy-but-impostor instance id → identity probe rejects
✔ frontend pointing at a foreign backend → rejected
✔ startup identity failure cleans up children and the temp run dir
✔ runner tears down the instance even when Playwright finds no tests (exit!=0)
✔ stop() is idempotent (safe to call twice)
ℹ tests 8  ℹ pass 8  ℹ fail 0
```

## 4. Production integrity (before / after the full matrix)

| Fingerprint | Before | After |
|---|---|---|
| `server/data/store.json` sha256 | `f6793e6eba7f…` | `f6793e6eba7f…` |
| `server/data/auth.sqlite` sha256 | `560c1f8acb78…` | `560c1f8acb78…` |
| accounts / licenses / orders | 3 / 2 / 6 | 3 / 2 / 6 |
| usage / notifications | 185 / 1 | 185 / 1 |

- Isolated E2E (22/22) left **0** leftover `/tmp/copilot-e2e-iso-*` dirs and
  ports 4690/4691 free.
- Production `GET /api/health` does **not** expose `instanceId` (verified live).
- Read-only live smoke PASS; prod health 200 (BE, FE, public origin).

## 5. Not independently verifiable here

- GitHub Actions execution: the workflow is committed but cannot be run on this
  host; it is reviewed for correctness (pnpm lockfile, `npm ci` in `server/`,
  Playwright install) but its green status must be confirmed by GitHub.
