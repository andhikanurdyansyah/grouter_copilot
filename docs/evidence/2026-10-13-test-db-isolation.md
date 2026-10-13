# Evidence — Production DB isolation of test runs + E2E helper repair (P1)

- **Date:** 2026-10-13 (UTC)
- **Host:** single dev+prod host `/home/ubuntu/grouter_copilot`
- **Severity:** P1 (data integrity + cost-integrity)
- **Status:** FIXED and verified with a mutation proof.

## Finding 1 — `node --test` wrote QA accounts into the PRODUCTION auth DB

`server/src/auth.js` resolved the Better Auth SQLite path as
`process.env.AUTH_DB_FILE || <repo>/server/data/auth.sqlite`. Better Auth reads this
**once at import time**, and the default fell back to the **production** database even
under `NODE_ENV=test`. Any test that booted the server without setting `AUTH_DB_FILE`
therefore signed QA accounts straight into production.

Proof (before the fix) — a bare server-suite run added accounts to prod:

```
# during a suite run, new rows appeared in the production auth.sqlite every time:
lictok-1791907459049-a@gmail.com  2026-10-13T16:04:19.781Z
ntf-1791907461735@gmail.com       2026-10-13T16:04:22.427Z
...
```

This is the **root cause of the historic account accumulation** (186 QA accounts found
earlier in `server/data/auth.sqlite`) — not merely E2E, but the plain unit/integration suite.

### Fix

`server/src/auth.js` gained `resolveAuthDbFile()`:

- explicit `AUTH_DB_FILE` → used verbatim (unchanged);
- `NODE_ENV !== 'test'` → production `data/auth.sqlite` (unchanged);
- **`NODE_ENV === 'test'` and no `AUTH_DB_FILE`** → a per-process temp DB under
  `mkdtempSync(tmpdir(), 'copilot-auth-test-')`, **seeded from the prod schema with all
  rows cleared** (a bare empty file makes Better Auth throw `SchemaMismatchError` — there
  is no auto-migration).

### Verification (the invariant that matters)

```
# 1. capture prod hashes, run the FULL server suite with NODE_ENV=test, re-hash
sha256sum server/data/auth.sqlite server/data/store.json     # before
cd server && NODE_ENV=test node --test                        # 112 pass / 0 fail
sha256sum server/data/auth.sqlite server/data/store.json     # after — IDENTICAL
```

`test/auth-db-isolation.test.js` pins this permanently: it spawns a child process with the
same env a bare `node --test` has (`NODE_ENV=test`, `AUTH_DB_FILE` unset), performs a real
`/api/auth/sign-up/email`, and asserts the production `auth.sqlite` is unchanged by
**row count AND sha256**.

Mutation proof (test is not trivially green):

| state | result |
|-------|--------|
| old `auth.js` (prod default) | `✖` fail — "test run must not add users to the production auth DB" |
| new `auth.js` (test isolation) | `✔` pass |

## Finding 2 — the E2E helper targeted a UI that no longer exists

`e2e/helpers.mjs#registerViaUi` drove `#signupForm / #suEmail / #suName / #suPassword /
#registerBtn / #toSignup` — all removed when sign-up became the SPA 3-step flow at
`/login/sign-up` (`frontend/src/components/ui/sign-up.tsx`); `/login` is now sign-in-only.
Result: **6 of 22 E2E tests failed** (`locator.click: waiting for #toSignup …` timeouts and
the security-isolation test).

The checkout spec also waited for a `Bayar dengan QRIS` **button** and the text
`3B · 3 months`; the redesign made the plan card button `Beli paket` open the inline QR
dialog (`Bayar dengan QRIS` is the dialog **title**).

### Fix

- `registerViaUi` now drives `/login/sign-up` step by step (email → Enter, password →
  Enter, confirm → submit `button[aria-label="Finish sign-up"]`) and waits for `/user`.
- `customer.spec.mjs` checkout clicks `Beli paket | Perpanjang paket` and asserts the
  inline dialog title + QR image.

### Verification

```
bash scripts/run-e2e.sh --reporter=list
→ 22 passed (3.5m)     # was 16 passed / 6 failed
```

## Finding 3 — `store.json` (production) also carries QA residue

While cleaning up, the production `store.json` was found to hold QA/test accounts and
their artifacts (from E2E runs that intentionally target production):

- accounts: **44 → 41 match a test pattern** (3 real: `rrpiwpiw`, `gjproproject`, `gjproproject1`)
- orders: 23 (17 owned by test accounts) · licenses: 26 (22 with `accountId: null`,
  mostly `QA-E2E …` fixtures) · usage rows: 188 · notifications: 2 (1 test)

`purge-test-accounts.mjs` cleans the **auth** DB only, so this store-side residue is
**left untouched pending an explicit decision** (it is production data; the destructive
store cleanup needs the PO's OK — backup-first, dry-run first).

## Residual state after this session

- `server/data/auth.sqlite`: **3 real accounts** (verified), 0 test accounts.
- `server/data/store.json`: **unchanged** — 41 test-pattern accounts + their orders/licenses
  remain, pending a decision (see Finding 3).
- Backups taken: `/home/ubuntu/backups/qa-purge-20261013T165948Z/`,
  `/home/ubuntu/backups/qa-purge-20261013T170927Z/`, `/home/ubuntu/backups/qa-purge-20261013T173153Z/`.

## Files touched

- **Modified:** `server/src/auth.js` (test-DB isolation), `e2e/helpers.mjs`,
  `e2e/specs/customer.spec.mjs`, `server/scripts/purge-test-accounts.mjs` (`iso-probe-*` pattern)
- **Added:** `server/test/auth-db-isolation.test.js`, this file
