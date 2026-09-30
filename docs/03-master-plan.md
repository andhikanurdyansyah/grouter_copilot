# Master Plan — gRouter Copilot

## Strategy

Bangun plugin secara vertikal & minimal: satu bahasa (Node.js/Next.js), satu alur install → skill → chat → gRouter. Baru perluas setelah protokol skill stabil.

## Phase 0 — Core plugin (Node.js)

**Outcome:** `npx @grouter/copilot init` menghasilkan working chatbot.

- package skeleton + CLI `init`.
- framework detection (Next.js App Router, Pages Router, Express, plain Node).
- config loader (`copilot.config.js`).
- skill registry + validator.
- runtime chat route.
- gRouter adapter (fake supplier untuk test).
- widget `CopilotChat`.
- `.env` handling (`GROUTER_API_KEY`).

**Gate:** install → tulis 1 skill → chat bekerja, key tidak bocor, test contract lulus.

## Phase 1 — Skill & chat quality

**Outcome:** jawaban grounded dan reliable.

- skill selection (berdasarkan deskripsi + intent).
- source/freshness metadata.
- error taxonomy (skill fail, gRouter down, scope deny).
- streaming, cancel, timeout.
- usage recording (token, latency) lokal.

**Gate:** evaluation fixtures lulus, error states jelas.

## Phase 2 — Next.js first-class

**Outcome:** pengalaman Next.js mulus.

- App Router route handler + streaming.
- React Server Components aware.
- TypeScript types.
- widget theming.

**Gate:** demo CRM + POS sample working di Next.js.

## Phase 3 — Observability & kontrol

**Outcome:** developer bisa lihat & kontrol.

- local usage log.
- skill enable/disable.
- model & prompt config.
- budget/limit per request.

**Gate:** developer bisa debug skill failure tanpa baca key.

## Phase 4 — Multi-bahasa (Java/Python)

**Outcome:** protokol skill portabel.

- core protocol extracted (bahasa-agnostic).
- Java/Spring SDK.
- Python SDK.

**Gate:** skill contract sama di semua bahasa, parity test.

## Phase 5 — Advanced (optional, gated)

- mutating skills (write/update) dengan confirmation + audit;
- auto-discovery terbatas (helper, bukan default);
- optional Copilot backend (telemetry/provisioning) — hanya jika dibutuhkan.

## Dependency order

```text
CLI init → config → skill registry → runtime chat → gRouter adapter → widget → quality → Next.js → observability → multi-bahasa → advanced
```

## Release rules

- Semver; breaking change = major.
- v1 tidak menyentuh gRouter existing.
- Key gRouter tidak pernah ke client.
- Setiap skill read-only default sampai gate mutasi terpisah.
