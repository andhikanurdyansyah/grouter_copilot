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
- **Security headers: SUDAH ADA (2026-10-12).** `frontendServer.js` menyuntik CSP (`frame-ancestors 'none'`),
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`
  ke SEMUA response frontend. §7 item 3 di bawah. (Teks lama "belum ada" sudah usang.)

## 7. Hasil Audit 2026-10-12 & Tindak Lanjut

Audit live pertama: semua endpoint ✓ (lihat riwayat di handoff-2026-10-12). Tindak lanjut yang
**sudah dieksekusi** di hari yang sama:

1. **Ganti password dari UI dashboard — SELESAI.** Dialog `ChangePasswordDialog`
   (`frontend/src/components/change-password-dialog.tsx`), diakses dari dropdown akun di sidebar
   (`app-sidebar.tsx` → menu "Ubah password"). Alur: currentPassword+newPassword+confirm →
   `POST /api/auth/change-password` (Origin otomatis dari browser) → state sukses.
   E2E terverifikasi: submit → "Password diubah" → login pw baru 200, pw lama 401.
   Catatan: change-password TIDAK mencabut sesi lain (hanya reset password yang mencabut —
   `revokeSessionsOnPasswordReset`).
2. **Mailer reset password — FONDASI AKTIF (env-driven, zero-dependency).** `sendResetPassword`
   di `auth.js`: bila env `BREVO_API_KEY` diset → kirim email nyata via Brevo HTTP API (fetch
   bawaan Node); bila tidak → URL reset di-log server (perilaku lama). `MAIL_FROM` opsional.
   Kredensial diisi di `server/.env` (JANGAN di-commit; contoh di `.env.example`). Menunggu
   kredensial/keputusan PO untuk aktivasi nyata.
3. **Security headers — SELESAI.** `frontendServer.js` menyuntik header ke SEMUA response
   frontend via wrapper `res.writeHead`: `X-Content-Type-Options: nosniff`,
   `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, dan CSP
   (inline script diizinkan utk Aurora login + Tailwind CDN + fonts + Three.js CDN;
   `frame-ancestors 'none'`). Terverifikasi live di `/login`.

Regresi setelah perubahan: backend 91/91, plugin 175/175, tsc 0 error (snapshot 2026-10-12;
**historis**). Baseline terukur 2026-10-13 (HEAD `3d2bda8`): backend **118/118**, plugin **105/105** — lihat
`docs/docs-reconciliation-2026-10-13.md`.
