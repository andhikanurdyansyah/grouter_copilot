# MVP Backlog — gRouter Copilot

> Status direkonsiliasi 2026-10-12 terhadap kode aktual (commit `fd75163`,
> plugin tests 159/159 — **snapshot historis 2026-10-12**; baseline terukur
> 2026-10-13 = plugin 105/105 + server 118/118). Bukti: test files + release evidence
> `docs/release-evidence-2026-10-06.md` + `docs/docs-reconciliation-2026-10-13.md`.
> Checklist EPIC-1..6 DONE saat master
> plan Phase 0 selesai; daftar di bawah mencerminkan realita kode.

## EPIC-1 Install & scaffold — DONE

- [x] CLI `init` command. *(test/cli-install.test.js; verified — bin/grouter-copilot.js, npm pack 15 files)*
- [x] Framework detection (Next.js App Router, Pages Router, Express, plain Node).
- [x] Generate `copilot.config.js`, `.env`, `skills/`, API route, widget mount.
- [x] Install di clean project → widget muncul. *(server/test/customer-register-to-chat.e2e.test.js: real CLI HTTP install → heartbeat → chat)*

## EPIC-2 Skill system — DONE

- [x] Skill registry + validator (name, description, parameters, readOnly, run). *(test/registry.test.js, test/validator.test.js)*
- [x] Skill resolution (skillHint + intent match). *(test/runtime.test.js — ambiguous → safe error)*
- [x] Skill execution dengan arg tervalidasi + user context. *(SKILL_INVALID_ARGS taxonomy)*
- [x] Invalid skill → warn + exclude (tidak crash app). *(validator exclude path)*

## EPIC-3 Runtime chat — DONE

- [x] `/api/copilot/chat` route. *(src/runtime/chat.js + gatewayChat)*
- [x] Request validation (message, userId, sessionId). *(validateChatRequest)*
- [x] Context builder (system + data + sources, limit row/byte/token). *(test/context.test.js — maxRows, maxContextBytes fail-closed)*
- [x] Error taxonomy. *(SKILL_FAILED/INTERNAL_ERROR/SCOPE_DENIED/UPSTREAM_UNAVAILABLE/TIMEOUT/NOT_CONFIGURED; eval-fixtures)*

## EPIC-4 gRouter adapter — DONE

- [x] `complete()` + `stream()`. *(src/adapter/grouter.js)*
- [x] Timeout, retry terbatas, cancel. *(timeoutMs + AbortController → TIMEOUT retryable, fixtures 2026-10-12; cancel via signal)*
- [x] Usage (token, latency). *(input/outputTokens propagate; eval-fixtures 2026-10-12)*
- [x] Fake supplier untuk test. *(FakeSupplier)*

## EPIC-5 Widget — DONE (v1)

- [x] `CopilotChat` React component. *(src/widget/CopilotChat.jsx)*
- [x] Streaming, loading/error/empty. *(test/widget.test.js)*
- [x] Source/freshness display. *(protocol fields v1)*
- [x] Theme-aware. *(CSS variables; dark default)*

## EPIC-6 Config & safety — DONE

- [x] `copilot.config.js` (skills, model, prompt, limits). *(src/config.js, normalizeConfig)*
- [x] Key server-only + bundle scan test. *(test/widget.test.js + server/test/handoff.test.js, settings.test.js)*
- [x] Read-only enforcement + mutating gate stub. *(SCOPE_DENIED; registry rejects mutating)*

## EPIC-7 Docs & sample — PARTIAL

- [x] README + quickstart. *(README.md; registry publish masih pending kredensial publisher)*
- [ ] Sample CRM (orders summary).
- [ ] Sample POS (sales summary).
- [ ] Skill authoring guide + template.

## Open items (direkonsiliasi 2026-10-13 — daftar tunggal: `docs/25-pending-implementations.md`)

1. Sample CRM/POS + skill authoring guide (EPIC-7) → **OPEN-1**.
2. Next.js first-class integration (master plan Phase 2) — sebagian ada di plugin; demo CRM/POS jadi gate-nya → **OPEN-2**.
3. Usage ledger rekonsiliasi upstream (server side) — usage records per lisensi **SUDAH ADA** (gateway ledger); job reconcile upstream belum ada → **OPEN-3**.

## Prioritization rule

Install → skill → chat → adapter → widget → quality → Next.js polish → observability. Fitur yang menambah autonomi tanpa authorization/audit = prioritas rendah.
