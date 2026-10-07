# Requirements Traceability — gRouter Copilot

## P0 requirements

| ID | Requirement | Acceptance evidence | Failure response |
|---|---|---|---|
| R-001 | Plugin install satu command | `test/cli-install.test.js`: isolated CLI install writes server-resolved env values and never prints provider key | CLI exits non-zero and writes no scaffold when resolve fails |
| R-002 | Developer-defined skills | `test/validator.test.js`, `test/registry.test.js`: contract validation, resolution, args and execution | Invalid skills are excluded; invalid args return `SKILL_INVALID_ARGS` |
| R-003 | Chat dari data aplikasi | `test/runtime.test.js`, `test/factory-license.test.js`: skill data reaches fake adapter | Skill failure returns `SKILL_FAILED` without upstream call leakage |
| R-004 | AI consume key gRouter | `test/adapter.test.js`: fake supplier adapter contract and server handoff tests | Missing key returns `NOT_CONFIGURED`; upstream failures map to safe taxonomy |
| R-005 | Key tidak ke browser | `test/widget.test.js`, `server/test/handoff.test.js`, `server/test/settings.test.js` | Bundle/public/admin projections omit provider credentials |
| R-006 | Read-only default | `test/registry.test.js`: mutating skill rejected with `SCOPE_DENIED` | Mutation is blocked with HTTP/status-safe error |
| R-007 | Tanpa backend Copilot | `test/runtime.test.js`, factory tests: in-process runtime with fake adapter | Runtime remains local; adapter/config errors are explicit |
| R-008 | gRouter = supplier (tidak disentuh) | adapter boundary tests and read-only usage resolver tests; no gateway source/DB changes | Supplier unavailable maps to `UPSTREAM_UNAVAILABLE` |
| R-009 | Jawaban grounded (source/freshness) | `test/runtime.test.js`, `test/protocol-version.test.js`: sources propagate to response/SSE | Missing/ambiguous skill yields safe blocked/error response |
| R-010 | Error jelas & aman | `test/context.test.js` (redaction incl. `gRouter-` keys), `test/runtime.test.js` (INTERNAL_ERROR/SKILL_FAILED envelopes leak no internals) | Unknown errors become `INTERNAL_ERROR` without internals |
| R-011 | Cost terkontrol | `test/context.test.js`: maxRows and maxContextBytes are enforced, not merely reported | Context is truncated before adapter invocation |
| R-012 | Semver & protokol stabil | `test/protocol-version.test.js`: public v1 constants, response shape, SSE ordering | Contract drift fails CI tests |

## Exit criteria (development start)

- [x] Setiap P0 punya acceptance test.
- [x] Setiap P0 punya failure response.
- [x] Adapter contract stabil untuk di-fake di CI.
- [x] Skill contract + chat protocol disetujui.
- [x] Tidak ada P0 yang bergantung keputusan belum terkunci.

## Verification snapshot (isolated)

- Root: `NODE_ENV=test node --test` → 112/112 pass (2026-10-07).
- Backend: `NODE_ENV=test node --test` from `server/` → 55/55 pass (2026-10-07).
- Isolated customer E2E: `NODE_ENV=test node --test test/customer-register-to-chat.e2e.test.js` from `server/` → 1/1 pass.
- Admin auth sweep: all 9 admin routes return 401 without/wrong token; 200 with the correct token (`server/test/server.test.js`).
- Order ownership: an authenticated account gets 404 on another account's order; `/api/orders/latest` empty (server/test/orders-ownership.test.js).
- Context redaction covers `gRouter-` provider keys (digit-bearing) while the product name survives; buildContext never ships a key to the model.
- streamChat license gate: run.failed/SCOPE_DENIED before any event without a license; full stream with one.
- CLI install failure path: exit 1, no scaffold written; reinstall over public-key-only env still writes GROUTER_LICENSE.
- Syntax checks for changed JS: pass.
- `git diff --check`: pass.
- Better Auth test warnings about missing optional `BETTER_AUTH_API_KEY` remain environment warnings; no test failed.
- Isolated `/api/resolve` adversarial test confirms client-supplied base URL is ignored in favor of resolved server settings.
- Context budget test confirms oversized system/question envelopes fail closed instead of exceeding `maxContextBytes`.
- Local read-only smoke: FE 4601 root + plans and BE 4600 plans return 200; plan count 3.
- `npm audit --omit=dev --audit-level=high` could not run because there is no lockfile (`ENOLOCK`); no lockfile was generated.
