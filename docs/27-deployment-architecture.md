# Deployment Architecture — gRouter Copilot

> **SINGLE public origin** `https://copilot.grouter.id` (diperbarui I5,
> 2026-10-01 — membatalkan konfigurasi two-origin lama). `be.grouter.id` sudah
> dihapus dari Cloudflare Tunnel dan TIDAK dipakai lagi. Keduanya independen
> dari gRouter (port 20128).

## Ports & domains

| Service | Local port | Public domain | Serves |
|---|---|---|---|
| Frontend | 4601 | `copilot.grouter.id` | landing, register, user dashboard, admin console; **proxy `/api/*` → backend** |
| Backend | 4600 | (tidak publik) | Better Auth (`/api/auth/*`), `/api/me`, orders, webhook, admin API |

Browser hanya melihat satu origin → cookie sesi first-party (host-only),
tidak perlu cross-subdomain cookie.

### Surface split (customer vs admin)

- **`/`** → customer landing (frontend DAN backend). Never the admin gate.
- **`/admin`** → admin console (token gate). Admin-only APIs live under **`/api/admin/*`**.
- Customer APIs (`/api/me`, `/api/orders`, `/api/config`, `/api/plans`, `/api/auth/*`) never carry admin paths.
- OAuth failures redirect to the customer origin (`errorCallbackURL`) so a customer never lands on the admin surface.

## Cloudflare Tunnel

```
copilot.grouter.id  →  localhost:4601
```

## Process manager (pm2)

Both processes are managed by pm2:

```
copilot-backend   → src/index.js     (PORT=4600)
copilot-frontend  → src/frontend.js  (FRONTEND_PORT=4601, BACKEND_URL=http://127.0.0.1:4600)
```

Boot startup: `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\gRouter_Copilot.vbs`
(user logon → runs `ops/copilot-startup.cmd` → `pm2 resurrect`).

Restart backend non-destruktif: `pm2 restart copilot-backend --update-env`.

## Backend API contract

Kontrak LENGKAP dan resmi: **`docs/29-backend-api-contract.md`** (sumber:
route handler di `server/src/server.js`). Ringkasan:

### Auth (Better Auth, mount `/api/auth/*`)
- `POST /api/auth/sign-up/email` `{email, password, name}` → set session cookie.
- `POST /api/auth/sign-in/email` `{email, password}` → set session cookie.
- `GET  /api/auth/get-session` → session aktif.
- Organization plugin: `POST /api/auth/organization/create`, `GET /api/auth/organization/list`, `GET /api/auth/organization/get-full-organization`.

### Customer
- `GET /api/me` (cookie) → `{account, licenses[]}` | 401.
- `GET /api/plans` → katalog plan publik (harga resolve server-side untuk checkout — A1).
- `POST /api/orders` `{packageKey}` (cookie) → `{order, qr}`; body dengan `amount`/`description` → 400; accountId dari session.
- `GET /api/orders/latest` · `GET /api/orders/:id` — session-scoped.
- `POST /api/payment/klikqris/webhook` — re-verify ke KlikQRIS sebelum settle.

### Admin (Bearer ADMIN_TOKEN)
- `GET /api/admin/stats` · `GET /api/admin/licenses` · `POST /api/admin/licenses` ·
  `POST /api/admin/licenses/:id/revoke` · `POST /api/admin/licenses/:id/bind` ·
  `GET /api/admin/usage` · `GET|PATCH /api/admin/settings` ·
  `POST /api/admin/orders/:id/settle`.

## Frontend routing (frontendServer.js)

```
/          → landing.html
/landing   → landing.html
/register  → register.html
/login     → register.html
/user      → user-dashboard.html
/success   → success.html   (post-payment landing; target redirect KlikQRIS)
/checkout/success → success.html
/admin     → dashboard.html
/assets/*  → static
/api/*     → proxied to backend
```

## OAuth / Better Auth notes (single origin)

- `BETTER_AUTH_URL=https://copilot.grouter.id` — Better Auth derives the Google
  `redirect_uri` dari sini (`{BETTER_AUTH_URL}/api/auth/callback/google`).
- `BETTER_AUTH_TRUSTED_ORIGINS=https://copilot.grouter.id,http://localhost:4601,http://127.0.0.1:4601`
  (juga default di settings; seed env masih menang sebagai layer env).
- Google Console: Authorized JavaScript origin `https://copilot.grouter.id`;
  redirect URI `https://copilot.grouter.id/api/auth/callback/google`.
- Origin check menolak origin tak-terdaftar HANYA saat request membawa cookie
  (perilaku Better Auth) → 403 `INVALID_ORIGIN`.

## Safety

- gRouter production (port 20128) is a separate repo/process. NEVER touched by Copilot work.
- `.env`, `server/data/`, license keys, sqlite files, logs — all gitignored.
