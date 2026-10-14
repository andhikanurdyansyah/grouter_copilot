# TESTING-GUIDE — gRouter Copilot End-to-End

Panduan untuk mengetes seluruh produk **tanpa membaca source code**.
Produksi: **https://copilot.grouter.id** · Frontend internal `:4601` · Backend `:4600` (internal).

---

## 1. URL & Entry Point

| Permukaan | URL | Catatan |
|---|---|---|
| Landing (protected, jangan diubah) | https://copilot.grouter.id/ | intro |
| Landing produk | https://copilot.grouter.id/landing | |
| **Customer register/login** | https://copilot.grouter.id/login | dua form: Daftar / Masuk + Google |
| **Customer dashboard** | https://copilot.grouter.id/user | butuh login |
| **Admin gate** | https://copilot.grouter.id/admin | minta Admin Token (lihat §5) |

Halaman customer: `/user` (ringkasan) · `/user/licenses` (lisensi & install) · `/user/install` (panduan 3 langkah) · `/user/usage` (pemakaian AI) · `/user/orders` (paket & checkout) · `/user/payments` (riwayat order) · `/user/account` (identitas & keluar).

Halaman admin: `/admin` (operasional) · `/admin/licenses` · `/admin/licenses/<id>` (detail) · `/admin/packages` (harga & kebijakan AI) · `/admin/orders` (rekonsiliasi) · `/admin/ledger` (AI usage ledger) · `/admin/usage` (usage provider) · `/admin/settings` (infrastruktur & health, read-only).

---

## 2. Prasyarat & Menjalankan Test Otomatis

Semua perintah dijalankan di host (`/home/ubuntu/grouter_copilot`):

```bash
# 1) Semua test backend + plugin (server 118 + root 105 = 223 test; terukur 2026-10-13, HEAD `3d2bda8`)
cd server && npm test && cd .. && npm test

# 2) Typecheck + build frontend
cd frontend && npx tsc -b --noEmit && npm run build

# 3) Browser E2E (desktop + mobile, 22 test) — SATU PERINTAH, TERISOLASI:
npm run e2e

# 4) (Opsional) Smoke produksi READ-ONLY — tanpa mutasi:
npm run smoke:live
```

`npm run e2e` menyalakan **instance terisolasi** (auth DB sintetis + store tmp + mock
upstream; port **4690/4691**), menjalankan Playwright, lalu membersihkan proses + data tmp.
**Produksi (localhost:4600/4601) TIDAK disentuh** dan nol akun/order QA dibuat di prod.

Isolasi kini **fail-closed berlapis** (2026-10-14):
- **Port preflight** — kedua port dicek kosong sebelum spawn; konflik = gagal keras
  (proses asing TIDAK dibunuh, TIDAK ada fallback ke 4600/4601).
- **Identitas instance** — nonce acak per-run (`E2E_INSTANCE_ID`) di-echo backend
  (`/api/health`) & frontend (`/__e2e/id`, 404 di prod); runner menolak bila respons
  berasal dari proses/instance lain (termasuk backend yang salah).
- **Config fail-closed** — `playwright.config.mjs` menolak load tanpa `E2E_ISOLATED=1`
  + base URL loopback; `e2e/helpers.mjs` juga menolak.
- Cleanup child + temp dir pada startup failure, test failure, exception, SIGINT/SIGTERM.

Untuk cek produksi tanpa mutasi, pakai `npm run smoke:live` (health + katalog + admin 401).

Hasil yang diharapkan: `22 passed` (11 spec × 2 project desktop+mobile). Artefak kegagalan
ada di `test-results/`.

---

## 3. Customer Journey (manual)

1. **Daftar**: buka `/login` → form "Buat akun" → nama + email + password (min 8 karakter; password yang pernah bocor akan DITOLAK oleh guard — itu fitur). Sukses → langsung masuk `/user`.
2. **Dashboard kosong yang jujur**: akun baru menampilkan state "belum ada lisensi" — bukan data palsu.
3. **Checkout**: `/user/orders` → pilih paket berharga (3B Rp10.000 / 15B Rp20.000) → **Beli via QRIS** → dialog QR muncul dengan **polling status otomatis tiap 4 detik**. Order dibuat **PENDING** di server (mode pembayaran = KlikQRIS **sandbox**, tanpa uang nyata).
4. **Bayar via simulator sandbox** (opsional, terverifikasi): buka URL QR di dialog → di halaman klikqris.com sandbox ada tombol simulasi pembayaran; ATAU jalankan runner terverifikasi:
   ```bash
   cd server && node scripts/klikqris-sandbox-journey.mjs --artifact /tmp/journey.json
   ```
   Runner membuat order sandbox sendiri, mensimulasikan pembayaran, lalu memanggil webhook lokal dan memverifikasi lisensi terbit + idempotent.
5. **Konfirmasi pembayaran**: setelah upstream melapor SUCCESS, webhook server memverifikasi ulang (order_id + amount) → lisensi terbit. Jika dialog checkout masih terbuka, status berubah **"Pembayaran terverifikasi — lisensi diterbitkan"** + toast; badge order menjadi "dibayar".
6. **Install**: `/success` atau `/user/licenses` → salin **License ID** → `/user/install` ikuti 3 langkah. Perintah installer lengkap (`npx @grouter/copilot install --license <TOKEN>`) hanya tampil di halaman `/success` setelah pembayaran (token = sekali-lihat, tidak disimpan di list).
7. **Usage**: `/user/usage` menampilkan kuota lifetime per lisensi (dihitung server, bukan browser).
8. **Keluar**: `/user/account` → "Keluar dari akun" → konfirmasi → sesi server benar-benar mati (coba buka `/user` lagi → redirect login).

### State negatif yang bisa dites
- **Order pending**: biarkan dialog terbuka tanpa bayar → status tetap "menunggu", tidak pernah mengklaim sukses.
- **Kuota habis / AI off**: saat ini kebijakan AI semua paket = **disabled** (`ai.enabled: false`) — `/user/usage` menampilkan banner "AI off" dan chat akan ditolak gateway (`AI_DISABLED`). Ini by-design produksi.
- **Expired/revoked**: minta admin mencabut lisensi QA Anda (§5 langkah 7) → badge lisensi merah "dicabut", install gagal dengan pesan jelas.

---

## 4. Pembayaran Sandbox — yang terverifikasi vs yang butuh konfigurasi

**Terverifikasi otomatis (sandbox asli klikqris.com):**
- Order dibuat dengan harga resolve server-side (client tidak bisa menyuntik `amount` — ditolak 400).
- Webhook dengan klaim palsu `PAID` **diabaikan** selama upstream masih PENDING.
- Setelah upstream SUCCESS + amount match → settle idempotent (replay tidak membuat lisensi kedua).
- Runner `server/scripts/klikqris-sandbox-journey.mjs` menjalankan seluruh rantai ini terhadap sandbox KlikQRIS nyata.

**Butuh konfigurasi eksternal (blocker nyata):**
- **Mode produksi payment** (uang nyata): butuh `KLIKQRIS_MODE=production` + kredensial produksi — keputusan bisnis, sengaja tidak diubah.
- **Aktivasi AI**: butuh `ai.enabled: true` per paket + `GROUTER_API_KEY` supplier valid (sudah terpasang). Mengaktifkan AI = keputusan PO lewat `/admin/packages` (checkbox kebijakan AI).

---

## 5. Admin Testing (tanpa membocorkan kredensial)

Admin Token **tidak ditulis di dokumen ini**. Cara mengambilnya secara aman di host:

```bash
grep '^ADMIN_TOKEN=' server/.env   # jalankan di host; jangan paste nilainya ke mana pun
```

Lalu di browser: buka `/admin` → tempel token → masuk. Token disimpan **hanya di sessionStorage** browser itu, dikirim sebagai Bearer per-request, hilang saat tab ditutup.

Workflow yang bisa dites:
1. **Gate**: buka `/admin` tanpa token → form; coba API admin tanpa Bearer → 401.
2. **Overview**: `/admin` menampilkan statistik nyata (lisensi aktif/revoked, orders).
3. **Terbitkan lisensi**: `/admin/licenses` → "Terbitkan Lisensi" → isi nama `QA-<tanggal>` + pilih paket → setelah terbit, dialog menampilkan **License Token SEKALI-LIHAT** dengan tombol salin + peringatan. Tutup dialog → token tidak bisa dilihat lagi (by design; API list tidak pernah mengirimnya).
4. **Detail lisensi**: klik ID lisensi → identitas, entitlement + progress kuota, ledger per lisensi.
5. **Paket & kebijakan AI**: `/admin/packages` → ubah harga/kuota → Simpan (validasi server menolak nilai tidak valid). **Jangan ubah harga produksi saat ini** — jika mengetes simpan, kembalikan nilai sebelumnya.
6. **Rekonsiliasi order**: `/admin/orders` → "Verifikasi & settle" pada order PENDING → server cek ulang ke KlikQRIS; jika belum dibayar → 409 dengan pesan jelas (bukan sukses palsu).
7. **Revoke**: di baris lisensi QA → menu ⋯ → Cabut → konfirmasi (destructive) → lisensi langsung mati.
8. **Ledger & usage**: `/admin/ledger` (filter customer/status/model/license + pagination) vs `/admin/usage` (dimensi infrastruktur) — dua dimensi yang sengaja tidak dijumlahkan.
9. **Settings**: `/admin/settings` read-only — kredensial tampil ter-mask (mis. `••••jQd5`), perubahan hanya via env + restart.

---

## 6. Reset / Cleanup Data QA (aman)

Akun & lisensi QA bertanda jelas (`qa.e2e.*@gmail.com`, `QA-E2E …`, `QA <label> …`).
**Alat kanonik:** `server/scripts/purge-test-accounts.mjs` — **dry-run default** (tidak menghapus
apa pun tanpa `--apply`), hanya mencocokkan pola test eksplisit (`TEST_PATTERNS`: `qa*`/`ntf*`/
`lictok*`/`qaclean*`), menolak menghapus akun yang masih punya order/lisensi, dan otomatis
membuat backup `auth.sqlite` + `store.json` ke `/home/ubuntu/backups/` sebelum menghapus.

```bash
# Lihat dulu siapa yang akan dihapus (TIDAK menghapus apa pun):
node server/scripts/purge-test-accounts.mjs

# Hapus (backup otomatis dibuat lebih dulu):
node server/scripts/purge-test-accounts.mjs --apply

# Opsional: hanya akun lebih tua dari N hari:
node server/scripts/purge-test-accounts.mjs --apply --older-than 7
```

Skrip ini menggantikan snippet manual lama (`email LIKE 'qa.%'` + edit `store.json` langsung),
yang rentan menghapus data nyata dan tidak mengambil backup. Setelah `--apply`:

```bash
pm2 restart copilot-backend --update-env
```

**Cadangkan dulu** jika ragu: `bash scripts/backup-data.sh`. Perhatikan: konvensi baru
(2026-10-13) mewajibkan test E2E ber-session memakai instance terisolasi
(`DATA_FILE`/`AUTH_DB_FILE` → tmp), bukan `server/data/` produksi — lihat
`docs/25-pending-implementations.md` & `docs/handoff-2026-10-13.md`.

---

## 7. Hasil Test Aktual (2026-10-14, post E2E identity hardening)

| Gate | Hasil |
|---|---|
| Server tests (`cd server && npm test`) | **118/118 pass** (NODE_ENV=test; HEAD `d516791` + hardening) |
| Root tests (`npm test`) | **117/117 pass** (+12: E2E isolation-guard/hardening/mock-upstream) |
| Isolated E2E (`npm run e2e`) | **22/22 pass** — instance terisolasi (port 4690/4691, mock upstream, identitas nonce per-run) |
| Frontend typecheck (`tsc -b --noEmit`) | bersih, exit 0 |
| Frontend lint (`npx eslint .`) | **0 errors** (10 warnings non-blocking) |
| Frontend build (`npm run build`) | sukses, exit 0 |
| Clean-room installer (ESM + CJS) | **PASS** (`bash scripts/cleanroom-verify.sh`) |
| Restore drill | **PASS** (data sintetis; produksi tidak disentuh) |
| Backend dep audit | 0 vulnerabilities (`npm audit --omit=dev`) |
| Frontend dep audit | No known vulnerabilities (`pnpm audit --prod`) |
| SPA probe (`node scripts/qa-spa-probe.mjs --all`) | 19 rute — 0 error, 0 CSP, 0 unlabeled |
| Live read-only smoke (`npm run smoke:live`) | PASS (health BE/FE/publik 200; admin 401 tanpa token) |
| Secret scan | bersih |

> Angka di atas = baseline terukur 2026-10-14. CI workflow kini ADA:
> `.github/workflows/ci.yml` menjalankan root+server suite, tsc, eslint, isolated
> E2E (Playwright), dan clean-room matrix — **tanpa secret, tanpa DB produksi,
> tanpa request mutating**. Status hijau workflow harus dikonfirmasi oleh GitHub
> (tidak dapat dieksekusi dari host ini).

Yang dicakup E2E: register→dashboard, checkout sandbox→PENDING terverifikasi server (tanpa klaim palsu), polling berhenti saat dialog ditutup, empty states jujur (licenses/install/usage), session guard 401, logout mematikan sesi server, mobile 390px (drawer + tanpa overflow), admin gate 401, semua halaman admin render, issue lisensi + token sekali-lihat + tidak bocor di list + revoke, orders/ledger/usage/settings tanpa bocor kredensial (apiKey ter-mask), isolasi antar-akun (order A → 404 untuk B), cost integrity (body amount ditolak 400), customer tidak bisa buka admin.

## 8. Batasan & Blocker

1. **Transisi PENDING→PAID via UI tidak diotomasi** — butuh interaksi simulator klikqris.com (login/session upstream). Sudah tercakup oleh: runner CLI `klikqris-sandbox-journey.mjs` (sandbox asli) + test backend `customer-register-to-chat.e2e.test.js` (webhook forged/replay). Blocker: kredensial sesi simulator tidak tersedia untuk otomasi.
2. **AI chat end-to-end via dashboard nonaktif** — semua paket `ai.enabled:false` (keputusan produksi saat ini). Gateway sudah terbukti di test backend (quota exhausted, AI disabled, model not allowed — semua fail-closed). Aktifkan via `/admin/packages` bila PO memutuskan.
3. **Google OAuth** butuh callback origin produksi — dites manual via tombol "Lanjut dengan Google" di `/login` (provider aktif: `/api/config` → `providers.google: true`).
