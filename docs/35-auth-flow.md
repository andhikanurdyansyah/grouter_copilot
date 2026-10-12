# 35 — Alur Autentikasi (Source of Truth)

> Status: **AKTIF** (2026-10-12, HEAD 4de69b6). Provider: **Better Auth 1.7.6** (DB: `server/data/auth.sqlite`).
> Dokumen ini adalah acuan tunggal alur auth. Bila kode berubah, update dokumen ini di commit yang sama.

## 1. Halaman & Routing

| URL | Halaman | Design | File |
|---|---|---|---|
| `/login` | Sign-in (email+password, link forgot & sign-up) | Aurora (Three.js) | `server/public/register.html` |
| `/login/sign-up` | Sign-up **email murni** (tanpa social) | shadcn glass (`/app/sign-up`) | SPA route `frontend/src/routes/login/sign-up.tsx` |
| `/reset-password` | Set password baru (dari link email) | Aurora | `server/public/reset-password.html` |
| `/register` | → 302 ke `/login/sign-up` | — | (redirect FE & BE) |
| `/app/sign-up` | Showcase komponen (mode simulasi) | shadcn glass | SPA route `frontend/src/routes/sign-up.tsx` |
| `/app/user` | Dashboard customer (gated) | shadcn dashboard | SPA |

CTA "Get Started" di landing (`/copilot`) → `/login` (link header + 2 tombol pricing).

## 2. Endpoint Better Auth (kontrak terverifikasi dari source 1.7.6)

| Endpoint | Method | Payload | Perilaku |
|---|---|---|---|
| `/api/auth/sign-up/email` | POST | `{name, email, password}` | 200 → sesi+cookie. Sentinel: tolak email invalid (400), password kena HIBP → 400 `COMPROMISED_PASSWORD`. min 8 char. |
| `/api/auth/sign-in/email` | POST | `{email, password}` | 200 + `Set-Cookie __Secure-better-auth.session_token` (HttpOnly, Secure, SameSite=Lax, 7 hari). Salah → 401 `Invalid email or password`. |
| `/api/auth/get-session` | GET | — | 200 + objek sesi bila valid; **200 body `null`** bila tidak (jangan anggap error). |
| `/api/auth/change-password` | POST | `{currentPassword, newPassword}` | Wajib header `Origin` (CSRF origin-check; tanpa Origin → 403). |
| `/api/auth/request-password-reset` | POST | `{email, redirectTo}` | **Selalu 200** (anti user-enumeration). Token dibuat hanya utk email terdaftar. |
| `/api/auth/reset-password/:token` | GET | query `callbackURL` | 302 ke `callbackURL?token=…` atau `?error=INVALID_TOKEN`. |
| `/api/auth/reset-password` | POST | `{newPassword, token}` | `{status:true}`. Token sekali pakai, kedaluwarsa 1 jam. |
| `/api/auth/sign-out` | POST | `{}` | `{success:true}`; sesi dihapus. |

## 3. Konfigurasi (`server/src/auth.js` → `emailAndPassword`)

- `enabled: true`, `minPasswordLength: 8`
- `sendResetPassword`: **log URL reset ke log server** (`[auth] password reset untuk <email>: <url>`). Pengiriman email nyata = backlog (butuh mailer + kredensial, keputusan PO).
- `resetPasswordTokenExpiresIn: 3600` (1 jam)
- `revokeSessionsOnPasswordReset: true` — **terverifikasi**: setelah reset, cookie sesi lama → `get-session` body `null`.
- `onPasswordReset`: log `[auth] password direset untuk <email>`.

## 4. Alur Pengguna (happy path)

### 4.1 Daftar akun (email)
1. Landing → klik **Get Started** → `/login`.
2. Klik **Sign up** → `/login/sign-up` (SPA shadcn).
3. Masukkan email → Enter → buat password → Enter → konfirmasi → Enter.
4. `POST /api/auth/sign-up/email` `{name=local-part email, email, password}` → modal sukses + confetti → redirect `/user` → shell `/app/user`.

### 4.2 Masuk
1. `/login` → email + password → **Sign In**.
2. 200 → redirect `/user` (shell `/app/user`).

### 4.3 Lupa password
1. `/login` → klik **Forgot password?** → panel inline ganti form.
2. Masukkan email → **Send reset link** → `POST /api/auth/request-password-reset {email, redirectTo: <origin>/reset-password}` → pesan generik (apapun hasilnya).
3. (Bila mailer aktif) email berisi link `<BE>/api/auth/reset-password/<token>?callbackURL=<origin>/reset-password`.
4. User buka link → 302 ke `/reset-password?token=…` → isi password baru + konfirmasi → `POST /api/auth/reset-password` → state sukses → **semua sesi lama dicabut** → kembali ke `/login`.
5. Tanpa/invalid token → form disembunyikan, notice + link ke `/login`.

### 4.4 Keluar
Dashboard → menu user (sidebar) → **Sign out** → dialog konfirmasi → `POST /api/auth/sign-out` → sesi habis.

## 5. API Data User (gated)

- `GET /api/me` — **401 tanpa sesi**, 200 `{account, licenses, usage}` dengan sesi. Dipakai dashboard `/app/user`.

## 6. Keamanan yang Aktif (teruji)

- Cookie `HttpOnly + Secure + SameSite=Lax`, prefix `__Secure-`.
- CSRF origin-check utk endpoint sensitif (change-password 403 tanpa Origin).
- Rate limit auth: 20 req/10 dtk per IP (custom rule, lihat komentar di `auth.js`).
- Sentinel password: cek HIBP breach + validasi email (`emailValidation: enabled`, compromised → block).
- Anti user-enumeration di request-password-reset.
- Token reset sekali pakai, 1 jam, revoke semua sesi setelah reset.
- **Belum ada**: security headers (CSP/X-Frame-Options) di `frontendServer.js` — lihat `docs/25-pending-implementations.md`.

## 7. Temuan Audit 2026-10-12 (non-blocking)

1. **Ganti password dari UI dashboard belum ada** — endpoint `/api/auth/change-password` siap; perlu form di `/app/user` (backlog UX).
2. **Email reset belum terkirim nyata** — URL reset hanya di log server; aktivasi butuh mailer (SMTP/Resend) + kredensial (keputusan PO; runbook menyusul di docs ini §8).
3. Security headers belum diset (lihat atas).
