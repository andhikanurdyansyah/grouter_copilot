# gRouter Copilot — Project Memory (terpisah dari gRouter)

> Memory ini hidup DI DALAM workspace Copilot (`C:/gRouter_copilot/`), terisolasi dari
> memory gRouter (profile grouter-dev). Fakta gRouter TIDAK boleh tercampur ke sini,
> dan fakta Copilot TIDAK boleh masuk ke memory gRouter.

## START DI SINI

- **Baca `docs/handoff-2026-10-02.md` DULU** (status terbaru: UI v3 + routing real-path, pushed).
  Baseline lama: `docs/handoff-2026-10-01.md` (safety rules + gotcha §8 masih berlaku).
- Docs = source of truth. Beberapa doc MASIH STALE — lihat @section "Docs stale" di bawah.

## Identitas & boundary

- gRouter Copilot = product BARU, terpisah total dari gRouter existing (port 20128).
- gRouter existing = supplier AI (API key + model). HANYA read-only (consume `/api/check-usage`).
- Repo: `https://github.com/andhikanurdyansyah/grouter_copilot` (branch `main`).
- Workspace: `C:/gRouter_copilot`. Memory ini file manual (`MEMORY.md`), TIDAK auto-load.

## Keputusan kunci (lihat docs/15-decision-log.md)

- Plugin, bukan platform SaaS (D-001). License-based, NOT open-source (D-008).
- 1 credential customer = LICENSE KEY; api key gRouter di-resolve server-side (D-014).
- Api key TIDAK di-embed di token license (D-015). Auto-provisioning DEFERRED (D-016).
- 1 akun = banyak license (D-017). Payment = KlikQRIS (D-018). Google OAuth (D-019).
- **D-020 — Runtime config SSOT: `DEFAULT_SETTINGS <- env seeds <- store.settings`.**
  Env = seed saja; admin panel menulis ke store. **Tidak boleh hardcode configurable value.**
  Cost-integrity: harga order WAJIB resolve server-side dari plan, jangan percaya `body.amount`.

## Arsitektur (AKTUAL — SINGLE origin)

- **Frontend** port 4601 → `copilot.grouter.id` (landing, register, user, admin; proxy `/api/*`).
- **Backend** port 4600 (TIDAK publik) — auth Better Auth, `/api/me`, orders, webhook, admin.
- `be.grouter.id` **SUDAH TIDAK DIPAKAI**. pm2: `copilot-backend` + `copilot-frontend`.
- Boot: Startup folder `.vbs` → `pm2 resurrect`.

```text
Plugin (in-process) → skill → data app → gRouter adapter → gRouter (read-only)
                 → license gate (offline Ed25519) + heartbeat (best-effort)
Copilot backend  → license server (mint/revoke/resolve/handoff)
                 → usage resolver (/check-usage) → admin + landing + register + user + settings
```

## Settings SSOT

- `server/src/settings.js`: `DEFAULT_SETTINGS`, `resolveSettings()`, `validateSettings()`, `maskSettings()`, `publicPlans()`, `findPlan()`.
- `store.getSettings()/updateSettings()` → persist di `store.json` (gitignored).
- Endpoint: publik `GET /api/plans`; admin `GET|PATCH /api/admin/settings` (secret di-mask `••••<last4>`).
- **I3 wiring (`92cf9fb`):** klikqris mode/baseUrl (`payment.klikqrisBaseUrl`), usageResolver
  (url+TTL), auth (trustedOrigins/sentinel/minPasswordLength dari settings; `be.grouter.id`
  DIHAPUS dari default), adapter default `https://prod.grouter.web.id` (A4; adapter append
  `/v1/chat/completions` sendiri — base TANPA `/v1`).
- **I4 panel Settings (`61b8e67`):** tab Plans/Branding/Payment/Provider&Limits di `/admin`;
  plans HOT, auth+mode payment butuh restart.

## Kontrak API

- **`docs/29-backend-api-contract.md` = kontrak resmi** (19 route + `/api/auth/*`, di-enumerasi dari kode).

## Cost-integrity (A1 — CLOSED, live sejak 2026-10-01, commit `36c99b1`)

- `POST /api/orders`: HANYA terima `packageKey`. Body dengan `amount`/`description` → **400**.
  Harga + `planName` + `quota` resolve dari plan catalogue (unknown/inactive → 400).
- `paymentService.createOrder({plan, accountId})`; `settlePaid` resolve
  `features`/`expiresInDays`/`quota` dari plan catalogue SAAT SETTLE (A3 closed) —
  fallback ke `license.defaultFeatures`/`defaultExpiresInDays` hanya jika plan sudah dihapus.
- `licenseService.issue()` terima `quota` → masuk token payload + record.
- Order record punya `planName` + `quota`; `/success` + dashboard tampilkan dari situ.
- Browser TIDAK menyimpan harga: dashboard fetch `GET /api/plans` (`loadPlans()`), checkout kirim `packageKey` saja.

## Kontrak gRouter (read-only, verified live 2026-09-30)

- `GET https://prod.grouter.web.id/api/check-usage?key=<gRouter-api-key>`
- Key format: `gRouter-...` (bukan `sk-`). Chat: `POST {baseUrl}/v1/chat/completions` (Bearer).
- baseUrl dari `/check-usage` → `integration.baseUrl` (= `https://prod.grouter.web.id/v1`).

## Design system (docs/24-design-system.md)

- Cyberpunk metallic: cyan `#22d3ee` primary, gunmetal `#07090d`. File: `server/public/assets/grx.css`.
- Halaman: `/landing`, `/register`(+`/login`), `/user`, `/success`, `/` + `/admin`.

## Test & run

- Plugin test: `node --test` (root) → **71 pass**.
- Backend test: `cd server && node --test` → **34 pass** (termasuk `cost-integrity.test.js`). (Windows: JANGAN `node --test test/`.)
- Run backend: `cd server && node src/index.js` (port 4600). Tanpa npm install (zero dependency).
- Instance terisolasi: `DATA_FILE=<tmp> PORT=4690 node src/index.js` (pakai path `$LOCALAPPDATA/Temp`, bukan `/tmp` MSYS).
- Test ber-session: set env auth SEBELUM import `server.js` (dynamic import) + copy `server/data/auth.sqlite` ke tmp lalu clear semua row (`foreign_keys=OFF`) — pola di `server/test/cost-integrity.test.js`.

## Docs stale (SUDAH DIREKONSILIASI I5, 2026-10-01)

- ~~`docs/27`, `docs/28`, `docs/26`, `docs/25`, `docs/22`, `docs/00/01`~~ ✅ semua sudah
  direkonsiliasi ke realita kode. Kontrak resmi: **`docs/29-backend-api-contract.md`**.
- Tetap ingat: `be.grouter.id` TIDAK dipakai (single origin `copilot.grouter.id`).

## Pending / terbuka (ringkas — detail di handoff §4)

- ~~A1~~ ✅ closed (I2). ~~A2~~ ✅ closed. ~~A3~~ ✅ closed. ~~A4~~ ✅ closed (I3).
- ~~I3 wiring config~~ ✅ (`92cf9fb`). ~~I4 panel Settings~~ ✅ (`61b8e67`). ~~I5 rekonsiliasi docs~~ ✅.
- **Ops go-live (butuh keputusan/aksi Jie):** `KLIKQRIS_MODE=production` + kredensial produksi;
  persist license keypair (LICENSE_PRIVATE_KEY_PEM/PUBLIC) sebelum license nyata; isi
  `ADMIN_TOKEN` produksi; checklist lengkap di `docs/28` §Checklist.

## Standing conventions

- Bahasa Indonesia untuk laporan (7-section: Summary/What Works/What's Broken/Risks/Plan/Files/Validation).
- JANGAN sentuh gRouter production (port 20128, source, DB, release, watchdog).
- JANGAN campur fakta ke memory gRouter. Api key gRouter = secret (tak pernah commit/embed/browser).
- Restart prod non-destruktif: `pm2 restart copilot-backend --update-env`.

## Gotcha penting

- **Tool output menyanitasi string mirip-secret** (`body.grouterApiKey` bisa tampil `body.g...iKey`) → BUKAN bug; verifikasi `od -c`/`node -e`/probe runtime dulu.
- **KlikQRIS sandbox tak punya API simulator** — simulasi bayar hanya dari dashboard KlikQRIS (manual 1 klik).
- **KlikQRIS menandai lunas = `SUCCESS`** (bukan `PAID`) → pakai `isPaidStatus()`/`PAID_STATES`.
- **Order prod PAID tapi KlikQRIS EXPIRED** (`ord_muoizb2w_al70`, `ord_muojvlen_5xe3`) = sisa admin-settle, bukan bayar nyata.
- **Custom `assert()` menimpa module `node:assert`** di skrip probe → `assert.deepEqual is not a function`; pakai `JSON.stringify` compare.
- **Fresh/empty auth.sqlite crash** (`SchemaMismatchError`) → selalu copy schema prod lalu DELETE semua row.

## KlikQRIS

- Client: `server/src/klikqris.js` (createQris, checkStatus, pollUntilSettled, isPaidStatus/PAID_STATES/TERMINAL_STATES).
- Base mode-aware: sandbox `https://klikqris.com/api/sandbox`, production `.../api`. Header `x-api-key` + `id_merchant`.
- Kredensial di `server/.env` (gitignored, JANGAN commit). **Mode sekarang: `sandbox`.**
- Kontrak: `docs/26-klikqris-contract.md`.
