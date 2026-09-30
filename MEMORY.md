# gRouter Copilot — Project Memory (terpisah dari gRouter)

> Memory ini hidup DI DALAM workspace Copilot (`C:/gRouter_copilot/`), terisolasi dari
> memory gRouter (profile grouter-dev). Fakta gRouter TIDAK boleh tercampur ke sini,
> dan fakta Copilot TIDAK boleh masuk ke memory gRouter.

## Identitas & boundary

- gRouter Copilot = product BARU, terpisah total dari gRouter existing (port 20128).
- gRouter existing = supplier AI (API key + model). HANYA read-only (consume `/api/check-usage`).
- Repo: `https://github.com/andhikanurdyansyah/grouter_copilot` (branch `main`).
- Workspace: `C:/gRouter_copilot`.
- Memory ini file manual (`MEMORY.md`), TIDAK auto-load. Dibaca manual tiap mulai kerja.

## Keputusan kunci (lihat docs/15-decision-log.md)

- Plugin, bukan platform SaaS (D-001).
- License-based, NOT open-source (D-008).
- 1 credential customer = LICENSE KEY; api key gRouter di-resolve server-side (D-014).
- Api key TIDAK di-embed di token license (D-015).
- Auto-provisioning api key DEFERRED (D-016).
- 1 akun = banyak license (D-017).
- Payment = KlikQRIS (D-018).
- Google OAuth = PENDING provider (D-019). Auth = Better Auth email/password (DONE).

## Arsitektur

- **Frontend** port 4601 → `copilot.grouter.id` (landing, register, user dashboard, admin; proxy `/api/*` ke backend).
- **Backend** port 4600 → `be.grouter.id` (auth Better Auth, `/api/me`, license, order, webhook, usage).
- pm2 kelola keduanya (`server/ecosystem.config.cjs`): `copilot-backend` + `copilot-frontend`.
- Boot startup: Startup folder user → `gRouter_Copilot.vbs` → `pm2 resurrect`.
- Detail: `docs/27-deployment-architecture.md`.

```text
Plugin (in-process, Node.js/Next.js)
  → skill (developer-defined) → data app
  → gRouter adapter → gRouter (read-only)
  → license gate (offline Ed25519) + heartbeat (best-effort)

Copilot backend (terpisah dari gRouter)
  → license server (mint/revoke/resolve/handoff)
  → usage resolver (consume /check-usage)
  → admin dashboard + landing + register + user dashboard
```

## Kontrak gRouter (read-only, verified live 2026-09-30)

- `GET https://prod.grouter.web.id/api/check-usage?key=<gRouter-api-key>`
- Key format: `gRouter-...` (bukan `sk-`).
- Chat: `POST {baseUrl}/v1/chat/completions` (Bearer api key).
- baseUrl dari `/check-usage` → `integration.baseUrl` (= `https://prod.grouter.web.id/v1`).

## Design system (docs/24-design-system.md)

- Cyberpunk metallic (adaptasi gRouter DESIGN.md): cyan `#22d3ee` primary, gunmetal `#07090d`.
- File: `server/public/assets/grx.css`.
- Halaman: `/landing`, `/register`(+`/login`), `/user`, `/` (admin).

## Test & run

- Plugin test: `node --test` (root) → 47 pass.
- Backend test: `cd server && node --test` → 10 pass.
- Run backend: `cd server && node src/index.js` (port 4600).
- Tanpa npm install (zero dependency).

## Standing conventions

- Bahasa Indonesia untuk laporan (7-section: Summary/What Works/What's Broken/Risks/Plan/Files/Validation).
- JANGAN sentuh gRouter production (port 20128, source, DB, release, watchdog).
- JANGAN campur fakta ke memory gRouter.
- Api key gRouter = secret; tidak pernah commit/embed/browser.

## Pending (belum dibangun)

- Google OAuth backend (client ID, redirect, token exchange, session) — PENDING.
- Auto-provisioning api key gRouter (butuh kontrak endpoint gRouter).
- KlikQRIS payment integration — client DIBANGUN (`server/src/klikqris.js`), TAPI akun sandbox belum aktif (401 "Account Inactive").
- Account + license model (D-017) — DIBANGUN: store `accounts` + `accountId` di license.
- Customer dashboard data wiring (butuh auth + license-per-user).

## KlikQRIS (dibangun, menunggu aktivasi akun)

- Client: `server/src/klikqris.js` (createQris, checkStatus, verifyWebhookSignature, pollUntilSettled).
- Endpoint: `POST https://klikqris.com/api/qris/create`, `GET /api/qris/status/{order_id}`.
- Header: `x-api-key` + `id_merchant`.
- Kredensial di `server/.env` (gitignored, JANGAN commit).
- Status live: KlikQRIS balas 401 "Invalid API Key or Account Inactive" — akun/key perlu diaktifkan di dashboard.
- Kontrak: `docs/26-klikqris-contract.md`.
