# Task: close 6 verified test/security gaps (gRouter Copilot)

Repo: /home/ubuntu/grouter_copilot — Node 18+, ESM, zero-dependency product code; tests use `node:test` + `node:assert/strict`.

## STRICT CONSTRAINTS
- Do NOT `git commit` or `git push`.
- Do NOT run `npm install`. Do NOT add any dependency.
- Only modify the files listed below. Do NOT touch `server/data/`, `server/.env`, any `.env`, `docs/`, `.omc/`, `MEMORY.md`, `AGENTS.md`.
- The working tree already contains intentional uncommitted changes. Do NOT revert, reformat, or "clean up" anything existing — only make additive changes described here.
- No secrets anywhere: use only fake values like `gRouter-abc123`, `sweep-token-1`.
- Do not fabricate results. Every claim in your final report must come from a command you actually ran.
- Match existing code style exactly (ESM imports, 2-space indent, JSDoc where present, comment density of surrounding code).

## Verification commands (run at the end)
- From repo root: `node --test` — all pass, 0 failures.
- From `server/`: `node --test` — all pass, 0 failures.
- `node --check` on every changed JS file (JSX/build-tool files excluded).
- Report the exact pass/fail counts you observed.

## CHANGE 1 — Redact gRouter provider keys in model context (security fix)
File: `src/runtime/context.js`
- The real gRouter provider key format is `gRouter-...` (NOT `sk-`). `redactValue()` currently scrubs only `sk-` tokens, so a provider key inside skill data would reach the model context unredacted.
- Add a second string-scrub pattern: `/\bgRouter-(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{6,}\b/g` replaced with `'[REDACTED]'`. The digit requirement is deliberate and must stay: the product-name string `gRouter-copilot` contains no digit and must NOT be redacted.
- Also add `grouterapikey` and `grouter_api_key` to `RESTRICTED_KEYS` (the set is matched lowercased).

File: `test/context.test.js` — add:
- Unit test: `redact({ note: 'bound key gRouter-abc123 here', ref: 'gRouter-copilot init', nested: { grouterApiKey: 'gRouter-x9y8z7w6' } })` → `note === 'bound key [REDACTED] here'`, `ref` unchanged, `nested.grouterApiKey === '[REDACTED]'`.
- buildContext end-to-end test: skill data `{ note: 'key gRouter-abc12345' }` → the JSON of `messages` must not contain `gRouter-abc12345`.

## CHANGE 2 — CLI install failure path (test only)
File: `test/cli-install.test.js`
- Add a test following the existing preload/spawnSync pattern: fetch mock returns `new Response(JSON.stringify({ error: 'not activated' }), { status: 404, headers: { 'content-type': 'application/json' } })`.
- Run `bin/grouter-copilot.js install --license <any> --license-server http://license.test`.
- Assert: exit status === 1; stderr mentions the failure ('not activated' or 'License verification failed'); and NO scaffold was written — `copilot.config.js`, `skills/`, `.env` must not exist in the temp dir.

## CHANGE 3 — streamChat license-gate coverage
File: `test/license-gate-runtime.test.js`
- Add a StreamAdapter class: `async complete({messages})` returning `{answer:'ok',usage:{inputTokens:1,outputTokens:1}}` and `async *stream()` yielding `{type:'delta',text:'hi'}` then `{type:'done',usage:{inputTokens:1,outputTokens:1}}`.
- Test A: gate set (real generated public key), NO `GROUTER_LICENSE` env → `streamChat` events contain exactly one event: `run.failed` with `code === 'SCOPE_DENIED'`, and NO `run.started` event (the gate must throw before the first yield).
- Test B: gate set, valid minted license (aud `grouter-copilot`) → events include `run.started`, `answer.delta`, `run.completed`.
- Preserve the existing env hygiene (`delete process.env.GROUTER_LICENSE` after use).

## CHANGE 4 — safe error envelope coverage (R-010)
File: `test/runtime.test.js`
- Test: an adapter whose `complete()` throws `new Error('connect ECONNREFUSED 127.0.0.1:5432')` → `chat()` returns `status 'error'`, `code 'INTERNAL_ERROR'`, `message === 'An unexpected error occurred.'`, and `JSON.stringify(result)` contains no `ECONNREFUSED`.
- Test: adapter whose `stream()` throws a plain Error → `streamChat` yields a `run.failed` event with `code 'INTERNAL_ERROR'`.
- Test: a read-only skill whose `run()` throws `new Error('db down')` → `chat()` returns `code 'SKILL_FAILED'` and the JSON of the result contains no `db down`.

## CHANGE 5 — admin auth sweep (adversarial)
File: `server/test/server.test.js` — append ONE new test (do not modify `startServer()`):
- Build an isolated server: `createCopilotServer({ dataFile: path.join(mkdtempSync(...), 'store.json'), adminToken: 'sweep-token-1' })`, listen on port 0 (copy the existing local pattern).
- For EACH of these 9 routes, assert status 401 both with NO Authorization header and with a WRONG token (`Bearer wrong`):
  GET `/api/admin/stats`; GET `/api/admin/licenses`; POST `/api/admin/licenses` (body `{customer:'X'}`); POST `/api/admin/licenses/lic_x/bind` (body `{}`); POST `/api/admin/licenses/lic_x/revoke`; POST `/api/admin/orders/ord_x/settle`; GET `/api/admin/settings`; PATCH `/api/admin/settings` (body `{}`); GET `/api/admin/usage`.
- Then with the correct token: GET `/api/admin/stats` → 200 AND GET `/api/admin/usage` → 200 (proves the sweep is testing auth, not 404s).

## CHANGE 6 — order ownership is session-scoped (new file)
File: `server/test/orders-ownership.test.js` (NEW). Follow the auth-DB isolation pattern of `server/test/cost-integrity.test.js` EXACTLY: mkdtemp dir, set `process.env.AUTH_DB_FILE` BEFORE dynamically importing `../src/server.js`, copy `server/data/auth.sqlite`, clear all rows with better-sqlite3 `foreign_keys=OFF`; dummy `KLIKQRIS_API_KEY`/`KLIKQRIS_MERCHANT_ID` env at top; fake fetch for KlikQRIS.
- Seed directly: `store.addOrder({ id:'ord_other', accountId:'acc_someone_else', packageKey:'basic', amount:99000, status:'PENDING', createdAt: Date.now() })`.
- Sign up a user via `POST /api/auth/sign-up/email` (origin header `http://localhost:4601`), then:
  - GET `/api/orders/ord_other` → 404 (must NOT leak another account's order).
  - GET `/api/orders/latest` → 200 with `order === null`.
  - POST `/api/orders` with `{ amount: 1 }` → 400 (cost-integrity holds under an authenticated session).

## DEFINITION OF DONE
Both suites fully green with the new tests included; `node --check` clean; final report lists exact counts + files changed.
