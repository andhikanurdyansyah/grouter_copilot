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

**Status:** DEFERRED (unchanged, D-016).

**Why:** purchase → auto-generate gRouter api key requires a gRouter
provisioning endpoint contract that does not exist yet.

**Current workaround:** admin binds an existing gRouter api key to a license
manually (`POST /api/admin/licenses/:id/bind`), or at issue time
(`grouterApiKey` field).

**Unblock when:** gRouter exposes a documented api-key-generation endpoint.

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
        └── { id, features[], quota, expiresAt, bound gRouter api key, installs }
```

---

## Payment provider note (KlikQRIS)

- Sign up free at klikqris.com, grab API Key + Merchant ID from dashboard.
- Start with `sandbox` mode; switch to `production` only when ready to accept real money.
- Do NOT store API key in frontend; only server-side (admin API returns it masked).
- Webhook dipakai + di-re-verify upstream; polling browser (QR modal) hanya untuk UI.
