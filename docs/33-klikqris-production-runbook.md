# Runbook Aktivasi Produksi KlikQRIS — gRouter Copilot

> Tujuan: memandu operator melakukan switch **sandbox → production** payment KlikQRIS
> secara aman, memantau & merekonsiliasi transaksi harian, dan melakukan rollback bila perlu.
>
> Semua klaim perilaku kode di dokumen ini diverifikasi langsung dari source
> (HEAD `fd75163`, 2026-10-12): `server/src/klikqris.js`, `server/src/server.js`,
> `server/src/paymentService.js`, `server/src/settings.js`, `server/src/index.js`,
> `server/src/readiness.js`, `server/src/store.js`, serta test
> `server/test/payment-webhook.test.js` (9 test). Kontrak provider: `docs/26-klikqris-contract.md`,
> setup awal: `docs/28-setup-klikqris-google-oauth.md`, kontrak API: `docs/29-backend-api-contract.md`.
>
> ⚠️ Dokumen ini TIDAK boleh berisi nilai kredensial. Semua secret ditulis sebagai placeholder.

---

## 0. Peta alur pembayaran (fakta terverifikasi dari kode)

| Tahap | Perilaku | Sumber kode |
|---|---|---|
| Checkout | `POST /api/orders {packageKey}` — harga & entitlement **di-resolve server-side** dari katalog plan; body dengan `amount`/`description` ditolak 400. Order dibuat `PENDING` (format id `ord_<ts36>_<rand>`, amount = `Math.round(plan.amount)`) lalu `POST {base}/qris/create` | `server.js` r.741–774; `paymentService.js` r.36–67 |
| Base URL per mode | sandbox `https://klikqris.com/api/sandbox` · production `https://klikqris.com/api`. Override `payment.klikqrisBaseUrl` dihormati, tapi host tanpa path `/api` tetap ditambah path mode (mode tidak bisa "bocor" ke endpoint lain) | `klikqris.js` r.71–81 |
| Webhook | KlikQRIS → `POST /api/payment/klikqris/webhook` `{order_id, status}` (body juga boleh nested `data.order_id`/`data.status`). Rate limit 60 req/menit/IP | `server.js` r.79, 781–822 |
| Verifikasi | Body webhook **TIDAK dipercaya**. Klaim lunas (`SUCCESS`/`PAID`/`SETTLEMENT` — status lunas aktual dari KlikQRIS saat ini `SUCCESS`) di-re-verify ke `GET {base}/qris/status/{order_id}`; wajib cocok `order_id` upstream DAN `amount` upstream == amount order lokal (kesetaraan numerik). Klaim non-paid diabaikan **tanpa** menyentuh upstream. Order lokal tidak dikenal → 404 sebelum kontak upstream. Gagal verifikasi upstream → 502 | `server.js` r.777–822; `klikqris.js` r.32; `server.js` r.51–57 |
| Settle | `settlePaid` idempotent (order sudah `PAID` → return tanpa license kedua): status → `PAID`, entitlement (features/expiresInDays/quota) diambil dari katalog plan **saat settle**, license terikat `accountId` | `paymentService.js` r.76–101 |
| Settle manual admin | `POST /api/admin/orders/:id/settle` — jalur verifikasi upstream yang sama; Bearer `ADMIN_TOKEN` wajib (fail-closed) | `server.js` r.714–733, 866–875 |
| Boot gates (produksi) | Refuse to boot tanpa `ADMIN_TOKEN` dan tanpa license keypair ter-persist; readiness report `[klikqris-production]` bersifat advisory (non-blocking) | `server.js` r.117–131; `readiness.js` r.46–56; `index.js` r.28–31 |

**Kontrol utama anti-pemalsuan = upstream re-verify** (bukan signature webhook — lihat §6).

---

## 1. Prasyarat aktivasi

Checklist — semua harus ✅ sebelum lanjut ke §2:

- [ ] **Kredensial produksi KlikQRIS** diterima: API key produksi + id merchant produksi
      (berbeda dari sandbox). Disimpan di `server/.env`: `KLIKQRIS_API_KEY`, `KLIKQRIS_MERCHANT_ID`.
      Jangan pernah commit, paste di chat, atau catat di dokumen.
- [ ] **Verifikasi rekening/merchant**: nama toko & rekening penampung settlement di
      dashboard KlikQRIS sudah benar (cek field `nama_toko` pada response create saat smoke test,
      dan mutasi settlement di dashboard merchant).
- [ ] **`KLIKQRIS_MODE=production`** akan di-set di `server/.env` (loader membaca `.env` dari
      working directory proses backend — `loadEnv.js` default `process.cwd()/.env`).
- [ ] **Callback URL publik terdaftar di dashboard KlikQRIS**:
      `https://copilot.grouter.id/api/payment/klikqris/webhook`
      (single public origin; frontend :4601 mem-proxy `/api/*` → backend :4600 yang tidak publik —
      `docs/27`/`docs/28`).
- [ ] **Redirect URL** post-payment di dashboard KlikQRIS: `https://copilot.grouter.id/success`.
- [ ] **Boot gates hijau**: `ADMIN_TOKEN` terisi dan license keypair ter-persist
      (`server/data/keys/license-{private,public}.pem` atau env PEM) — produksi menolak boot tanpa ini.
- [ ] **Tunnel sehat**: `curl -s https://copilot.grouter.id/api/health` → 200,
      `checks.paymentConfigured: true`.
- [ ] **Mode efektif terkonfirmasi production**: `curl -s https://copilot.grouter.id/api/config`
      → `"payment":{"enabled":true,"mode":"production"}`.
      ⚠️ PENTING: mode efektif = default ← env seeds ← **store.json** (`payment.mode` yang tersimpan
      via admin settings MENIMPA `KLIKQRIS_MODE` di `.env`). Cek juga
      `grep -n '"mode"' server/data/store.json` — jika ada `payment.mode` tersimpan, sinkronkan
      nilainya sebelum restart. `/api/config` (membaca settings efektif) adalah sumber kebenaran;
      log readiness saat boot hanya membaca `process.env` (bisa beda jika store menimpa).
- [ ] **Nominal smoke test** disepakati (paket termurah yang aktif, bayar nyata — lihat §5 S1).
- [ ] **Akses dashboard merchant KlikQRIS** untuk melihat status & mutasi transaksi produksi.
- [ ] **Jendela waktu + personil**: aktivasi dilakukan saat traffic sepi; §4 (rollback) dipersiapkan;
      daftar order `PENDING` yang sedang berjalan dicatat sebelum switch (lihat §4 dampak).

---

## 2. Langkah switch aman

Jalankan berurutan; jangan melewati verifikasi tiap langkah.

**2.1 Pengumuman / maintenance window** — trafik sepi, customer diinformasikan bila checkout
sempat tidak tersedia.

**2.2 Backup data (SEBELUM menyentuh `.env`):**

```bash
cd /path/ke/grouter_copilot/server
cp data/store.json "data/store.json.bak-$(date +%Y%m%d-%H%M%S)"
cp data/auth.sqlite "data/auth.sqlite.bak-$(date +%Y%m%d-%H%M%S)"   # opsional tapi disarankan
```

Catatan: lokasi store default `server/data/store.json`; bisa dipindahkan lewat env `DATA_FILE`
(cek `pm2 env copilot-backend | grep DATA_FILE`). `store.json` berisi accounts, licenses,
orders, usage, dan **settings** (termasuk `payment.mode`/kredensial yang bisa menimpa env —
alasan backup wajib sebelum switch).

**2.3 Pre-flight mode tersimpan:**

```bash
grep -n '"mode"' data/store.json
```

- Tidak ada `payment.mode` → `.env` yang menentukan. Lanjut.
- Ada `payment.mode` → nilai inilah yang menang atas env. Ubah/pastikan isinya `production`
  (via admin settings atau hapus agar env yang berlaku), konsisten dengan langkah 2.4.

**2.4 Edit `server/.env`** (nilai produksi, jangan dicatat di tempat lain):

```dotenv
KLIKQRIS_MODE=production
KLIKQRIS_API_KEY=<API-KEY-PRODUKSI-DARI-DASHBOARD>
KLIKQRIS_MERCHANT_ID=<ID-MERCHANT-PRODUKSI>
```

**2.5 Restart backend (non-destruktif):**

```bash
pm2 restart copilot-backend --update-env
```

Frontend (`copilot-frontend`) tidak perlu di-restart.

**2.6 Health check + konfirmasi mode efektif:**

```bash
curl -s https://copilot.grouter.id/api/health
#   harapkan: {"status":"ok",...,"checks":{"paymentConfigured":true,...}}
curl -s https://copilot.grouter.id/api/config
#   harapkan: "payment":{"enabled":true,"mode":"production"}
pm2 logs copilot-backend --lines 40 --nostream
#   harapkan readiness report: ✔ [klikqris-production] ...
```

Jika `/api/config` masih `sandbox` padahal `.env` sudah production → store.json menimpa
(kembali ke 2.3), lalu restart lagi. Error `AUTH_FAILED` di log (pesan pola
"Invalid API Key / Account Inactive") = kredensial/mode tidak cocok — cek base URL mode
dan key produksi (pola terdeteksi di `klikqris.js` r.110).

**2.7 Smoke test order PRODUCTION (bayar nyata, nominal terkecil):**

1. Login di `https://copilot.grouter.id` dengan akun test, checkout paket termurah.
2. Verifikasi halaman QR muncul dan **nominal QR == harga plan** (`GET /api/plans` untuk
   membandingkan; harga selalu resolve server-side).
3. Bayar via aplikasi bank/e-wallet nyata.
4. Tunggu webhook (biasanya < 1 menit). Verifikasi:
   - `GET /api/orders/latest` (session akun test) → order `status: "PAID"`, `paidAt` terisi.
   - Halaman `/success` menampilkan lisensi yang terbit.
   - Log backend: webhook → `200 {"ok":true,"licenseId":...}` (bukan `ignored:unverified:*`).
   - Dashboard merchant KlikQRIS: transaksi masuk pada rekening yang benar.
5. Catat `order_id` smoke test + jam + operator di log operasional.

**2.8 Selesai** — tandai aktivasi (tanggal, jam, operator, order_id smoke test, hasil
health check) di log operasional. Jadwalkan monitoring §3 mulai hari ini.

---

## 3. Monitoring & reconciliation harian

Semua perintah admin butuh `Authorization: Bearer $ADMIN_TOKEN` (401 tanpa token).

**3.1 Sweep order PENDING vs upstream** (deteksi webhook hilang):

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://copilot.grouter.id/api/admin/orders?status=PENDING&limit=200"
```

Untuk setiap PENDING yang melewati batas wajar (mis. > 1 jam sejak `createdAt` dan belum
`expiredAt`), gunakan endpoint settle admin sebagai **probe verifikasi** — jalurnya sama
persis dengan verifikasi webhook (re-verify upstream + cocok order_id + amount):

```bash
curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://copilot.grouter.id/api/admin/orders/<ORDER_ID>/settle"
```

Interpretasi (perilaku terverifikasi dari kode):
- `200 {"ok":true,"licenseId":...}` → upstream terverifikasi lunas; webhook sempat hilang —
  order terselamatkan, lisensi terbit. ✅
- `409 {"error":"payment is not verified for this order"}` → upstream belum lunas / amount
  tidak cocok / order upstream beda — **aman, tidak ada perubahan**. Biarkan (customer belum
  bayar) atau tunggu `expiredAt`.
- `502 {"error":"unable to verify payment status"}` → KlikQRIS tidak dapat dihubungi;
  ulangi nanti.
- Upstream `EXPIRED`/`FAILED`/`CANCELLED` (cek dashboard merchant bila perlu): order boleh
  dibiarkan; customer bisa membatalkan sendiri order PENDING miliknya
  (`POST /api/orders/:id/cancel`, hanya owner, hanya PENDING).

**3.2 Lisensi terbit vs order PAID:**

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://copilot.grouter.id/api/admin/orders?status=PAID&limit=200"
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://copilot.grouter.id/api/admin/licenses"
```

Aturan: setiap order `PAID` harus memiliki lisensi terbit untuk `accountId` yang sama.
`settlePaid` idempotent — duplikat callback **tidak** menerbitkan lisensi kedua
(test: `duplicate verified paid webhook is idempotent`). Jika ada PAID tanpa lisensi →
jalankan probe settle (3.1).

**3.3 Sinyal log backend yang perlu ditindaklanjuti** (`pm2 logs copilot-backend`):

- `200 {"ok":true,"ignored":"unverified:amount_mismatch"|"unverified:order_id_mismatch"}` →
  ada klaim lunas yang GAGAL verifikasi upstream — investigasi `order_id` terkait
  (indikasi forged atau anomali upstream). Tidak ada lisensi terbit (by design).
- `502 unable to verify payment status` → upstream tak terjangkau saat webhook datang;
  order bisa tertinggal "sudah dibayar tapi PENDING" — tertangkap oleh sweep 3.1.
- `429` pada webhook → rate limit 60 req/menit/IP terlewati (lonjakan retry KlikQRIS);
  hubungi KlikQRIS bila berulang.
- `AUTH_FAILED` / "Invalid API Key or Account Inactive" → kredensial/mode salah;
  pertimbangkan rollback §4.

**3.4 Rekonsiliasi keuangan harian:** cocokkan **total settlement** di dashboard merchant
KlikQRIS vs jumlah `amount` order `PAID` hari itu (3.2). Selisih = order tertunda settle
(3.1) atau transaksi di luar sistem — wajib dijelaskan.

**Frekuensi:** sweep PENDING + rekon lisensi harian (pagi), rekon settlement harian (sore);
wajib ekstra ketat selama 3 hari pertama pasca-aktivasi dan setiap rollback.

---

## 4. Rollback (kembali ke sandbox)

**Kapan:** kredensial produksi bermasalah (`AUTH_FAILED` persisten), error upstream massal,
atau KlikQRIS production tidak dapat dihubungi dalam durasi lama.

**Langkah:**

1. `server/.env` → `KLIKQRIS_MODE=sandbox` (dan kredensial sandbox bila diperlukan).
2. `pm2 restart copilot-backend --update-env`.
3. Verifikasi: `curl -s https://copilot.grouter.id/api/config` → `"mode":"sandbox"`;
   `/api/health` → ok; `pm2 logs copilot-backend --lines 30 --nostream`.

**Dampak terhadap order berjalan (perilaku terverifikasi):**

- **Order PENDING yang dibuat saat mode production**: setelah rollback, verifikasi upstream
  pergi ke base **sandbox** (`/api/sandbox/qris/status/<id>`), sedangkan order produksi hanya
  ada di upstream produksi → status check gagal/tidak cocok → webhook order tersebut menjadi
  `502` dan **tidak akan settle otomatis**. QR produksi yang sudah dibagikan tetap bisa dibayar
  di sisi KlikQRIS produksi, tetapi sistem tidak memverifikasinya.
  → **Sebelum rollback**: jalankan sweep 3.1 dan tangani semua PENDING produksi
  (settle yang sudah terbayar, biarkan yang belum). Bila rollback harus segera: catat daftar
  order PENDING + pembayaran yang terkonfirmasi di dashboard merchant; setelah masalah selesai
  dan mode kembali production, selamatkan lewat probe settle (3.1). Pembayaran nyata wajib
  dihormati (settle manual / refund sesuai kebijakan) — jangan hilang.
- **Order PAID + lisensi yang sudah terbit**: tidak terpengaruh — validitas lisensi tidak
  bergantung mode payment; tidak ada re-issue/perubahan saat rollback.
- **Checkout baru selama sandbox**: QR sandbox (uang tidak nyata) — jangan dibagikan ke
  customer nyata; aktifkan banner "pembayaran dalam maintenance" bila diperlukan.
- **Store/lisensi lain** (admin, usage, heartbeat): tidak terpengaruh oleh mode.

---

## 5. Test matrix transaksi live

Jalankan versi sandbox matrix ini dulu (sebelum switch), lalu ulangi baris bertanda
**[PROD]** setelah switch. Semua hasil diverifikasi terhadap perilaku kode + test otomatis.

| Kode | Skenario | Cara eksekusi | Hasil yang diharapkan | Status |
|---|---|---|---|---|
| S0 | Order dibuat, belum dibayar | Checkout via UI | 201; order `PENDING`; nominal QR == harga plan; `GET /api/orders/:id` (owner) → PENDING | wajib |
| S1 **[PROD]** | Pembayaran sukses | Bayar nyata nominal terkecil (§2.7) | Webhook → re-verify upstream `SUCCESS` → `200 {"ok":true,"licenseId":...}`; order `PAID` + `paidAt`; lisensi terbit terikat akun; halaman `/success` menampilkan lisensi | wajib |
| S2 | Expired | Buat order, biarkan lewat masa berlaku **tanpa** bayar (`expired_menit` 60 pada contoh sandbox; konfirmasi nilai produksi di response create) | Webhook klaim `EXPIRED` = non-paid → diabaikan **tanpa** verifikasi upstream: `200 {"ok":true,"ignored":"EXPIRED"}`; order lokal tetap `PENDING` sampai customer cancel atau di-sweep 3.1 | wajib |
| S3 | Pembayaran gagal/FAILED | Sulit disimulasikan lewat UI QRIS nyata (tergantung penerbit); minimal verifikasi via klaim webhook `FAILED` + test otomatis | Klaim `FAILED` = non-paid → `200 {"ok":true,"ignored":"FAILED"}`; tidak ada settle, tidak ada upstream call | wajib (probe) |
| S4 **[PROD]** | Duplikat callback | Kirim ulang payload webhook sama untuk order yang sudah PAID (tunggu retry KlikQRIS, atau replikasi manual): `curl -s -X POST https://copilot.grouter.id/api/payment/klikqris/webhook -H 'content-type: application/json' -d '{"order_id":"<ORDER_ID>","status":"SUCCESS"}'` | Re-verify upstream lolos lagi → `200 {"ok":true,"licenseId":"<ID-YANG-SAMA>"}`; **tidak ada lisensi kedua** (idempotent — test `duplicate verified paid webhook is idempotent`) | wajib |
| S5 | Klaim palsu / mismatch (bukan transaksi live) | Cakupan test otomatis `server/test/payment-webhook.test.js` (9 test): amount mismatch, order upstream mismatch, order lokal tidak dikenal (404 sebelum kontak upstream), klaim non-paid tanpa upstream call, admin settle guard pending/mismatch | Semua ditolak/abaikan tanpa menerbitkan lisensi | wajib (CI) |

Catatan eksekusi S1/S4: butuh sesi customer (order) dan `ADMIN_TOKEN` (sweep/settle);
catat setiap `order_id` uji beserta hasilnya di log operasional.

---

## 6. Signature verification — ⚠️ BUTUH KONFIRMASI ALGORITMA DARI KLIKQRIS

**Status saat ini (terverifikasi dari kode):** server **TIDAK memverifikasi** field
`signature` — baik pada response `qris/create` maupun pada body webhook. Field `signature`
adalah *transaction signature* dari KlikQRIS (bukan header HMAC webhook) dan disimpan apa
adanya di record order (`klikqris.js` r.19–20; `paymentService.js` r.60). Nilai contoh di
sandbox: `SANDBOX_SIG_...`. **Algoritma penandatanganan TIDAK terdokumentasi** di
`docs/26-klikqris-contract.md`, dan test `webhook follows documented status contract when
status signature is absent` menegaskan alur tetap benar tanpa signature.

**Mengapa tetap aman tanpa signature verification (by design):** keputusan settle tidak
pernah bergantung pada isi webhook. Kontrol utama = **re-verify upstream**
`GET {base}/qris/status/{order_id}` + pencocokan `order_id` upstream + pencocokan `amount`
numerik, sebelum `settlePaid` — semua tercakup 9 test `payment-webhook.test.js` +
4 test `klikqris.test.js`. Webhook palsu tanpa order nyata yang terverifikasi upstream hanya
mendapat `200 ignored:unverified:*`. Layer tambahan yang sudah ada: rate limit webhook
60 req/menit/IP, `order_id` acak sulit ditebak, 404 sebelum kontak upstream untuk order tak
dikenal.

**Tindakan terbuka (defense-in-depth):**

1. [ ] Minta **dokumentasi resmi algoritma signature** ke KlikQRIS: field apa saja yang
       di-hash, secret yang dipakai (per merchant?), format (HMAC-SHA256?), penempatan
       (field body vs header), dan contoh nilai terverifikasi.
2. [ ] Setelah algoritma **terkonfirmasi tertulis**: implementasikan verifikasi signature
       sebagai lapisan tambahan (bukan pengganti re-verify upstream), tambahkan test
       positif/negatif, dan dokumentasikan di `docs/26-klikqris-contract.md`.
3. [ ] **Sampai saat itu: jangan mengaktifkan verifikasi signature berdasar asumsi/menebak
       algoritma.** Re-verify upstream tetap satu-satunya dasar keputusan settle.

---

## Lampiran A — Dasar verifikasi runbook

- Kode: `server/src/klikqris.js` (base URL per mode r.71–81, `PAID_STATES` r.32, AUTH_FAILED r.110),
  `server/src/server.js` (webhook r.777–822, settle admin r.714–733, orders r.741–775, health/config
  r.540–574, admin orders r.325–341, cancel r.662–680, `amountMatchesOrder` r.51–57, store default
  r.109), `server/src/paymentService.js` (createOrder r.36–67, settlePaid idempotent r.76–101),
  `server/src/settings.js` (mode default `sandbox` r.58, env seeds r.154–156, precedence
  default ← env ← stored r.165–172, validasi mode r.322), `server/src/index.js` (loadEnv, DATA_FILE,
  readiness log), `server/src/readiness.js` (gate `klikqris-production` advisory), `server/src/store.js`
  (orders CRUD), `server/src/loadEnv.js` (`.env` dari cwd).
- Test: `server/test/payment-webhook.test.js` — 9 test (amount mismatch, order mismatch, unknown
  order, duplikat idempotent, non-paid ignore tanpa upstream call, 3 guard admin settle,
  kontrak tanpa signature, `klikqris.test.js` 4, `cost-integrity.test.js` 4, `production-gates.test.js` 9).
- Dokumen: `docs/26-klikqris-contract.md`, `docs/27-deployment-architecture.md` (pm2
  `copilot-backend` PORT=4600, `copilot-frontend` PORT=4601, restart `--update-env`, Cloudflare
  Tunnel `copilot.grouter.id` → :4601), `docs/28-setup-klikqris-google-oauth.md` (callback URL,
  redirect `/success`, checklist pre-production), `docs/29-backend-api-contract.md`.

## Lampiran B — Perintah cepat

```bash
# Health & mode
curl -s https://copilot.grouter.id/api/health
curl -s https://copilot.grouter.id/api/config

# Sweep harian
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "https://copilot.grouter.id/api/admin/orders?status=PENDING&limit=200"
curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" "https://copilot.grouter.id/api/admin/orders/<ORDER_ID>/settle"
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "https://copilot.grouter.id/api/admin/orders?status=PAID&limit=200"
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "https://copilot.grouter.id/api/admin/licenses"

# Switch / rollback
pm2 restart copilot-backend --update-env
pm2 logs copilot-backend --lines 40 --nostream

# Backup
cp server/data/store.json "server/data/store.json.bak-$(date +%Y%m%d-%H%M%S)"
```
