# Decision Log — gRouter Copilot

## Locked decisions

### D-001 — Plugin, bukan platform SaaS
**Accepted.** gRouter Copilot adalah plugin/module yang di-install ke aplikasi customer.

### D-002 — Self-contained key (data tetap di customer)
**Accepted.** Data aplikasi tetap self-contained di app customer.

### D-003 — Developer-defined skills
**Accepted.** Developer mengekspos data lewat `run()`.

### D-004 — Read-only default
**Accepted.** Mutasi = gate terpisah.

### D-005 — Node.js/Next.js first
**Accepted.** Java/Python setelah protokol stabil.

### D-006 — In-process runtime
**Accepted.** Runtime di app customer.

### D-007 — gRouter = supplier, READ-ONLY
**Accepted.** gRouter existing (port 20128) TIDAK disentuh. Hanya konsumsi API key + `/check-usage` (read-only).

### D-008 — License-based (NOT open-source)
**Accepted.** Runtime menolak jalan tanpa license valid.

### D-009 — Backend Copilot (license server + dashboard)
**Accepted.** Terpisah dari gRouter: mint/revoke license, hitung install, dashboard admin.

### D-010 — License validation: HYBRID
**Accepted.** Offline signature + best-effort online heartbeat.

### D-011 — Install lock: runtime gate
**Accepted.** Package publik, runtime nolak jalan tanpa license.

### D-012 — Dashboard MVP scope: minimal
**Accepted.** License list + install count + issue/revoke.

### D-013 — Customer flow: register → purchase → license → install
**Accepted.** Landing page (copilot.grouter.id) → register → dashboard → purchase license (include quota) → dapat LICENSE KEY → install.

### D-014 — ONE credential = license key
**Accepted.** Customer tidak memegang api key gRouter secara manual. Api key di-resolve server-side dari license.

### D-015 — Api key TIDAK di-embed di token license
**Accepted.** Token license berisi entitlement (licenseId, quota, features), BUKAN api key. Api key disimpan di backend (secret) + di-handoff ke plugin saat install (Option A: key handoff).

### D-016 — Auto-provisioning DEFERRED
**Accepted.** Jangan wire auto-generate api key gRouter saat purchase sampai flow + kontrak endpoint gRouter jelas. Untuk sekarang: admin map license → existing api key manual.

### D-017 — 1 akun = banyak license
**Accepted.** Satu akun customer bisa punya banyak license (multi-project / multi-app). Model: `account 1..N licenses`, setiap license punya entitlement + quota sendiri. *(Catatan D-021: "bound api key sendiri" per license adalah pola lama — superseded; kini satu service credential gRouter untuk seluruh service.)*

### D-018 — Payment = KlikQRIS
**Accepted.** Payment provider = KlikQRIS (klikqris.com, QRIS). Alur: create QRIS → customer scan bayar → poll/webhook status → paid → issue license. Punya mode sandbox (API Key + Merchant ID).

### D-019 — Google OAuth = PENDING
**Accepted (pending).** Google OAuth dicatat di doc implementasi sebagai pending. Belum dibangun backend-nya (butuh client ID + redirect + token exchange + session model).

## D-020 — Runtime configuration is store-backed + admin-configurable

**Accepted.** All runtime configuration (branding, plans/pricing, payment, usage/provider, limits, license defaults, auth) has a single source of truth resolved as `DEFAULT_SETTINGS <- env seeds <- store.settings` (`server/src/settings.js` + `store.json`). Env vars are SEEDS only; the admin panel writes to the store. **No configurable value may be hardcoded at a call site.** Secrets are masked in every admin response. Endpoints: public `GET /api/plans`; admin `GET|PATCH /api/admin/settings`.

**Consequence (revenue):** `POST /api/orders` MUST resolve the amount server-side from the plan catalogue by `packageKey` — never trust `body.amount`. License `features`/`expiresInDays` come from the plan, not a hardcoded `['core']`/`365`.

## D-021 — Satu service credential gRouter untuk Copilot (bukan per-customer key)

**Accepted.** Copilot memanggil gRouter memakai **SATU service credential** (`GROUTER_API_KEY`)
yang hanya hidup di Copilot backend (server-side). DITOLAK untuk MVP: provisioning satu api key
gRouter per customer/per license. Alasan: (1) kredensial = akses infrastructure, bukan identitas
customer; (2) key menyebar ke N host app = permukaan bocor O(N) tanpa revocation per-customer;
(3) tidak ada endpoint provisioning gRouter (D-016 tetap deferred — dan kini tidak dibutuhkan).

**Konsekuensi:**

- Customer identity (account/license/install/request id) TETAP internal Copilot. gRouter hanya
  melihat satu service credential; tidak ada field metadata customer di kontrak chat completions.
- Copilot quota ≠ gRouter infra usage. Copilot punya usage ledger per license (customer
  dimension); `/check-usage` = infrastructure dimension per service credential. Keduanya tidak
  saling menggantikan dan tidak otomatis setara.
- "Unlimited" infrastructure di balik service credential TIDAK berarti customer unlimited —
  limit pemakaian customer adalah Copilot quota per license/plan.
- **Supersede:** "Option A: key handoff" (`/api/resolve` mengembalikan api key ke installer untuk
  disimpan di `.env` host app customer) tidak lagi menjadi arsitektur target — hanya valid untuk
  kredensial per-customer, dan per-customer key ditolak. `/api/resolve` tetap ada untuk transisi
  (resolve `licensePublicKey` + `baseUrl` tanpa provider key); konsumen api key berikutnya adalah
  Copilot backend, bukan host app customer.
- Pemanggilan gRouter terpusat di Copilot backend; plugin/host app memanggil Copilot backend.

**Implemented (2026-10-09):**
- `POST /api/copilot/chat` — satu-satunya konsumen service credential (`server/src/gateway.js`).
  Flow: validate license (signature/expiry/revocation, server-side) → validasi `messages` (≤40,
  ≤32KB, role whitelist) → kuota per license dari `plan.quotaTokens` (plan catalogue; null =
  unlimited) → reservasi token sinkron (read-then-write tanpa await, anti-interleave) → call
  gRouter via adapter → rekonsiliasi usage nyata → ledger per license (D-021 ledger).
  Idempotensi: `requestId` duplikat = replay, tidak dobel charge. Error upstream TIDAK
  ditagih (reservasi dilepas). Response tanpa kredensial; field identity dari client diabaikan.
- `/api/resolve` TIDAK pernah mengembalikan `apiKey` lagi; hanya `{baseUrl, gatewayUrl,
  licensePublicKey}`. Field `grouterApiKey` pada license = LEGACY, tidak pernah diproyeksikan.
- Installer baru (`bin/grouter-copilot.js`): scaffold + `.env` berisi `GROUTER_LICENSE`,
  `GROUTER_GATEWAY_URL`, `GROUTER_LICENSE_SERVER`, `GROUTER_LICENSE_PUBLIC_KEY` — tanpa
  kredensial provider. Menolak server lama yang masih mencoba handoff key (defense in depth).
- Plugin: `runtime.buildGatewayPayload()` (skill + context dibangun di host app) +
  `gatewayChat()` (`src/index.js`) → POST ke gateway. Kredensial tidak pernah keluar backend.
- `/api/admin/usage` = infrastructure dimension (satu service credential, server-side env);
  customer dimension ada di ledger gateway (per license).
- Rate limit `/api/copilot/chat` 60 req/menit/IP (sama dengan /api/resolve).

## D-022 — Notification multi-kanal (2026-10-17)

- **Addendum design email (2026-10-17):** keempat template memakai satu enterprise shell di `mail.js` (`buildEmailShell`/`EMAIL_BRAND`): tabel email-safe + inline style, chassis gunmetal + satu aksen cyan, status-line mono, tabel detail mono, satu CTA per email, footer bantuan. Subjek/teks & escaping secret tidak berubah; design dikunci test di `mail.test.js` dan terbukti terkirim nyata via Brevo (event `delivered`).
- **v3 (2026-10-17, atas feedback PO: over-spacing, terpotong, belum premium, dark/light):** shell kini (a) spacing terukur 4pt-based (maks 28px, card 369px untuk pembayaran vs 444px di v2), (b) anti-terpotong `table-layout:fixed` + `word-break:break-word` — terbukti 0 clipped di 20 kombinasi render (desktop/mobile × gelap/terang, incl. plan-name sangat panjang), (c) dual-theme: dark tetap default inline, light = adaptasi sesungguhnya via token `EMAIL_LIGHT` + `@media (prefers-color-scheme: light)` (stage `#f4f4f2`, card putih, aksen teks deep-cyan `#0b7d99` kontras ≥4.5:1) dengan meta `color-scheme: light dark`. Email tetap kemasan terpisah dari DESIGN.md landing (Notion warm-paper) dan grx dashboard: dark-default selaras dashboard, light hangat untuk inbox terang.

- **Lima kanal dinilai terpisah:** in-app customer, in-app admin, email transaksi, toast UI (BUKAN kanal), hint widget plugin. Klaim "notifikasi jalan" wajib menyebut kanalnya.
- **Event diturunkan HANYA dari state ter-persist** (orders/licenses/usage ledger), tidak pernah dari konten client. Customer: `order.paid`/`order.pending`/`order.expired`/`order.cancelled`/`license.issued`/`license.expiring`/`license.expired`/`license.revoked`/`quota.threshold`/`quota.exhausted`; admin mirror namespace `admin.*`.
- **Admin notification = koleksi terpisah** (`adminNotifications`, cap 200) di belakang `requireAdmin`, payload operasional generik (tipe, ID terpotong, link kind/id, timestamp) — tidak pernah email/nama/`accountId` customer.
- **Satu event penutup per order:** order kedaluwarsa menghasilkan tepat satu `order.expired`; `order.pending` tidak pernah terbit ulang setelahnya.
- **Threshold & jadwal = settings SSOT** (`notifications.schedulerIntervalMs` 900000, `quotaThresholdPercent` 90, `expiringSoonDays` 7, toggle email per-jenis), divalidasi `validateSettings`. Tidak ada angka hardcoded di call site (D-020).
- **Email transaksi via Brevo** (env `BREVO_API_KEY` + `MAIL_FROM`; provider diganti dari Resend atas keputusan PO 2026-10-17): payment-received (+license-issued tergabung), license-issued, license-expiring (jendela hari dari setting, dedupe harian), password-reset. Tanpa kredensial statusnya jujur `log_only` — tidak pernah diklaim terkirim. Metadata per baris: `emailStatus` (`sent|log_only|failed|disabled`), `emailedAt`, `emailAttempts`; retry hanya `failed`; baca lazy tidak mengirim ulang. Log tidak pernah memuat URL reset/token/kredensial provider (hanya email + status).
- **Scheduler proaktif hanya di entrypoint produksi** (`server/src/index.js`, `notificationScheduler: true`); lazy sync on-read tetap jalan. Test/library tidak pernah menyalakan timer.
- **Addendum penyelesaian lifecycle (2026-10-17, one-shot):** (a) event terminal ditambah `license.expired` (lisensi lapsed tanpa revoke; dedupe stabil per license id; in-app saja — revoked selalu menang, tidak ada double sinyal) dan `quota.exhausted` (100% kuota, periode sama dengan threshold; in-app saja; kuota unlimited tidak pernah terbit) beserta mirror `admin.*`; (b) badge jujur: `unread`/`total` selalu koleksi penuh akun/operator (`countNotifications`/`countAdminNotifications`), bukan slice `limit`; payload customer kini membawa `linkKind`/`linkId` yang act-scoped (milik akun sendiri); (c) retry email berbatas: `failed` hanya di-retry sampai 5 attempt total (`notifications.maxEmailAttempts`, default 5) lalu berhenti permanen — sebelumnya tanpa batas; (d) kebocoran metadata delivery (`emailStatus`/`emailedAt`/`emailAttempts`) ditutup dari payload customer (tetap ada di baris store + admin/internal); (e) hardening email: URL reset divalidasi `safeHttpUrl` (non-http(s) → fallback dashboard publik), teks reset kini memakai penutup bersama (garis bantuan dashboard hadir di semua teks), dan anti-clip ditambah `word-break` inline di sel title/lead/footnote shell (temuan QA render: kata sangat panjang di lead melebar 21px di mobile; kini 0 overflow di 20 kombinasi incl. stress). Kontrak dikunci test `notification-qa-*.test.js` (QA-5/QA-9/QA-11/QA-8 dll.) + `mail.test.js` 16/16; server 186/186, root 154/154, frontend 23/23.
- **Addendum reliability hardening (2026-10-17, one-shot lanjutan):** (a) race retry TERBUKTI di kode lama (probe: 2 sync paralel pada notif baru = 2 panggilan provider; 5 sync paralel pada baris `failed` = attempts melonjak 1→6 sekaligus) dan ditutup dengan state machine persisted per baris: `claimNotificationEmail` (synchronous, attempts++ + `emailClaimedAt` lease 2 menit) SEBELUM panggilan provider lalu `settleNotificationEmail` — dua sync konkuren tidak bisa sama-sama menang; claim basi (crash) dapat direklaim. (b) status delivery: `null → sending → sent | log_only | disabled` (terminal), `failed`/`ambiguous` (retryable, gated `emailNextRetryAt` = backoff 60s doubling cap 1h, jitter ±20%, random injectable), `exhausted` (cap 5 attempt atau kegagalan non-retryable). Mailer yang THROW = `ambiguous` (provider mungkin sudah menerima). KOREKSI pasca-audit (Worker B, batch deleg_14fabc41) + verifikasi langsung ke API Brevo: Brevo MENYEDIAKAN idempotency — field payload `headers.idempotencyKey` (UUID, TTL 30 menit; re-send dengan key sama di dalam TTL ditolak `duplicate_parameter` dan tidak terkirim ulang; key bersifat global per akun Brevo, bukan per penerima). Ejaan yang terbukti BEKERJA adalah `idempotencyKey` di field `headers` payload; header HTTP `Idempotency-Key` TIDAK dihormati (probe: dua kirim sama-sama 201 dan benar-benar terkirim dua kali). Kini setiap attempt satu notifikasi membawa key yang sama — UUID v4-shaped deterministik dari id notifikasi (`brevoIdempotencyKey` di `mail.js`) — dan `duplicate_parameter` diklasifikasikan `sent` (`duplicateSuppressed`). Header reset password yang dikirim `auth.js` adalah `Authorization` saja dari Better Auth (bukan token webhook); pertahanan URL reset = `safeResetUrl` + origin allowlist. Jendela duplikat residual: retry setelah TTL 30 menit (backoff cap 1 jam dapat melewatinya) atau provider mengabaikan key — exactly-once tetap tidak dijanjikan di luar TTL. Klasifikasi provider: 5xx/429 retryable, 4xx permanen (`provider_rejected`). (c) GET halaman bukan lagi retry engine: `GET /api/me/notifications` memakai `delivery:'new'` (first-attempt saja); retry dimiliki scheduler (`delivery:'all'`) + guard tick non-overlap. (d) URL reset: `safeResetUrl` — reset URL hanya dipertahankan bila origin == `BETTER_AUTH_URL` (atau loopback dev/test); origin asing/non-http(s) jatuh ke dashboard publik, token tidak pernah diteruskan ke host asing; `auth.js` mengikat `resetBaseUrl` eksplisit. (e) rotasi key Brevo TIDAK bisa via API (endpoint key management tidak ada — dashboard-only); domain `grouter.id` terverifikasi API: authenticated=true (SPF/DKIM) + sender aktif. Test kunci: `notification-reliability.test.js` (R-1..R-10 + X-1/X-2) + QA-6b read-storm HTTP; server 199/199, root 154/154, frontend 23/23. Sisa operator: rotasi key Brevo manual via dashboard Brevo (key pernah tampil di chat) — ganti key di dashboard, update `server/.env`, restart backend.
- **Widget plugin:** hint status lisensi non-blocking + dismissible dari health host (`notificationHint {kind:'license',status}`) — kasar secara sengaja (tanpa payload/token/alasan kedaluwarsa), tidak memblokir chat, dismiss tersimpan per status dan dibersihkan saat host sehat lagi.

## Customer flow

```text
Landing → Register → Dashboard → Purchase license (quota, KlikQRIS) → LICENSE KEY → install → chat
```

## Account & license model (D-017, D-021)

```text
Account (customer)
  └── License 1 (app A, quota X)
  └── License 2 (app B, quota Y)
  └── ...

Copilot backend ── SATU GROUTER_API_KEY (service credential) ──► gRouter
```

*(Pola lama "setiap license bound gRouter key" digantikan D-021.)*

## Payment flow (D-018, KlikQRIS)

```text
customer pilih paket → create QRIS (KlikQRIS) → customer scan bayar
→ poll/webhook status paid → issue license → customer terima LICENSE KEY
```

## Api key resolution

> **SUPERSEDED by D-021:** pola "Option A: key handoff" di bawah adalah pola LAMA. Target:
> provider key TIDAK pernah keluar dari Copilot backend; host app memanggil Copilot backend.

```text
plugin install → kirim license → backend validate → resolve api key → simpan .env customer → panggil gRouter langsung
```

## Usage/quota

Dua dimensi terpisah (D-021): **Copilot customer usage** per license (usage ledger Copilot,
enforcement quota customer) ≠ **gRouter infrastructure usage** per service credential
(`/check-usage` read-only, mencakup trafik seluruh customer). Copilot backend consume
`/check-usage` hanya sebagai observability infrastructure.

## Open questions (lock before building)

- gRouter api key generation endpoint (future auto-provision).
- KlikQRIS API key + merchant ID (sandbox credential).
- quota semantics (token-based / request-based).
- session model (untuk auth: JWT vs cookie).
- Google OAuth client credential.
- license server + dashboard deployment shape.

## Rejected (v1)

- backend Copilot menyimpan data aplikasi;
- auto-scan DB;
- fine-tuning;
- marketplace publik;
- open-source;
- validasi online-only;
- embed api key di token license.
