# Pending Implementations — gRouter Copilot

> Things explicitly deferred or pending. Each has a reason, a blocker, and what
> to do when it becomes active. **Ditinjau ulang I5 (2026-10-01)** — status lama
> (P-001/003/004/005 "NOT STARTED/PENDING/PARTIAL") sudah tidak akurat; daftar
> di bawah mencerminkan realita kode.

## P-001 — Google OAuth provider

**Status:** DONE (enabled purely by env).

**What exists:**
- Better Auth email/password + `socialProviders.google` kondisional di `auth.js`
  (aktif hanya saat `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` terisi).
- Register/login menampilkan tombol Google dari `GET /api/config` (`providers.google`).
- Single-origin callback: `https://copilot.grouter.id/api/auth/callback/google`.

**Remaining:** nothing in code. Rotasi kredensial/verifikasi consent screen
Google adalah operasi ops (docs/28).

---

## P-002 — Auto-provisioning gRouter api key

**Status:** REJECTED for MVP (D-021, 2026-10-08) — supersedes DEFERRED (D-016 tetap dicatat
sebagai keputusan historis).

**Why:** Arsitektur target = Copilot memanggil gRouter dengan **SATU service credential**
(`GROUTER_API_KEY` di Copilot backend). Tidak ada provisioning per-customer yang dibutuhkan
untuk MVP; "purchase → create gRouter customer → create api key → attach" bukan bagian dari
payment lifecycle.

**If revisited:** hanya saat kebutuhan bisnis per-tenant identity muncul (future evolution,
`docs/04-solution-architecture.md` §10) dan gRouter punya provisioning endpoint terdokumentasi.

---

## P-003 — KlikQRIS payment integration

**Status:** DONE (live, sandbox mode).

**What exists (verified):**
- `server/src/klikqris.js`: `createQris`, `checkStatus`, `isPaidStatus`
  (`SUCCESS`/`PAID`/`SETTLEMENT`), `pollUntilSettled`, mode-aware base URL
  (+ optional settings override `payment.klikqrisBaseUrl`).
- Order flow A1-safe: `POST /api/orders {packageKey}` — harga resolve
  server-side dari plan catalogue; body amount ditolak.
- Webhook anti-forgery: klaim lunas di-re-verify ke `GET /qris/status/:id`
  sebelum `settlePaid` → license (entitlement dari plan, A3).
- Admin settle path: `POST /api/admin/orders/:id/settle`.
- Sandbox payment SIMULATION hanya via dashboard KlikQRIS (manual, 1 klik
  operator) — tidak ada simulate API publik.

**Remaining (ops, bukan kode):** pindah `KLIKQRIS_MODE=production` +
kredensial produksi saat go-live.

---

## P-004 — Customer dashboard data wiring

**Status:** DONE.

**What exists:**
- `/user` dashboard live dari session: `GET /api/me` → account + licenses
  (1 akun = N license, D-017), organization UI (create/list/members).
- Katalog paket dari `GET /api/plans` (tanpa harga hardcode di browser, A2).
- Checkout in-page: modal QR + poll `GET /api/orders/:id` → PAID → license.
- `/success` post-payment landing (poll `GET /api/orders/latest`).

---

## P-005 — Account & license data model

**Status:** DONE.

**Model (D-017) implemented in the store + `accountService.js`:**
```text
Account (customer, from Better Auth session — ensureAccount)
  └── License 1..N
        └── { id, features[], quota, expiresAt, installs }
```
*(Field `grouterApiKey` per-license masih ada di store sebagai legacy pra-D-021 — jangan
dipakai untuk integrasi baru; arsitektur target memakai satu service credential di backend.)*

---

## Payment provider note (KlikQRIS)

- Sign up free at klikqris.com, grab API Key + Merchant ID from dashboard.
- Start with `sandbox` mode; switch to `production` only when ready to accept real money.
- Do NOT store API key in frontend; only server-side (admin API returns it masked).
- Webhook dipakai + di-re-verify upstream; polling browser (QR modal) hanya untuk UI.

---

## Auth backlog (hasil audit 2026-10-12 — lihat docs/35-auth-flow.md §7)

1. ~~**Ganti password dari UI dashboard**~~ — **SELESAI 2026-10-12**: dialog
   `ChangePasswordDialog` di dropdown akun sidebar (`app-sidebar.tsx`); E2E terverifikasi.
2. **Kirim email reset password nyata** — kode mailer Resend (env-driven, zero-dep) sudah AKTIF
   di `auth.js` (`sendResetPassword`): bila `RESEND_API_KEY` diset di `server/.env` → email nyata
   terkirim; bila tidak → URL di-log server. **Tersisa: isi kredensial Resend (keputusan PO —
   jangan commit kredensial) + verifikasi email masuk.**
3. ~~**Security headers di frontendServer**~~ — **SELESAI 2026-10-12**: nosniff, X-Frame-Options
   DENY, Referrer-Policy, Permissions-Policy, CSP (inline utk Aurora/Tailwind CDN, frame-ancestors
   'none'); disuntik ke semua response frontend; terverifikasi live.
4. Halaman `/app/sign-up` (SPA) masih mode showcase/simulasi — pertahankan sebagai demo komponen;
   jalur sign-up resmi = `/login/sign-up`.

---

## Temuan verifikasi CLI installer (Worker B, 2026-10-13 — belum ada tindak lanjut kode)

Verifikasi CLI dari tarball (`npm pack` → fresh install → `install` sukses/gagal → health → chat)
menemukan kesenjangan yang butuh keputusan/perbaikan kode (docs/install-guide.md ditulis
sesuai REALITA, bukan niat):

1. **Dashboard customer menampilkan perintah install dengan LICENSE ID, bukan token lisensi.**
   `frontend/src/features/customer/install.tsx` membangun
   `npx @grouter/copilot install --license ${licenseId}` — padahal CLI menuntut token
   Ed25519 (terverifikasi: License ID → 403 `Malformed license`). Halaman `/success`
   (`server/public/success.html`) sudah benar (menyertakan `license.token` dari
   `GET /api/orders/latest`). Token hanya tampil SEKALI setelah pembayaran; dashboard
   belum punya jalur "lihat ulang token" → pemilik lisensi lama bisa kehilangan akses install.
2. **Node tidak memuat `.env` otomatis** — scaffold + langkah "Restart your app" membuat
   runtime gagal (`health` 503 license:false, chat 500 `License verifier is not configured`)
   jika customer tidak memakai `node --env-file=.env` (≥20.6) atau memuat env sendiri.
   Pertimbangkan: cetak peringatan eksplisit di output installer atau scaffold loader env.
3. **`copilot.config.js` hasil scaffold adalah ESM** (`import …`) tanpa guard `package.json`
   `"type":"module"` — di proyek CommonJS tanpa `type`, `createCopilot` gagal
   `Cannot use import statement outside a module` (terverifikasi live). Pertimbangkan
   scaffold `.mjs` atau deteksi type proyek.
4. Handler rute Node/Express scaffold memakai API `res.status(...).json(...)` Express —
   di host `http` polos gagal `TypeError: res.status is not a function` (terverifikasi).
   Output installer untuk "Node.js (vanilla)" tidak menyebut kebutuhan Express.
