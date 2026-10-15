# Evidence — Intro transition hang fixed (normal navigation)

- **Tanggal:** 2026-10-15 UTC
- **Root cause:** intro sebelumnya mengambil `/copilot` via `fetch()`, lalu mengganti dokumen memakai `document.open()`/`document.write()`. Landing memuat resource CDN parser-blocking (Tailwind, Iconify, Unicorn Studio); re-parse selama `document.write()` membuat browser dapat tertahan pada screenshot/navigation dan transisi terlihat stuck.
- **Perbaikan:** `server/public/intro.html` sekarang memakai same-origin browser navigation ke `/copilot` melalui `window.location.href = LANDING_URL`. Tidak ada HTML landing yang ditulis ulang ke dokumen aktif.
- **Regression test:** `server/test/frontend-static-safety.test.js` mengharuskan marker normal navigation dan menolak `document.write(landingHtml)`.
- **RED→GREEN:** dengan perubahan intro di-stash, static-safety test `1 test / 0 pass / 1 fail`; setelah dipulihkan `1 / 1 / 0`.

## Runtime proof

Browser Chromium nyata pada `http://localhost:4601/`:

- Intro boot: `window.__ready=true`.
- Scroll ke akhir memicu navigation.
- URL akhir: `http://localhost:4601/copilot`.
- Judul akhir: `gRouter Copilot | Embedded AI Runtime`.
- Landing icons: 54.
- Landing canvas: tersedia.

Public/local route checks: `/` 200, `/copilot` 200, public origin `/` 200.

## Regression matrix after fix

- Server: **118/118 pass**.
- Root: **117/117 pass**.
- Frontend TypeScript: exit 0.
- Frontend ESLint: **0 errors**, 10 warnings non-blocking.
- Frontend build: sukses, exit 0.
- Production data fingerprint aggregate identik sebelum/sesudah suite final.
- Frontend PM2 restarted non-destructively and live route verified.
