# Backend API Contract — gRouter Copilot (resmi)

> **Source of truth kontrak backend.** Di-enumerasi langsung dari route handler
> `server/src/server.js` (dan `auth.js` untuk `/api/auth/*`). Dibuat oleh I5
> (2026-10-01) — docs lama yang menyebut jumlah/shape berbeda dianggap STALE.
>
> Konvensi umum: JSON in/out. Error shape `{ error: string }`.
> Admin = `Authorization: Bearer *** (401 tanpa token; token kosong
> di env = dev no-auth fallback — JANGAN di production).
> Path ID dengan percent-encoding tidak valid → 400 `{error:'invalid <resource> id'}` **setelah** auth/session check (tanpa auth tetap 401).

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
| `POST /api/auth/sign-up/email` `{email,password,name}` | daftar; set cookie sesi. Sentinel: email invalid → 400, password HIBP → 400 `COMPROMISED_PASSWORD`; min 8 char |
| `POST /api/auth/sign-in/email` `{email,password}` | masuk; set cookie `__Secure-better-auth.session_token` (HttpOnly, Secure, SameSite=Lax, 7 hari); salah → 401 |
| `POST /api/auth/sign-out` | keluar; sesi dihapus |
| `GET /api/auth/get-session` | sesi aktif; **200 body `null` bila tak ada sesi** (bukan error) |
| `POST /api/auth/change-password` `{currentPassword,newPassword}` | wajib header `Origin` (CSRF origin-check; tanpa → 403) |
| `POST /api/auth/request-password-reset` `{email,redirectTo}` | **selalu 200** (anti user-enumeration); token reset dibuat utk email terdaftar; URL ke `sendResetPassword` (saat ini log server) |
| `GET /api/auth/reset-password/:token?callbackURL=…` | 302 ke `callbackURL?token=…` atau `?error=INVALID_TOKEN` |
| `POST /api/auth/reset-password` `{newPassword,token}` | `{status:true}`; token sekali pakai, 1 jam; **mencabut semua sesi user** (`revokeSessionsOnPasswordReset`) |
| `POST /api/auth/organization/create` `{name,slug}` | buat organisasi (D-017) |
| `GET /api/auth/organization/list` | daftar organisasi akun |
| `GET /api/auth/organization/get-full-organization?organizationId=…` | members + invitations |

> Alur lengkap + halaman: lihat **`docs/35-auth-flow.md`** (source of truth alur auth).

### Customer (session cookie)

| Endpoint | Ket |
|---|---|
| `GET /api/me` | `{account:{id,name,email}, licenses[]}`; 401 tanpa sesi |
| `GET /api/config` | publik: `{providers:{google}, basePath, payment:{enabled,mode}, branding}` |
| `GET /api/plans` | publik: katalog plan aman `{plans[], currency}` |
| `POST /api/orders` `{packageKey}` | 201 `{order, qr}`; 401 tanpa sesi; **400 jika body membawa `amount`/`description`** (A1, harga resolve server-side); 400 unknown/inactive plan |
| `GET /api/orders/latest` | order terakhir akun + license yang terbit bersamanya |
| `GET /api/orders/:id` | order milik akun saja (404 untuk akun lain) |
| `GET /api/me/orders/:id/receipt` | receipt printable: session + order milik akun + status `PAID` + linked license milik akun + kapabilitas `print_receipt` (core+, live dari katalog plan; expired/revoked → 403). 200 `{receipt:{orderId,planName,packageKey,amount,status:'PAID',createdAt,paidAt,licenseReference}}`; 401 tanpa sesi; 404 akun lain (tanpa oracle); 409 unpaid/tanpa license tertaut. Response TIDAK memuat QR, signature, token, atau kredensial provider |
| `POST /api/heartbeat` `{token,installId,baseUrl?}` | plugin; validasi offline signature + revocation; 403 invalid/revoked |
| `POST /api/resolve` `{token,baseUrl?}` | plugin/CLI; license valid → `{baseUrl, gatewayUrl, licensePublicKey}` (D-021: **TANPA `apiKey`** — provider key tidak pernah keluar backend; installer menolak payload yang mengandung key); 403 invalid/revoked |
| `GET /api/me/notifications?limit=` | notif akun sendiri (limit ≤200): `{notifications[{id,type,title,titleEn,body,bodyEn,linkKind,linkId,readAt,createdAt}],unread,total}` — `linkKind`/`linkId` menunjuk resource milik akun sendiri; `unread`/`total` = koleksi penuh (bukan slice limit); metadata delivery email (`emailStatus`/`emailedAt`/`emailAttempts`) TIDAK diserialisasi ke customer; event diturunkan server-side dari state nyata (D-022, +`license.expired`/`quota.exhausted`); 401 tanpa sesi |
| `POST /api/me/notifications/:id/read` · `/read-all` | tandai baca per-item / semua (404 bukan milik akun) |
| `POST /api/copilot/chat` `{token, messages[≤40], requestId?, model?, maxTokens?}` | **AI gateway (D-021)** — satu-satunya konsumen service credential. Flow: validate license server-side → validasi messages (≤32KB) → kuota `plan.quotaTokens` per license (server-side plan catalogue, null=unlimited) → reservasi → call gRouter → rekonsiliasi usage → ledger. 200 `{status:'ok',answer,usage{inputTokens,outputTokens},licenseId,quota{unit,limit,usedTokens,requestCount}}`; 400 invalid request; 403 license invalid/revoked; 429 quota exhausted (atau rate-limit); 503 gateway not configured; 502/504 upstream error/timeout. `requestId` duplikat = idempotent replay (tidak dobel charge). Error upstream tidak ditagih. Body customer `{licenseId,plan,quota,…}` diabaikan (server resolve). Rate limit 60/menit/IP |

### Admin (`Authorization: Bearer`)

| Endpoint | Ket |
|---|---|
| `GET /api/admin/stats` | agregat lisensi/install |
| `GET /api/admin/licenses` | daftar lisensi (tanpa raw token) |
| `POST /api/admin/licenses` | issue `{customer, accountId?, planKey?, grouterApiKey?}` → 201 `{license, token}` (token sekali tampil). **Entitlement resolved SERVER-SIDE (D-020):** `features`/`expiresInDays` diambil dari plan katalog (`planKey` valid) atau `license` defaults (tanpa plan); body `features`/`expiresInDays` diabaikan — tidak bisa melebarkan lisensi. `planKey` tak dikenal → 400 `PLAN_NOT_FOUND` (tanpa lisensi dibuat) |
| `POST /api/admin/licenses/:id/revoke` | revoke |
| `POST /api/admin/licenses/:id/bind` | bind gRouter api key `{grouterApiKey}` |
| `GET /api/admin/usage` | consume gRouter `/check-usage` (read-only) **dimensi infrastructure per service credential** — bukan kuota per customer (D-021) |
| `GET /api/admin/settings` | settings efektif (secrets di-mask `••••<last4>`) |
| `PATCH /api/admin/settings` | patch tervalidasi; section tak dikenal → 400; masked/empty secret = keep |
| `GET /api/admin/notifications?limit=` | notif operator generik (D-022, tanpa identitas customer): `{notifications[{id,type,title,titleEn,body,bodyEn,linkKind,linkId,readAt,createdAt}],unread,total}`; 401 tanpa Bearer |
| `POST /api/admin/notifications/:id/read` · `/read-all` | tandai baca per-item / semua; id tak dikenal → 404, id tidak ter-decode → 400 |
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
`license` · `auth` · `notifications` (`schedulerIntervalMs`, `quotaThresholdPercent`
1–100, `expiringSoonDays` 1–30, `maxEmailAttempts` (default 5), `email.*` boolean per-jenis; D-022). Delivery email per baris mengikuti state machine persisted (claim/lease/backoff/klasifikasi `failed`/`ambiguous`/`exhausted`); GET halaman tidak pernah memicu retry — retry hanya dari scheduler. Metadata delivery tetap internal (tidak diserialisasi ke customer). Resolusi: `DEFAULT_SETTINGS ← env seeds ← store.settings`
(D-020). Plans/branding/usage/provider/limits HOT; `auth` + mode payment
dibaca saat boot → butuh `pm2 restart copilot-backend --update-env`.

**`GROUTER_API_KEY` BUKAN store setting (D-021):** kredensial gRouter hanya hidup sebagai
env var server-side (`server/.env`, gitignored) — tidak pernah masuk `store.settings`,
tidak pernah di-PATCH via admin, dan tidak pernah dikembalikan oleh `GET /api/admin/settings`
yang hanya menampung secret payment yang di-mask.

## Urutan flow pembayaran (A1-safe)

```text
checkout:  POST /api/orders {packageKey}      (tanpa amount — server resolve)
           → order PENDING + QR (harga = plan.amount)
bayar:     webhook terverifikasi ATAU POST /api/admin/orders/:id/settle
           → settlePaid: status PAID + issue license
             (features/expiresInDays/quota dari plan catalogue saat settle)
```
