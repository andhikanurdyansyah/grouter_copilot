# Deployment Architecture — gRouter Copilot

> Frontend and backend run as separate origins. Both are independent from gRouter (port 20128).

## Ports & domains

| Service | Local port | Public domain | Serves |
|---|---|---|---|
| Frontend | 4601 | `copilot.grouter.id` | landing, register, user dashboard, admin dashboard; proxies `/api/*` to backend |
| Backend | 4600 | `be.grouter.id` | `/api/auth/*` (Better Auth), `/api/me`, `/api/licenses`, `/api/orders`, `/api/payment/klikqris/webhook`, `/api/usage` |

## Cloudflare Tunnel

```
copilot.grouter.id  →  localhost:4601
be.grouter.id       →  localhost:4600
```

## Process manager (pm2)

Both processes are managed by pm2 (see `server/ecosystem.config.cjs`):

```
copilot-backend   → src/index.js     (PORT=4600)
copilot-frontend  → src/frontend.js  (FRONTEND_PORT=4601, BACKEND_URL=http://127.0.0.1:4600)
```

Boot startup: `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\gRouter_Copilot.vbs`
(user logon → runs `ops/copilot-startup.cmd` → `pm2 resurrect`).

## Backend API contract

### Auth (Better Auth, mount `/api/auth`)
- `POST /api/auth/sign-up/email` `{email, password, name}` → `{token, user}`; sets session cookie.
- `POST /api/auth/sign-in/email` `{email, password}` → `{token, user}`; sets session cookie.
- `GET  /api/auth/get-session` → `{session, user} | null`.

### App
- `GET  /api/me` (cookie) → `{account:{id,name,email}, licenses:[...]}` | 401.
- `POST /api/orders` `{accountId, packageKey, amount, description}` → `{order, qr:{qrUrl,qrImage,expiredAt}}`.
- `POST /api/payment/klikqris/webhook` `{order_id, status}` → settles order, issues license.

### Admin
- `GET  /api/stats`, `GET /api/licenses`, `POST /api/licenses`, `POST /api/licenses/:id/revoke`,
  `POST /api/licenses/:id/bind`, `GET /api/usage` — require `Authorization: Bearer <ADMIN_TOKEN>` when set.

## Frontend routing (frontendServer.js)

```
/          → landing.html
/landing   → landing.html
/register  → register.html
/login     → register.html
/user      → user-dashboard.html
/admin     → dashboard.html
/assets/*  → static
/api/*     → proxied to backend
```

## Safety

- gRouter production (port 20128) is a separate repo/process. NEVER touched by Copilot work.
- `.env`, `server/data/`, license keys, sqlite files, logs — all gitignored.