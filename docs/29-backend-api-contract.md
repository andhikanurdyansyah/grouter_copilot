# Backend API Contract — gRouter Copilot (resmi)

> **Source of truth kontrak backend.** Di-enumerasi langsung dari route handler
> `server/src/server.js` (dan `auth.js` untuk `/api/auth/*`). Dibuat oleh I5
> (2026-10-01) — docs lama yang menyebut jumlah/shape berbeda dianggap STALE.
>
> Konvensi umum: JSON in/out. Error shape `{ error: string }`.
> Admin = `Authorization: Bearer <ADMIN_TOKEN>` (401 tanpa token; token kosong
> di env = dev no-auth fallback — JANGAN di production).

## Arsitektur panggilan

Browser HANYA bicara dengan `https://copilot.grouter.id` (frontend :4601),
yang mem-proxy SEMUA `/api/*` ke backend :4600 (tidak publik). Backend juga
menyajikan halaman yang sama secara langsung (dipakai untuk E2E terisolasi).

## Daftar endpoint (backend)

### Auth — Better Auth (`/api/auth/*`, wildcard, session cookie)

Ditangani penuh oleh Better Auth (`toNodeHandler(auth.handler)`), termasuk
email/password, Google OAuth (kondisional), dan plugin organization. Endpoint
yang dipakai frontend:

| Endpoint | Ket |
|---|---|
| `POST /api/auth/sign-up/email` `{email,password,name}` | daftar; set cookie sesi |
| `POST /api/auth/sign-in/email` `{email,password}` | masuk; set cookie sesi |
| `POST /api/auth/sign-out` | keluar |
| `GET /api/auth/get-session` | sesi aktif |
| `POST /api/auth/organization/create` `{name,slug}` | buat organisasi (D-017) |
| `GET /api/auth/organization/list` | daftar organisasi akun |
| `GET /api/auth/organization/get-full-organization?organizationId=…` | members + invitations |

### Customer (session cookie)

| Endpoint | Ket |
|---|---|
| `GET /api/me` | `{account:{id,name,email}, licenses[]}`; 401 tanpa sesi |
| `GET /api/config` | publik: `{providers:{google}, basePath, payment:{enabled,mode}, branding}` |
| `GET /api/plans` | publik: katalog plan aman `{plans[], currency}` |
| `POST /api/orders` `{packageKey}` | 201 `{order, qr}`; 401 tanpa sesi; **400 jika body membawa `amount`/`description`** (A1, harga resolve server-side); 400 unknown/inactive plan |
| `GET /api/orders/latest` | order terakhir akun + license yang terbit bersamanya |
| `GET /api/orders/:id` | order milik akun saja (404 untuk akun lain) |
| `POST /api/heartbeat` `{token,installId,baseUrl?}` | plugin; validasi offline signature + revocation; 403 invalid/revoked |
| `POST /api/resolve` `{token,baseUrl?}` | key handoff: license valid → `{apiKey, baseUrl}`; 403 invalid/revoked; 404 tanpa key bound |

### Admin (`Authorization: Bearer`)

| Endpoint | Ket |
|---|---|
| `GET /api/admin/stats` | agregat lisensi/install |
| `GET /api/admin/licenses` | daftar lisensi (tanpa raw token) |
| `POST /api/admin/licenses` | issue `{customer, accountId?, features?, expiresInDays?, quota?, grouterApiKey?}` → 201 `{license, token}` (token sekali tampil) |
| `POST /api/admin/licenses/:id/revoke` | revoke |
| `POST /api/admin/licenses/:id/bind` | bind gRouter api key `{grouterApiKey}` |
| `GET /api/admin/usage` | consume gRouter `/check-usage` (read-only) per key ter-bound |
| `GET /api/admin/settings` | settings efektif (secrets di-mask `••••<last4>`) |
| `PATCH /api/admin/settings` | patch tervalidasi; section tak dikenal → 400; masked/empty secret = keep |
| `POST /api/admin/orders/:id/settle` | settle manual (jalur sama dengan webhook setelah verifikasi upstream) |

### Payment webhook

| Endpoint | Ket |
|---|---|
| `POST /api/payment/klikqris/webhook` | **TIDAK percaya body** — klaim paid di-re-verify ke KlikQRIS `GET /qris/status/:id`; hanya `SUCCESS/PAID/SETTLEMENT` terverifikasi yang settle; forged → 200 `ignored:unverified:*` / 502 gagal verifikasi |

## Halaman (backend juga menyajikan)

`/` landing · `/landing` · `/register` · `/login` · `/user` · `/admin` (console
admin, token gate) · `/success` · `/checkout/success` · `/assets/*`.

## Settings SSOT (yang bisa di-PATCH)

Section: `plans` · `branding` · `payment` · `usage` · `provider` · `limits` ·
`license` · `auth`. Resolusi: `DEFAULT_SETTINGS ← env seeds ← store.settings`
(D-020). Plans/branding/usage/provider/limits HOT; `auth` + mode payment
dibaca saat boot → butuh `pm2 restart copilot-backend --update-env`.

## Urutan flow pembayaran (A1-safe)

```text
checkout:  POST /api/orders {packageKey}      (tanpa amount — server resolve)
           → order PENDING + QR (harga = plan.amount)
bayar:     webhook terverifikasi ATAU POST /api/admin/orders/:id/settle
           → settlePaid: status PAID + issue license
             (features/expiresInDays/quota dari plan catalogue saat settle)
```
