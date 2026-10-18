# Defect register konsolidasi — mandat Full Product Readiness (2026-10-18)

Baseline: HEAD `5948420` (== origin/main). Sumber: audit worker deleg_96d9e999
(frontend UX + backend/security + regression) yang DIVERIFIKASI supervisor dari
kode nyata (probe temp + baca file:line). Status: [VERIFIED] = terbukti baca/
probe supervisor · [PENDING] = klaim worker, belum diverifikasi.

## Update rilis 2026-10-18 (supervisor, bukti test live)
- Backend `3e9fe4c` LIVE: A-01, A-02, A-06, A-07, A-10.
- FE-P0 `e1a59b8`+`d2a7955` LIVE: D-01..D-05.
- FE-P1 `05622f4`+`4674e9e` LIVE: D-06, D-07, D-08, D-09, D-11, D-12, D-19.
- P2/P3 `11bea49`+`2d565f6` LIVE: A-03 (disclosure restart-only; hot-reload penuh DITOLAK — `settings-wiring.test.js` mengunci wiring boot-time, UsageResolver memegang cache TTL), A-04 (limiter POST /api/orders 20/mnt + /api/admin/* 120/mnt per identitas tepercaya), A-05 (chat single-count, kunci identitas proxy tepercaya), A-09 (error settings generik), A-11 (timingSafeEqual), A-12 (penolakan NOT_CONFIGURED ber-ledger), A-13 (replay = REQUEST_ALREADY_COMPLETED 409; jawaban tidak dipersist), A-15 (normalisasi email + tanpa merge lintas auth-user), A-16 (escape `<` pada JSON dashboard klasik), A-17 (config payment per-request), D-15 (breadcrumb licenses + footer notif per-surface), D-16 (pagination nyata ledger admin/customer), D-17 (clipboard menunggu resolve + toast gagal), D-20 (baris Organisasi/Domain Terikat fabrikasi dihapus), D-21 (sumbu grafik dari data), ledger inspect = record server nyata (klaim "D-021 Verified/signature" fabrikasi dihapus).
- Sisa terbuka (butuh keputusan, bukan ditebak): A-08 retensi store (kebijakan arsip kuota lifetime), A-14 pin umur sesi Better Auth + audit permukaan `organization()`, D-13/D-14/D-18/D-22 (audit UX lanjutan), D-23/D-24/D-25 (redundansi/kode yatim — kosmetik), test source-string rapuh warisan (widget/signup/readiness/notifications-ui) — kontrak baru di repo ini juga source-string dan dinyatakan eksplisit bukan mounted proof.
- Eksternal (fakta PO, tidak diubah agar checklist hijau): payment `sandbox`, semua plan `ai.enabled:false`, npm belum publish, `crmdemo.grouter.id` 502 (di luar repo), rotasi key Brevo hanya dari dashboard operator.

## P0 frontend (VERIFIED)
- D-01 `/sign-up` registrasi palsu (showcase tanpa handler) — `routes/sign-up.tsx:15`, `components/ui/sign-up.tsx:217`.
- D-02 QR pembayaran fallback statis `/app/images/qris-code.png` untuk semua order — `customer/payments.tsx:291`.
- D-03 "Verifikasi & Settle" admin mengirim ID terpotong `shortId` — `admin/orders.tsx:76,280`.
- D-04 "Cabut lisensi" di detail lisensi hanya menutup dialog — `admin/license-detail.tsx:603`.
- D-05 Submit "Perpanjang" sukses palsu kontradiktif (banner belum-tersedia + pesan hijau berhasil dari flag yang sama) — `admin/license-detail.tsx:102,556`.

## P1
- A-01 store.json korup -> wipe senyap permanen [VERIFIED probe: corrupt-load licenses=0] — `store.js:43-63`.
- A-02 store.json mode 644 berisi token lisensi + kredensial legacy [VERIFIED stat] — file `server/data/store.json`, `licenseService.js:35-51`.
- A-03 SSOT drift: settings admin tidak efektif sampai restart tanpa indikasi [PENDING].
- D-06 Domain/Ref Provider/Metode fabrikasi di drawer order admin [VERIFIED] — `admin/orders.tsx:387-418` (`REF-20261010-9QX2` konstanta).
- D-07 Kolom "domain" berisi planKey [VERIFIED] — `admin/licenses.tsx:96`, `admin/license-detail.tsx:62`.
- D-08 Banner pembayaran customer tampil tanpa order [VERIFIED] — `customer/overview.tsx:208,234`.
- D-11 Badge sidebar hardcode 128/4/1 [VERIFIED] — `components/layout/data/sidebar-data.ts:48,55,133`.
- D-12 Detail lisensi ID invalid tampil "Aktif" hardcoded + aksi aktif [VERIFIED] — `admin/license-detail.tsx:36-68,129`.

## P2 (batch awal VERIFIED / sisanya PENDING)
- D-09 kurva grafik token = path statis hardcode [VERIFIED] — `customer/overview.tsx:386-399`.
- D-15 breadcrumb `/user/licenses` salah label + footer notif header salah tujuan admin [VERIFIED] — `components/layout/moda-header.tsx:72,451`.
- D-19 KPI "Permintaan · 14h" berisi total all-time [VERIFIED] — `customer/overview.tsx:300`.
- A-06 settlePaid non-atomik -> lisensi yatim saat crash di _save [VERIFIED probe] — `paymentService.js:76-105`.
- A-10 `/orders/latest` heuristik waktu, bukan order.licenseId [VERIFIED] — `server.js:949`.
- D-13 missing loading/error state sistemik [PENDING], D-14 label status tanpa cek [PENDING],
  D-16 "Muat lebih banyak" refetch saja [PENDING], D-17 clipboard/skill lokal [PENDING],
  D-18 feedback error destruktif [PENDING], D-20 Organisasi/Domain Terikat salah data [PENDING],
  D-21 sumbu grafik admin fixed 4M [PENDING], D-22 copy EN mentah [PENDING],
  A-04 rate-limit absen [PENDING], A-05 limiter chat [PENDING], A-07 mintLicense exp override [VERIFIED baca: validate.js:46 spread sesudah exp],
  A-08 retensi store [PENDING], A-09 settings 500 bocor [PENDING].

## P3 [PENDING kecuali disebut lain]
- D-23 tabel ganda license-detail + CTA ganda overview, D-24 kartu install redundan,
  D-25 kode yatim template (`features/dashboard/*`, `coming-soon`).
- A-11 timing compare admin, A-12 ledger gateway no-op, A-13 replay idempotensi,
  A-14 sesi Better Auth tak ter-pin, A-15 penautan akun by-email,
  A-16 fallback XSS klasik, A-17 `/api/config` + health drift.

## Regression (VERIFIED worker + transkrip)
- server 201/201 · root 154/154 · frontend 23/23 (total 378/0); hash prod identik sebelum/sesudah.
- Test source-string rapuh ter-flag: `test/widget.test.js`, `test/signup-pointer-events.test.js`,
  `features/admin/notifications-ui.test.ts` (memperkuat butuh harness browser nyata, bukan prioritas).

Register backend lengkap: `docs/evidence/2026-10-18-backend-security-audit.md`.
