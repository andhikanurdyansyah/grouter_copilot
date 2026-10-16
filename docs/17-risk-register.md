# Risk Register — gRouter Copilot

> Direkonsiliasi 2026-10-12: mitigasi aktual ditautkan ke test/bukti. Status
> mitigasi: ✅ = ada test/bukti live; ⚠️ = mitigasi dokumen, belum automation.

| ID | Risk | Likelihood | Impact | Mitigation (status bukti) | Trigger |
|---|---|---:|---:|---|---|
| R-01 | Key gRouter bocor ke browser | Medium | Critical | ✅ server-only + bundle scan test (test/widget.test.js, server/test/handoff.test.js, settings.test.js); adapter fail-closed tanpa fallback process.env (fd75163) | key di bundle |
| R-02 | Prompt injection via data app | High | High | ✅ untrusted data channel + skill allowlist + read-only; eval fixture injection (test/eval-fixtures.test.js 2026-10-12) | eval failure |
| R-03 | Skill baca data berlebih | High | High | ✅ maxRows + maxContextBytes fail-closed (test/context.test.js) | scope leak |
| R-04 | Auto-scan disalahpahami "baca semua" | Medium | High | ✅ helper scope is explicit + deterministic production-root scan (`scripts/source-scan.mjs`, `docs/source-scan.md`, CI); findings are file/line/rule only | auto-expose tanpa izin |
| R-05 | gRouter down / limit | Medium | Medium | ✅ UPSTREAM_UNAVAILABLE/TIMEOUT retryable taxonomy (adapter + fixtures); ⚠️ retry terbatas belum di runtime path | upstream unavailable |
| R-06 | Adopsi rendah (install sulit) | High | High | ✅ init command + README; ⚠️ sample app + registry publish pending | abandonment |
| R-07 | Mutating skill terlalu dini | Medium | High | ✅ read-only default + SCOPE_DENIED (test/registry.test.js) | write tanpa izin |
| R-08 | Protokol skill tidak portabel | Medium | Medium | ⚠️ protocol v1 constants + contract test (protocol-version.test.js); extract core saat multi-bahasa | drift antar bahasa |
| R-09 | Overpromise "baca seluruh data" | High | High | ⚠️ positioning skill layer terkontrol (PRD §5) | objection keamanan |
| R-10 | Backend Copilot ditambah prematur | Low | Medium | SUPERSEDED arsitektur: Copilot backend (license server + dashboard) sudah ada & disetujui (Phase 0c DONE; D-021 service credential) | complexity creep |
| R-11 | Webhook payment dipalsukan | Medium | Critical | ✅ never-trust-body: re-verify upstream sebelum settle + idempotency + amount/order mismatch tests (payment-webhook.test.js 9 tests); ⚠️ signature verification butuh algoritma dari KlikQRIS (runbook docs/33) | settle tanpa verifikasi |
| R-12 | Dependency vulnerability (supply chain) | Medium | High | ✅ server npm audit + frontend pnpm audit are enforced in CI by `npm run audit:dependencies`; tracked lockfiles and high-severity threshold; offline contract test available | audit > high |

*R-10 ditandai SUPERSEDED karena keputusan arsitektur berubah: backend Copilot
adalah bagian inti produk (license server + dashboard), bukan prematur.*

> Item ⚠️ di atas (R-05 retry runtime, R-11 signature webhook, R-12 automasi audit, R-06 sample app)
> adalah item **OPEN** yang tercatat sebagai **OPEN-5/6/7/8/1** di `docs/25-pending-implementations.md`
> (daftar pending tunggal).

