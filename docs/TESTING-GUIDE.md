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
# 1) Semua test backend + plugin (241 test)
cd server && npm test && cd .. && npm test

# 2) Typecheck + build frontend
cd frontend && npx tsc -b --noEmit && npm run build

# 3) Browser E2E (desktop + mobile, 22 test) — SATU PERINTAH:
npm run e2e
```

`npm run e2e` otomatis: membaca Admin Token dari `server/.env` (tidak pernah dicetak), memeriksa pm2 services hidup, lalu menjalankan Playwright di atas **`http://localhost:4601`** (instance produksi lokal). Setiap run membuat akun QA baru (`qa.e2e.*@gmail.com`) — **tidak menyentuh record customer nyata**.

Hasil yang diharapkan: `22 passed` (±1 menit). Artefak kegagalan ada di `test-results/`.

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

Akun & lisensi QA bertanda jelas (`qa.e2e.*@gmail.com`, `QA-E2E …`, `QA <label> …`). Membersihkan:

```bash
# Hapus HANYA user QA (email LIKE 'qa.%') + datanya — TIDAK menyentuh customer nyata.
python3 - <<'EOF'
import sqlite3, json
db = sqlite3.connect('server/data/auth.sqlite')
ids = [r[0] for r in db.execute("SELECT id FROM user WHERE email LIKE 'qa.%'")]
print('QA users:', len(ids))
for i in ids:
    db.execute('DELETE FROM session WHERE user_id=?', (i,))
    db.execute('DELETE FROM account WHERE user_id=?', (i,))
    db.execute('DELETE FROM user WHERE id=?', (i,))
db.commit(); db.close()
d = json.load(open('server/data/store.json'))
before = (len(d['accounts']), len(d['orders']), len(d['licenses']))
qa_acc = {a['id'] for a in d['accounts'] if str(a.get('email','')).startswith('qa.')}
d['accounts'] = [a for a in d['accounts'] if a['id'] not in qa_acc]
d['orders'] = [o for o in d['orders'] if o.get('accountId') not in qa_acc]
d['licenses'] = [l for l in d['licenses'] if l.get('accountId') not in qa_acc]
json.dump(d, open('server/data/store.json','w'), indent=1)
print('store cleaned:', before, '→', (len(d['accounts']), len(d['orders']), len(d['licenses'])))
EOF
pm2 restart copilot-backend --update-env
```

**Cadangkan dulu** jika ragu: `bash scripts/backup-data.sh`.

---

## 7. Hasil Test Aktual (2026-10-10)

| Gate | Hasil |
|---|---|
| Server tests (`cd server && npm test`) | **88/88 pass** |
| Root tests (`npm test`) | **153/153 pass** |
| Frontend typecheck + build | pass (`tsc -b` bersih, build <1s) |
| Browser E2E `npm run e2e` | **22/22 pass** (11 desktop + 11 mobile) |
| Protected landing checksum | OK (landing/intro/success tidak berubah) |
| Secret scan | bersih |

Yang dicakup E2E: register→dashboard, checkout sandbox→PENDING terverifikasi server (tanpa klaim palsu), polling berhenti saat dialog ditutup, empty states jujur (licenses/install/usage), session guard 401, logout mematikan sesi server, mobile 390px (drawer + tanpa overflow), admin gate 401, semua halaman admin render, issue lisensi + token sekali-lihat + tidak bocor di list + revoke, orders/ledger/usage/settings tanpa bocor kredensial (apiKey ter-mask), isolasi antar-akun (order A → 404 untuk B), cost integrity (body amount ditolak 400), customer tidak bisa buka admin.

## 8. Batasan & Blocker

1. **Transisi PENDING→PAID via UI tidak diotomasi** — butuh interaksi simulator klikqris.com (login/session upstream). Sudah tercakup oleh: runner CLI `klikqris-sandbox-journey.mjs` (sandbox asli) + test backend `customer-register-to-chat.e2e.test.js` (webhook forged/replay). Blocker: kredensial sesi simulator tidak tersedia untuk otomasi.
2. **AI chat end-to-end via dashboard nonaktif** — semua paket `ai.enabled:false` (keputusan produksi saat ini). Gateway sudah terbukti di test backend (quota exhausted, AI disabled, model not allowed — semua fail-closed). Aktifkan via `/admin/packages` bila PO memutuskan.
3. **Google OAuth** butuh callback origin produksi — dites manual via tombol "Lanjut dengan Google" di `/login` (provider aktif: `/api/config` → `providers.google: true`).
