# Solution Architecture — gRouter Copilot

> Canonical architecture document. Superseded notes are marked explicitly.
> Credential-model decisions are locked in `docs/15-decision-log.md` (D-021).

## 1. Overview

gRouter Copilot adalah **plugin in-process** di aplikasi customer, dengan **backend Copilot terpisah** sebagai license authority **dan satu-satunya pemegang kredensial gRouter**.

```text
Aplikasi Customer (Node.js/Next.js)
│
├── Chat UI (widget)  ── client, TANPA key/license/token provider
│        │  POST /api/copilot/chat
│        ▼
├── Runtime (API route) ── server, TANPA kredensial gRouter
│        │  0. license gate (offline verify, wajib)
│        │  1. resolve skill
│        │  2. jalankan skill → data app
│        │  3. bangun context
│        ▼
└── Skills (developer-defined) ── akses DB/service app

        │  chat request + license (server-to-server, TLS)
        ▼
Copilot Backend (license authority + AI gateway, TERPISAH)
├── License server ── mint/revoke/validate, entitlement & quota customer
├── Usage ledger ── pemakaian PER CUSTOMER (license) milik Copilot
├── AI gateway (provider calls) ── SATU GROUTER_API_KEY server-side
└── Admin dashboard ── monitor license + install + usage

        │  POST /v1/chat/completions + Bearer <SATU service credential>
        ▼
gRouter (https://prod.grouter.web.id) ── AI infrastructure supplier
├── OpenAI / Anthropic / Gemini / provider lain
├── model routing, fallback, availability
└── infrastructure usage accounting (per service credential)
```

**Prinsip kunci (D-021):** Copilot memakai **SATU service credential gRouter** untuk seluruh
service. Bukan satu api key per customer. Identitas customer TETAP di Copilot; gRouter hanya
melihat satu kredensial service + trafik model.

## 2. Dua sistem terpisah (product boundaries)

| Sistem | Peran | Milik siapa | Disentuh? |
|---|---|---|---|
| **gRouter** (`https://prod.grouter.web.id`) | AI infrastructure/provider gateway: model, routing, fallback, provider credentials, infra usage | tim gRouter | YA — Copilot consume via API (read-only intent: Copilot tidak pernah mengelola/mengubah konfigurasi gRouter) |
| **Copilot** (`copilot.grouter.id` + plugin) | customer-facing product/module: identitas, license, plan, entitlement, quota, usage, billing | produk Copilot | YA — ini produk kita |

> Catatan historis: "gRouter (port 20128)" adalah gateway LAMA di mesin lama. Supplier
> production yang dikonsumsi Copilot adalah `https://prod.grouter.web.id` (lihat
> `docs/23-grouter-api-contract.md`). Port 20128 bukan bagian dari arsitektur ini.

## 3. Credential model (D-021)

```text
Copilot production backend
        │
        │  SATU service credential (GROUTER_API_KEY, server-side secret)
        ▼
      gRouter
```

- `GROUTER_API_KEY` = **infrastructure/service credential** milik Copilot service.
- Ia BUKAN: identitas customer, license Copilot, kredensial customer, isi browser,
  isi installer, respons API ke customer, konfigurasi aplikasi customer-side, atau bagian
  dari license token (token signed, bukan encrypted — D-015).
- **DITOLAK untuk MVP:** provisioning satu api key gRouter per customer
  (`Customer A → key A`). Satu kredensial shared memaksa key menyebar ke N host app —
  permukaan bocor O(N) dan tidak ada revocation per-customer.
- Konsekuensi: pemanggilan gRouter terjadi **hanya dari Copilot backend**. Plugin/host app
  TIDAK pernah memegang kredensial provider (runtime chat di-host app memanggil Copilot
  backend dengan license token; backend yang memanggil gRouter).
- D-014/D-015 tetap berlaku untuk intinya (customer hanya memegang license key; api key
  tidak pernah masuk license token). "Option A: key handoff" (installer menukar license
  dengan api key lalu menyimpannya di `.env` host app customer) **disuperse-kan oleh D-021** —
  pola itu hanya aman untuk kredensial per-customer, dan per-customer key justru ditolak.

## 4. Customer identity model

Identitas tinggal di Copilot. Identifier yang SUDAH ADA di repo (jangan menambah konsep baru):

| Identifier | Sudah ada di | Fungsi |
|---|---|---|
| `account.id` (customer_id) | `server/src/store.js` (`acc_…`), `accountService.js` | pemilik license (D-017: 1 akun = N license) |
| `license.id` (license_id) | `server/src/store.js` (`lic_…`), payload token (`lic`) | entitlement + ownership order/license |
| `installId` | `src/license/gate.js`, heartbeat (`recordHeartbeat`, `installIds`) | menghitung install per license |
| `requestId` | `src/runtime/chat.js` (`req_…`), ChatResponse | korelasi request log per chat |

- gRouter **TIDAK perlu** tahu `customer_id`/`license_id` untuk MVP: tidak ada field metadata
  di kontrak chat completions (`docs/23`), jadi identitas TETAP internal Copilot. gRouter hanya
  melihat service credential.
- Korelasi request→customer→license dilakukan Copilot di usage ledger-nya sendiri
  (requestId + licenseId + accountId + model + timestamp + status + usage).

## 5. Entitlement model (Copilot-owned)

```text
Account (customer) 1..N License (D-017)
  License → plan (packageKey) → quota + features + expiresInDays
  License.status = active | revoked
```

- Entitlement di-resolve server-side dari plan catalogue (D-020, cost-integrity A1/A3).
- **Copilot quota = batas pemakaian CUSTOMER** (per license). "Unlimited" pada level
  infrastructure TIDAK berarti customer unlimited: service credential = akses
  infrastructure; license = entitlement; quota Copilot = limit pemakaian customer.
- Status saat ini (jujur): `plan.quota` masih **label deskriptif** (mis. `"3B usage"`) dan
  enforcement belum diimplementasi — lihat GAP-002 di audit & `docs/25`.

## 6. Usage model — dua dimensi akuntansi yang BERBEDA

| Dimensi | Pemilik | Unit | Sumber data |
|---|---|---|---|
| **Copilot customer usage** | Copilot | per license: request/token/credit (unit ditetapkan implementasi) | usage ledger Copilot (belum ada — GAP-002/003) |
| **gRouter infrastructure usage** | gRouter | token/request/biaya provider per service credential | `GET /api/check-usage?key=…` (read-only) |

- Keduanya BUKAN dimensi yang sama dan TIDAK otomatis setara. `usage.requests` dari
  `/check-usage` adalah trafik SELURUH service credential — bukan pemakaian satu customer.
- Biaya provider sebanding TOKEN, bukan jumlah request: 100 request × 500 token ≠
  100 request × 50.000 token. Jika MVP memakai quota berbasis request, itu adalah
  **penyederhanaan MVP** dan harus dinyatakan eksplisit beserta migration path ke
  metering token/credit (lihat §10).
- Dashboard tidak boleh menyajikan infra-usage `/check-usage` seolah itu kuota customer.

## 7. Payment lifecycle (tanpa provisioning gRouter)

```text
Purchase (pilih plan)
  → Payment SUCCESS (KlikQRIS ter-verifikasi upstream)
  → Customer (account)
  → Copilot License (issue + token)
  → Entitlement / Quota (dari plan)
  → AI Usage (via Copilot)
  → gRouter (SATU service credential, di belakang)
```

**TIDAK ADA langkah** `payment → create gRouter customer → create gRouter api key → attach`.
Auto-provisioning tetap DEFERRED (D-016) dan kini **tidak dibutuhkan** oleh arsitektur
service-credential. Purchase = murni Copilot: account + license + entitlement.

## 8. AI request lifecycle

```text
Customer (browser/widget)
  → Copilot runtime di host app (license gate offline, skill, context)
  → Copilot backend (validasi license ONLINE + revoke check + quota check)
  → panggil gRouter dengan SATU service credential (server-side)
  → gRouter → model/provider (routing, fallback)
  → response
  → Copilot usage ledger (licenseId, requestId, model, usage, status)
  → jawaban ke customer
```

- Offline license gate (D-010) tetap menjadi gate PERTAMA di host app; backend adalah
  gate ONLINE (revocation + quota) sebelum request provider.
- Error gRouter dipetakan ke safe errors (`upstream_unavailable`/`timeout`, retryable
  flag) — tidak ada detail provider/kredensial yang bocor (`src/adapter/errors.js`).

## 9. Security boundary (kredensial gRouter)

`GROUTER_API_KEY` BOLEH ada hanya di:

| Lingkungan | Tempat |
|---|---|
| local development | `server/.env` (gitignored, tidak pernah di-commit) |
| staging | env/process manager server staging (mis. pm2 env), gitignored |
| production | env server produksi / secret manager; TIDAK di repo, TIDAK di image publik |
| CI/CD | tidak dibutuhkan untuk MVP (test memakai FakeSupplier + dummy key) |

`GROUTER_API_KEY` TIDAK BOLEH: terkirim ke browser, ada di frontend JS/bundle, ter-embed di
installer, disimpan di `.env` aplikasi customer, dikembalikan lewat respons API apa pun
(termasuk `/api/resolve` — endpoint lama disuperse-kan, lihat `docs/29`), disimpan di license
token, di-commit ke Git, di-log, dicetak diagnostik, muncul di error message, atau tampil di
UI admin/customer. Nilai konseptual konfigurasi:

```text
GROUTER_API_KEY=<server-side-secret>          # tidak pernah diisi nilai real di repo
GROUTER_BASE_URL=https://prod.grouter.web.id  # TANPA /v1 — adapter menambahkan /v1/chat/completions
```

Manajemen secret: rotasi = ganti env + restart backend (revoke key lama di sisi gRouter);
revocation darurat = revoke di gRouter + rotasi + audit log akses. `/check-usage` memakai
key yang sama sebagai `?key=` query param — endpoint ini hanya boleh dipanggil server-side.

## 10. Future evolution (JANGAN diimplementasi sekarang)

```text
MVP:      SATU Copilot service credential
  ↓ future: scoped service credentials (per-batas pemakaian)
  ↓ future: per-product / per-environment credentials
  ↓ opsional: per-tenant gRouter identity HANYA jika kebutuhan bisnis nyata muncul
```

Jangan over-engineer MVP demi future state ini. Migration path metering: MVP quota
request-based → catat token usage di ledger sejak awal → belakang aktifkan enforcement
token/credit tanpa mengubah lisensi yang sudah terbit.

## 11. Reliability

- License offline → app tidak dependen pada license server (gate offline).
- Heartbeat gagal → diabaikan (best-effort).
- gRouter down → `upstream_unavailable`, retry terbatas; Copilot backend adalah titik
  retry/circuit-breaker, bukan tiap host app customer.
- Skill fail → error jelas.

## 12. Decisions

- Plugin in-process + backend license authority terpisah (D-009).
- Hybrid license validation (D-010); runtime gate (D-011).
- **SATU service credential gRouter di Copilot backend; bukan per-customer key (D-021).**
- gRouter adapter = satu-satunya panggilan AI; kredensial hanya di backend (D-021).
- Backend Copilot = JSON store (zero dependency) untuk MVP.
