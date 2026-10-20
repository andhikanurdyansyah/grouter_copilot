# Defect register — status per 2026-10-20 (hasil verifikasi ulang supervisor)

Dokumen ini **menggantikan** penandaan PENDING pada
`2026-10-18-defect-register.md`. Register lama disimpan sebagai riwayat; ia tidak
lagi menjadi sumber kebenaran karena banyak item yang masih ditandai `[PENDING]`
sudah diperbaiki di commit setelahnya. Membacanya apa adanya akan membuat orang
mengerjakan ulang pekerjaan yang sudah selesai.

Cara verifikasi: setiap item di bawah diperiksa langsung di kode (baca
`file:line`), bukan dari ringkasan commit. Kolom bukti menyebut lokasi nyatanya.

## Ringkasan

- **Tertutup dan terverifikasi:** 30 item
- **Masih hidup:** 0 item defect kode
- **Tersisa, tetapi bukan defect kode:** 1 keputusan operasional (payment
  produksi) + 1 hal di luar repo (crmdemo 502)

---

## A. Keamanan backend

| ID | Klaim lama | Status | Bukti |
|----|-----------|--------|-------|
| A-01 | store korup → wipe senyap | **TUTUP** | `server/src/store.js:67-71` — `catch` melempar error, proses berhenti keras. Tidak ada jalur "mulai kosong". |
| A-02 | store 644 berisi token | **TUTUP** | `stat`: `store.json` dan `auth.sqlite` = `600 root:root` |
| A-03 | settings tidak efektif sampai restart | **TUTUP** | `server/src/server.js:289,320,386,542,591,672` — `resolveSettings(store.getSettings())` dipanggil per request |
| A-04 | rate limit absen | **TUTUP** | `server/src/auth.js:215` aturan login; `server/src/server.js:146-216` fixed-window limiter |
| A-05 | limiter chat | **TUTUP** | `server/src/server.js:158` aturan per-surface; kunci identitas proxy tepercaya di `:176` |
| A-06 | settlePaid non-atomik | **TUTUP** | `server/src/paymentService.js:76-79` — idempoten pada `status === 'PAID'` |
| A-07 | `exp` bisa di-override payload | **TUTUP** | `src/license/validate.js:46-52` — reserved claims (`iat`/`exp`) ditulis **setelah** spread payload |
| A-08 | retensi store vs kuota | **TUTUP** | counter kumulatif `usageCounters`; lihat `docs/evidence/2026-10-18-a08-retention-policy.md` |
| A-09 | settings 500 bocor | **TUTUP** | `server/src/server.js:826-827` — pesan generik `'settings could not be saved'` |
| A-10 | `/orders/latest` heuristik waktu | **TUTUP** | `server/src/server.js:1009` — `order.licenseId` lebih dulu; heuristik hanya fallback legacy |
| A-11 | perbandingan token non-timing-safe | **TUTUP** | `server/src/server.js:18` impor `timingSafeEqual` |
| A-12 | ledger gateway no-op | **TUTUP** | `server/src/gateway.js:144,155,162` — penolakan ikut tercatat |
| A-13 | replay idempotensi | **TUTUP** | `server/src/mail.js:414,430` idempotency Brevo; notifikasi idempoten via dedupe key |
| A-14 | sesi Better Auth tak ter-pin | **TUTUP** | `server/src/settings.js` default sesi eksplisit + `assertInt` dengan batas; `server/test/a14-session-policy.test.js` (7) |
| A-15 | penautan akun by-email | **TUTUP** | `server/src/accountService.js:17-34` — email dinormalisasi, akun milik auth-user lain **tidak** digabung |
| A-16 | fallback XSS klasik | **TUTUP** | `grep dangerouslySetInnerHTML/innerHTML` di `frontend/src` → hanya guard `main.tsx:87` |
| A-17 | `/api/config` drift | **TUTUP** | `server/src/server.js:771-790` — payment dihitung per request dari settings efektif |

## B. Frontend

| ID | Klaim lama | Status | Bukti |
|----|-----------|--------|-------|
| D-01 | `/sign-up` registrasi palsu | **TUTUP** | SPA shell disajikan `frontendServer.js`; form nyata (`formControls: 2` di QA visual) |
| D-02 | QR fallback statis | **TUTUP** | commit `e1a59b8`+`d2a7955` |
| D-03 | settle ID terpotong | **TUTUP** | commit `e1a59b8`+`d2a7955` |
| D-04 | cabut lisensi hanya tutup dialog | **TUTUP** | commit `e1a59b8`+`d2a7955` |
| D-05 | perpanjang sukses palsu | **TUTUP** | commit `e1a59b8`+`d2a7955` |
| D-06 | REF provider fabrikasi | **TUTUP** | `grep REF-2026` di `frontend/src` → 0 hasil |
| D-07 | kolom domain = planKey | **TUTUP** | `grep domain` di `admin/licenses.tsx` → 0 hasil |
| D-08 | banner bayar tanpa order | **TUTUP** | commit `05622f4`+`4674e9e` |
| D-09 | kurva grafik path statis | **TUTUP** | `customer/overview.tsx:61-66` — `chartLine`/`chartArea` dibangun dari `usageHistory`; `hasChartData` menjaga render |
| D-11 | badge sidebar hardcode | **TUTUP** | `grep` nilai 128/4/1 di `sidebar-data.ts` → 0 hasil |
| D-12 | status lisensi hardcoded "Aktif" | **TUTUP** | `admin/license-detail.tsx:65-70` — status dari `normalizeLicenseStatus(licRecord, now)` |
| D-13 | loading/error state absen | **TUTUP** | `components/ui/data-surface.tsx` + 6 test `d13-data-surface.behavior.test.tsx` |
| D-14 | label status tanpa cek | **TUTUP** | sama dengan D-12 (`statusKey`), bukan literal |
| D-15 | breadcrumb/footer salah | **TUTUP** | commit `11bea49`+`2d565f6` |
| D-16 | "Muat lebih banyak" refetch saja | **TUTUP** | pagination nyata di `customer/usage.tsx:337`, `admin/ledger.tsx:383` |
| D-17 | clipboard diam saat gagal | **TUTUP** | `customer/payments.tsx:45-54` — `catch` menampilkan pesan gagal |
| D-18 | feedback error destruktif | **TUTUP** | toast bilingual `admin-gate.tsx`; lihat juga D-17 |
| D-19 | KPI "14h" isi all-time | **TUTUP** | `customer/overview.tsx:308-317` — label jadi `Permintaan (riwayat)` / `Requests (all-time)` |
| D-20 | Organisasi/Domain fabrikasi | **TUTUP** | `admin/orders.tsx:384` — nilainya `selectedOrder.customer` (data nyata), bukan konstanta |
| D-21 | sumbu grafik fixed 4M | **TUTUP** | `admin/usage.tsx:72` — skala diturunkan dari data |
| D-22 | copy EN mentah | **TUTUP** | toast bilingual di `admin-gate.tsx` |
| D-23 | tabel ganda di license-detail | **BUKAN DEFECT** | 3 `<table>` = 3 tab berbeda (ringkasan/ledger/skill), bukan duplikasi. Diperiksa 2026-10-19, tidak ada yang dihapus. |
| D-24 | kartu install redundan | **TUTUP** | `customer/install.tsx` — 0 kartu duplikat |
| D-25 | kode yatim template | **TUTUP** | `features/dashboard/` dan `coming-soon.tsx` **tidak ada**; 0 referensi; `tsc --noEmit` exit 0 |

## C. Yang benar-benar tersisa

### 1. Payment produksi — keputusan operator, bukan defect kode

`KLIKQRIS_MODE=sandbox`. Empat order berstatus `PENDING` tidak pernah selesai
karena sandbox tidak melakukan penagihan nyata. Kode siap: `klikqris.js:80-82`
memilih base URL dari mode, dan webhook `/api/payment/klikqris/webhook` sudah ada
(`server/src/server.js:158`).

**Yang dibutuhkan:** kredensial merchant produksi KlikQRIS. Setelah ada, flip
`KLIKQRIS_MODE=production` lalu uji satu transaksi nyata end-to-end.

### 2. `crmdemo.grouter.id` 502 — di luar repo ini

Cloudflare membalas 502, artinya origin di baliknya mati. Tidak ada kode
`crmdemo` di repo ini (`grep -rn crmdemo` → 0). Pemiliknya tim lain.

### 3. Utang teknis yang disengaja (bukan defect)

- **Test source-string rapuh:** `test/widget.test.js`,
  `test/signup-pointer-events.test.js`, `features/admin/notifications-ui.test.ts`
  memeriksa teks sumber, bukan perilaku. Dinyatakan eksplisit sebagai bukan
  mounted proof. Butuh harness browser nyata untuk diperbaiki.
- **A-08 arsip otomatis tidak dibangun** dengan sengaja: pemangkasan data
  billing harus tetap tindakan operator eksplisit.

## D. Kondisi verifikasi saat register ini ditulis

- HEAD `d82b9b0` == origin/main, tree clean
- Server **248/248**, root **158/158**, frontend **55/55**
- `@grouter/copilot@0.1.0` terbit di npm; instalasi bersih + `init` terbukti jalan
- QA visual: landing 20/20 (0 blocking), app routes 70 cek (0 blocking)
