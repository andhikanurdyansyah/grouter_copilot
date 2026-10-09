# Handoff — Redesign Enterprise Dashboard (2026-10-08)

## Keputusan baru
- **D-021 (UI):** Dashboard customer & admin = SPA shadcn-admin (MIT) di `frontend/`, build Vite → `server/public/app` (base `/app/`), served via `frontendServer.js` dengan fallback HTML legacy bila dist tidak ada. Route: `/user/*`, `/admin/*`, gate `/admin-gate`. Landing 7-file protected TIDAK disentuh (checksum `/tmp/protected_v3.sha256` 7/7 OK).
- **D-022 (Design system):** Komponen shared wajib dipakai halaman baru: `PageHeader`, `StatusBadge` (tone semantik), `MetricCard`, `TableSkeleton/EmptyState/ErrorState` — sumber: `frontend/src/components/shared/`.
- **D-023 (Test scoping):** Root `npm test` = `node --test "test/**/*.test.js"` (plugin). Frontend test dihapus dari repo sampai harness vitest+browser siap (jangan pick oleh node --test root).

## State saat ini (verified live)
- HEAD `c8343ce` pushed (origin/main = local). pm2 2/2 online.
- axe-core: 0 violations (admin-licenses/packages/orders/gate). Keyboard walk 14/14 focus-visible.
- E2E verified: admin gate→overview→licenses (sort/search/copy/revoke-dialog) → orders (settle dialog dismiss = 0 POST); customer register→overview→orders.
- Tests: root 65/65, server 87/87.

## API contract penting (frontend)
- `/api/admin/ledger` → `{records[], total, limit, offset}`, epoch-ms timestamps, `totalTokens`, `errorClassification`.
- `/api/admin/orders` → `{orders[]}` epoch-ms, `planName`, `quota`.
- Admin license issue POST `/api/admin/licenses` `{customer?, planKey?}`; revoke POST `/api/admin/licenses/:id/revoke`.
- Settlement: POST `/api/admin/orders/:id/settle` — server re-verify KlikQRIS upstream dulu (409 bila belum dibayar).

## Sisa pekerjaan (jujur)
- Pagination server-side admin licenses (data kecil; footer count client-side).
- vitest + browser harness utk frontend test.
- Axe 'region' fixed via CommandMenu gated render — cek ulang bila Radix dialog baru ditambahkan (pola: render saat open saja).
- before/after screenshots: `/root/shots-redesign/after/*.png` (before: `/tmp/spa-*.png`, `/tmp/shot-*.png`).
