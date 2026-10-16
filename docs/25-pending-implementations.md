# Pending Implementations — gRouter Copilot (SOURCE OF TRUTH)

> **Rekonsiliasi final 2026-10-14** (HEAD `139fbf5`). Dokumen ini adalah **satu-satunya daftar
> pending yang berwenang**. Setiap entri berstatus **OPEN** (benar-benar belum selesai), **PO-owned**
> (butuh keputusan/tindakan owner), atau **CLOSED** (riwayat — jangan dianggap terbuka lagi).
> Sebelumnya status tersebar & saling bertentangan di `docs/25`, `docs/18`, `docs/30`, `docs/20`,
> `docs/17`, dan handoff — semua sudah diselaraskan ke tabel di bawah. Angka test terukur tree ini:
> **root 105/105 · server 118/118 · tsc bersih · E2E 22/22 (terisolasi) ·
> SPA probe 0 error/CSP** — lihat `docs/docs-reconciliation-2026-10-13.md` dan
> `docs/evidence/2026-10-13-production-integrity-fixes.md`.

## Ringkasan status (satu tampilan)

| # | Item | Status | Blocker | Cara lanjut / resume |
|---|---|---|---|---|
| GO-1 | KlikQRIS mode produksi (uang nyata) | **PO-owned** | butuh keputusan bisnis + kredensial produksi | set `KLIKQRIS_MODE=production` + API key/merchant ID di `server/.env`, lalu runbook `docs/33` §2 |
| GO-2 | Persist license keypair produksi | **PO-owned** | ephemeral key di-regenerate tiap restart | set `LICENSE_PRIVATE_KEY_PEM`/`LICENSE_PUBLIC_KEY_PEM` atau `server/data/keys/license-{private,public}.pem` sebelum lisensi nyata |
| GO-3 | `ADMIN_TOKEN` produksi | **PO-owned** | nilai ops | isi `ADMIN_TOKEN` di `server/.env` (fail-closed tanpa itu di `NODE_ENV=production`) |
| GO-4 | npm publish `@grouter/copilot` | **PO-owned (DILARANG)** | keputusan owner | tetap unpublished; `npx` path belum terverifikasi sampai publish |
| GO-5 | Aktivasi AI per paket | **PO-owned** | kebijakan paket saat ini `ai.enabled:false` | toggle di `/admin/packages` bila PO memutuskan |
| GO-6 | Kredensial Resend (email reset/notif) | **PO-owned** | butuh API key | isi `RESEND_API_KEY` (+`MAIL_FROM`) di `server/.env`; kode sudah aktif, verifikasi email masuk |
| OPEN-1 | Sample CRM/POS + skill authoring guide | **CLOSED** | — | `870c8e8`; `docs/skill-authoring.md` + synthetic read-only fixture + 2 contract tests |
| OPEN-2 | Next.js first-class integration | **OPEN (partial)** | demo CRM/POS jadi gate | master-plan Phase 2; sebagian sudah ada di plugin |
| OPEN-3 | Usage-ledger reconciliation job (upstream) | **OPEN** | belum ada job reconcile | usage per lisensi sudah tercatat; tambah job banding vs `/check-usage` |
| OPEN-4 | Bukti callback KlikQRIS nyata → webhook | **OPEN (external)** | butuh sesi simulator upstream | buat order sandbox baru, amati path webhook di log app (`docs/handoff-2026-10-12-continuation.md`) |
| OPEN-5 | Signature verifikasi webhook KlikQRIS | **OPEN (blocked)** | butuh algoritma dari KlikQRIS | implementasi setelah dokumen signature tersedia (`docs/33`, R-11) |
| OPEN-6 | Automasi audit dependency | **OPEN** | repo tanpa CI workflow | jalankan manual (`npm audit`/`pnpm audit`); lockfiles tracked |
| OPEN-7 | Auto-scan helper linter (R-04) | **OPEN** | design, butuh approval | belum ada linter otomatis |
| OPEN-8 | Retry terbatas di runtime path (R-05) | **OPEN** | hanya taxonomy retryable | tambah retry/circuit-breaker di backend (target D-021 `docs/04` §11) |
| OPEN-9 | Reconcile usage provider per-customer | **OPEN** | kontrak `/check-usage` = total per credential | tunggu dukungan metadata gRouter (`docs/30` open question #2) |
| CLOSED | Companion conversation + application-grounded routing | **CLOSED** | — | general conversation tanpa skill, data aplikasi tetap skill-gated, source metadata di-redact; `25be157`, `4c69fa4`; root 118/118 |
| CLOSED | Google OAuth (P-001) | **CLOSED** | — | enabled via env; rotasi kredensial = ops (`docs/28`) |
| CLOSED | Auto-provisioning gRouter key (P-002) | **CLOSED (REJECTED)** | D-021 | tidak dibutuhkan arsitektur service-credential |
| CLOSED | KlikQRIS payment integration (P-003) | **CLOSED** | — | live (sandbox); go-live = GO-1 |
| CLOSED | Customer dashboard wiring (P-004) | **CLOSED** | — | `/user`, `/api/me`, `/api/plans`, checkout, `/success` |
| CLOSED | Account & license data model (P-005) | **CLOSED** | — | D-017 implemented (store + `accountService.js`) |
| CLOSED | Auth backlog (change-password, headers) | **CLOSED** | — | `ChangePasswordDialog`, security headers live (2026-10-12) |
| CLOSED | Patch D2/D3/D4/D5 scaffold | **CLOSED** | — | diterapkan + ter-commit (`c937fdb`, `97cd824`); bukti `docs/evidence/2026-10-13-cleanroom-installer.md` |
| CLOSED | Usage ledger + quota enforcement (GAP-002/003) | **CLOSED** | — | `server/src/gateway.js` + `store.js`, `GET /api/admin/ledger` |
| CLOSED | E2E isolasi dari produksi (P0) | **CLOSED** | — | `859259f`; bukti `docs/evidence/2026-10-13-e2e-isolation.md` |
| CLOSED | E2E port-ownership + instance-identity hardening (P0) | **CLOSED** | — | port preflight + nonce per-run + config fail-closed; 12 tes; bukti `docs/evidence/2026-10-14-e2e-identity-hardening.md` |
| CLOSED | CI workflow (tanpa secret/prod DB) | **CLOSED** | — | `.github/workflows/ci.yml` (root+server+tsc+eslint+isolated E2E+clean-room) |
| CLOSED | Store isolation NODE_ENV=test + planKey issuance fail-closed (P1) | **CLOSED** | — | `568cad3`; bukti `docs/evidence/2026-10-13-production-integrity-fixes.md` §2-3 |
| CLOSED | Frontend static hang `/assets/` + atomic deploy script (P1) | **CLOSED** | — | `42fbe93`, `f06748d`; bukti §4-5 |
| CLOSED | Admin dashboard mock numbers → real API data (P1) | **CLOSED** | — | `a4e9647`; bukti §6 |
| CLOSED | CSP `worker-src blob:` (sign-up) (P1) | **CLOSED** | — | `05aa2ee`; bukti §7 |
| CLOSED | Admin filter/sort dead-or-wrong + a11y labels (P1) | **CLOSED** | — | `b8162cc`; bukti §8; probe `scripts/qa-spa-probe.mjs` |
| CLOSED | Test-DB prod isolation + entitlement fail-closed (P1) | **CLOSED** | — | `5830fcf`; bukti `docs/evidence/2026-10-13-test-db-isolation.md` |
| CLOSED | Restore drill (WS4) | **CLOSED** | — | `docs/evidence/2026-10-13-restore-drill.md` |
| CLOSED | Gateway model/plan/quota matrix (WS2) | **CLOSED** | — | `docs/evidence/2026-10-13-gateway-entitlement-matrix.md` |
| CLOSED | Mini-CRM dari tarball (WS3) | **CLOSED** | — | tercakup clean-room matrix ESM+CJS (`docs/evidence/2026-10-13-cleanroom-installer.md`) |

**Tidak ada item OPEN yang memblokir rilis saat ini** selain keputusan PO (GO-*). Item OPEN-1..9
adalah pengembangan lanjutan, bukan blocker.

Dua keputusan yang sengaja DITUNDA dan tidak boleh diimplementasi sekarang: future credential model
(scoped/per-product credentials) — `docs/04` §10; dan unit quota final (sudah = token untuk MVP).

---

## Riwayat (HISTORIS — jangan dianggap status terkini)

> Bagian di bawah adalah catatan asli yang membuat dokumen ini sebelumnya. Semua entri **sudah
> selesai** atau **sudah usang**; dipertahankan sebagai jejak, bukan daftar kerja.

### P-001..P-005 — hasil rekonsiliasi I5 (2026-10-01)

- **P-001 Google OAuth — DONE** (aktif murni via env `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`;
  callback single-origin `https://copilot.grouter.id/api/auth/callback/google`).
- **P-002 Auto-provisioning gRouter api key — REJECTED for MVP (D-021, 2026-10-08)**; D-016 tetap
  dicatat historis. Tidak ada provisioning per-customer untuk MVP.
- **P-003 KlikQRIS payment integration — DONE** (live, sandbox). `server/src/klikqris.js`; flow
  A1-safe; webhook re-verify upstream sebelum `settlePaid`. Sisa: go-live produksi (GO-1).
- **P-004 Customer dashboard data wiring — DONE** (`/user`, `/api/me`, `/api/plans`, checkout modal,
  `/success`).
- **P-005 Account & license data model — DONE** (D-017: Account 1..N License; field legacy
  `grouterApiKey` masih ada di store **pra-D-021** — jangan dipakai untuk integrasi baru).

### Auth backlog (audit 2026-10-12) — semua CLOSED

1. **Ganti password dari UI — SELESAI 2026-10-12** (`ChangePasswordDialog` di dropdown sidebar; E2E verified).
2. **Email reset password** — kode Resend **AKTIF** (`sendResetPassword` di `auth.js`, env-driven);
   tersisa hanya kredensial (GO-6).
3. **Security headers — SELESAI 2026-10-12** (`frontendServer.js`: nosniff, X-Frame-Options,
   Referrer-Policy, Permissions-Policy, CSP `frame-ancestors 'none'`).
4. Halaman `/app/sign-up` (SPA) = showcase/simulasi (demo komponen); jalur sign-up resmi
   `/login/sign-up`.

### Patch D2/D3/D4/D5 (scaffold) — SUDAH DITERAPKAN (2026-10-13)

`bin/grouter-copilot.js` diperbaiki; regresi `test/scaffold-host-compat.test.js` (RED→GREEN).
- **D5** — template route membungkus `gatewayChat` try/catch → envelope `UPSTREAM_UNAVAILABLE` (502).
- **D4** — shim `ensureExpressLike(res)` untuk `node:http` polos.
- **D2** — langkah installer menjelaskan `node --env-file=.env …`.
- **D3** — `detectModuleType()`: proyek CommonJS dapat scaffold `.cjs`; ESM tetap `.js`.
Bukti: `docs/evidence/2026-10-13-cleanroom-installer.md`.

### Temuan verifikasi CLI installer (Worker B+C, 2026-10-13) — HISTORIS / terselesaikan

Worker `deleg_9b1c89a8` **COMPLETED** (2026-10-13 05:26 UTC). Lima temuan — semuanya sudah
ditangani:
1. Dashboard menampilkan install dengan **License ID bukan token** → **FIXED** (WS-A token recovery:
   `GET /api/me/licenses`, `GET /api/me/licenses/:id/token`, modal "Token lisensi" di `/user/install`).
2. Node tidak memuat `.env` otomatis → **FIXED (D2)**.
3. Scaffold ESM di proyek CommonJS → **FIXED (D3)**.
4. Handler Express API di `node:http` polos → **FIXED (D4)**.
5. Gateway tak terjangkau → host crash → **FIXED (D5)**.

### Konvensi akun test & pembersihan prod (2026-10-13)

**Aturan (berlaku):** test E2E ber-session WAJIB memakai instance terisolasi. **Sejak `859259f`,
`npm run e2e` sudah terisolasi penuh** (instance temporer port 4690/4691 + mock upstream + guard
fail-closed) sehingga tidak lagi membuat residu di prod — sweep pasca-E2E tidak diperlukan lagi.

**Alat housekeeping (residu lama saja):**
- `server/scripts/purge-test-accounts.mjs` — dry-run default, `--apply`, `--older-than N`, proteksi
  akun ber-order, backup otomatis. Hanya `auth.sqlite`.
- `server/scripts/purge-store-residue.mjs` — bersihkan `store.json` (akun test-pattern + lisensi/
  order/usage/notif miliknya); dry-run default, backup, write atomik.

```bash
cd server
node scripts/purge-test-accounts.mjs                      # lihat dulu (aman)
node scripts/purge-test-accounts.mjs --apply              # hapus
node scripts/purge-test-accounts.mjs --apply --older-than 7
```

### Payment provider note (KlikQRIS)

- Sandbox: mode `sandbox` (aktif). Produksi: GO-1.
- Webhook dipakai + di-re-verify upstream; polling browser (QR modal) hanya untuk UI.
- Simulasi bayar sandbox hanya via dashboard KlikQRIS (manual, 1 klik operator).
