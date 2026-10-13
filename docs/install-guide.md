# Panduan Instalasi gRouter Copilot — Pelanggan Pertama Kali

> **Panduan ini diverifikasi langsung terhadap CLI nyata** (2026-10-13, `@grouter/copilot`
> 0.1.0 dari tarball `grouter-copilot-0.1.0.tgz`): setiap perintah dan output di bawah
> adalah hasil eksekusi sungguhan — install sukses, install gagal, health check, dan
> pertanyaan pertama — terhadap license server yang berjalan. Bukan contoh fiktif.

---

## 1. Prasyarat

| Kebutuhan | Detail |
|---|---|
| Node.js | **≥ 18** (syarat `engines` paket). Disarankan **Node LTS ≥ 20.6** agar bisa memakai `node --env-file=.env` (lihat bagian 6). |
| npm | Ikut paket Node.js. |
| Aplikasi Anda | Node.js murni, Express, atau Next.js — installer mendeteksi framework otomatis. |
| Lisensi Copilot aktif | Cara mendapatkannya di bagian 2. |
| File paket (tarball) | Dari tim gRouter — lihat bagian 3. **npm publik belum tersedia.** |

---

## 2. Mendapatkan lisensi (alur dashboard)

1. Daftar / masuk di **https://copilot.grouter.id** (panduan akun: `docs/user-guide-akun.md`).
2. Buka halaman **Paket & Harga**, pilih paket, selesaikan pembayaran QRIS.
3. Setelah pembayaran terkonfirmasi server, halaman sukses menampilkan
   **perintah instalasi lengkap yang sudah berisi token lisensi Anda**.
   Salin seluruh baris perintah itu (klik tombol salin).
4. **Token lisensi ≠ License ID.**
   - *License ID* (contoh bentuk: `lic_xxxx_n`) adalah penanda di tabel lisensi dashboard.
   - *Token lisensi* adalah teks panjang (~320+ karakter, diawali `eyJ…`) yang ditandatangani
     secara digital (Ed25519). **Hanya token yang diterima CLI.**
     Menempelkan License ID ke perintah install menghasilkan kegagalan nyata:
     `✗ License validation failed — License rejected by the server` / `Cause: Malformed license` (keluar dengan kode 1).
5. Token ditampilkan **satu kali** di halaman sukses setelah pembayaran. **Jika hilang:**
   buka dashboard → **Install** → klik **"Lihat token lisensi (pemulihan token hilang)"** —
   token semua lisensi milik akun Anda bisa dilihat ulang dan disalin dari sana
   (`GET /api/me/licenses/:id/token`, hanya untuk pemilik akun). Lisensi yang dicabut
   tidak menampilkan token (tidak berguna — install/chat dengan token itu otomatis ditolak);
   beli/perpanjang paket untuk lisensi baru.

---

## 3. Mendapatkan paket (distribusi saat ini)

- **Paket npm BELUM dipublish.** `npm install @grouter/copilot` dari registry npm akan
  gagal (404) sampai ada pengumuman resmi. Jangan percaya tutorial yang menyuruh instal
  dari registry.
- Distribusi resmi saat ini: **file tarball** `grouter-copilot-0.1.0.tgz` yang Anda terima
  dari tim gRouter (dibuat dengan `npm pack` dari repositori resmi).
  Jika tim memberikan nilai sha256, cocokkan: `sha256sum grouter-copilot-0.1.0.tgz`.
- Tarball berisi CLI (`bin/grouter-copilot.js`) + library runtime (`src/`) — total 17 file,
  tanpa skrip postinstall, tanpa dependensi wajib (React hanya opsional untuk widget UI).

---

## 4. Instalasi (perintah nyata)

Jalankan di direktori aplikasi Anda (server, bukan komputer browser):

```bash
cd /path/ke/aplikasi-anda
npm install /path/ke/grouter-copilot-0.1.0.tgz
npx grouter-copilot install --license <TOKEN-LISENSI-ANDA> --license-server https://copilot.grouter.id
```

- `--license-server` boleh ditiadakan (default `https://copilot.grouter.id`,
  atau lewat variabel lingkungan `GROUTER_LICENSE_SERVER`). Alias `--licenseServer` juga diterima.
- Ganti `<TOKEN-LISENSI-ANDA>` dengan token penuh dari bagian 2 — jangan dipotong.

**Output nyata saat berhasil** (proyek Node.js tanpa framework; token selalu disamarkan `****…4 digit terakhir`):

```text
gRouter Copilot — install

→ Validating license…
✔ License valid (****…XJDA) — exchanging for gateway configuration (non-secret)
✔ Framework detected: Node.js (vanilla)
→ Writing project files…
✔ Created copilot.config.js
✔ Created skills/example.js
✔ Created src/copilot-route.js
✔ Created src/copilot-health.js
✔ Created .env (GROUTER_GATEWAY_URL, GROUTER_LICENSE, GROUTER_LICENSE_SERVER, GROUTER_LICENSE_PUBLIC_KEY)

How it works: your app calls the Copilot backend gateway; the gRouter service
credential stays server-side (D-021) and is never stored in your project.

Next steps:
  1. Restart your app so the new .env values are loaded.
  2. Wire the chat route: mount copilotHandler from src/copilot-route.js at POST /api/copilot/chat in your server.
     If your UI is React, render CopilotChat from "@grouter/copilot/widget" in your own wrapper component.
  3. Edit skills/example.js to expose only data you explicitly approve (read-only).
  4. Verify: GET /api/copilot/health on your app returns {"status":"ok"}.
```

**File yang dihasilkan:**

| File | Fungsi |
|---|---|
| `copilot.config.js` | Konfigurasi Copilot: system prompt, daftar skill, limit. Edit di sini untuk mendaftarkan skill baca-saja dari data aplikasi Anda. |
| `skills/example.js` | Contoh skill read-only. Ganti dengan skill Anda sendiri (kembalikan hanya data yang Anda izinkan). |
| Rute chat (tergantung framework) | Handler `POST` yang meneruskan pertanyaan ke gateway Copilot. |
| Rute health | Handler `GET` status kesiapan lokal (dipakai untuk verifikasi, bagian 7). |
| `.env` | Empat kunci: `GROUTER_GATEWAY_URL` (alamat gateway), `GROUTER_LICENSE` (token lisensi Anda), `GROUTER_LICENSE_SERVER` (alamat license server), `GROUTER_LICENSE_PUBLIC_KEY` (kunci publik verifikasi — bukan rahasia). |

**Per framework** (deteksi otomatis dari `package.json`):

| Framework | Rute chat | Rute health | Ekstra |
|---|---|---|---|
| Node.js / Express | `src/copilot-route.js` / `routes/copilot.js` | `src/copilot-health.js` / `routes/copilot-health.js` | — |
| Next.js App Router | `app/api/copilot/chat/route.js` | `app/api/copilot/health/route.js` | `components/CopilotWidget.jsx` |
| Next.js Pages Router | `pages/api/copilot/chat.js` (atau `src/pages/…`) | `pages/api/copilot/health.js` | `components/CopilotWidget.jsx` |

File yang sudah ada **tidak pernah ditimpa** (tampil `· Skipped (already exists)`).
`.env` yang sudah ada hanya diperbarui pada empat kunci `GROUTER_*` itu; kunci lain tidak disentuh.

**Yang dikirim dan diterima installer:** token lisensi dikirim ke license server (`POST /api/resolve`,
HTTPS); yang kembali hanya konfigurasi NON-rahasia (URL gateway + kunci publik verifikator).
Tidak ada kredensial provider yang pernah ditulis ke proyek Anda — jika server mencoba
mengirim kredensial, installer menolaknya (proteksi D-021).

---

## 5. Memasang rute di aplikasi (contoh Express)

Untuk scaffold Node.js/Express, pasang handler yang dihasilkan di server Anda
(pola yang sama dipakai contoh resmi `examples/mini-crm-copilot`):

```js
import express from 'express';
import { copilotHandler } from './src/copilot-route.js';       // rute chat hasil scaffold
import { copilotHealthHandler } from './src/copilot-health.js'; // rute health hasil scaffold

const app = express();
app.use(express.json());
app.post('/api/copilot/chat', (req, res) => copilotHandler(req, res));
app.get('/api/copilot/health', (req, res) => copilotHealthHandler(req, res));
app.listen(3000);
```

> **Penting:** handler hasil scaffold memakai API Express (`res.status(...).json(...)`).
> Menempelkannya ke `http.createServer` polos akan error nyata:
> `TypeError: res.status is not a function`. Untuk scaffold "Node.js (vanilla)",
> pakai Express (atau framework dengan API `res` yang sama). Next.js tidak terdampak
> (rute hasil scaffold sudah bentuk `route.js`/`handler` Next).

---

## 6. Muat `.env` sebelum menjalankan aplikasi (PENTING — sering terlewat)

Node **tidak** membaca `.env` secara otomatis. Lupa langkah ini menghasilkan kegagalan nyata
yang sudah diverifikasi:

- `GET /api/copilot/health` → **503** `{"status":"unavailable","checks":{"license":false,"skills":true,"provider":false}}`
- `POST /api/copilot/chat` → **500** `CopilotError: License verifier is not configured.`

Solusi:

```bash
# Node ≥ 20.6 (disarankan):
node --env-file=.env server.js

# Node < 20.6: muat env di kode Anda sendiri (parser .env sederhana / dotenv)
# SEBELUM file yang membuat Copilot diimpor.
```

Setelah env termuat, hasil nyata:

```text
GET /api/copilot/health → 200
{"status":"ok","checks":{"license":true,"skills":true,"provider":true}}
```

---

## 7. Cek kesehatan + pertanyaan pertama

```bash
# 1) Health (harus 200 + "ok" — lihat bagian 6 bila belum)
curl -s http://localhost:3000/api/copilot/health

# 2) Pertanyaan pertama lewat rute aplikasi Anda
curl -s -X POST http://localhost:3000/api/copilot/chat \
  -H 'content-type: application/json' \
  -d '{"message":"Halo, apa yang bisa kamu baca dari data aplikasi ini?"}'
```

Jawaban sukses berstatus `"status":"complete"` dengan `answer` + sumber data skill yang dipakai.

**Respons galat yang MUNGIL dan artinya (pesan nyata):**

| Respons | Artinya |
|---|---|
| `503` `{"code":"NOT_CONFIGURED","message":"AI gateway is not configured."}` | Lisensi Anda valid, tetapi operator gRouter belum menautkan kredensial provider ke layanan. Installer/instalasi Anda tidak salah — hubungi tim gRouter untuk aktivasi layanan, lalu coba lagi. |
| `502`-an berisi `{"code":"LICENSE_INVALID","message":"License is invalid or expired."}` | Token di `.env` salah/kedaluwarsa — periksa `.env` berisi token penuh (bagian 9 untuk perpanjangan). |
| `{"code":"LICENSE_REVOKED","message":"License has been revoked."}` | Lisensi dicabut operator. Beli/perpanjang lisensi, lalu jalankan ulang `install` dengan token baru. |
| `{"code":"QUOTA_EXHAUSTED"}` (HTTP 429) | Kuota paket habis — perpanjang atau upgrade paket. |

---

## 8. Troubleshooting installer (pesan NYATA + kode keluar)

Semua kegagalan install berhenti **sebelum menulis file apa pun** (tidak ada scaffold, tidak ada `.env`,
kode keluar `1`) dan selalu mencetak `Cause:` + `Fix:`. Token Anda tidak pernah dicetak penuh
(hanya `****…4 digit terakhir`).

| Pesan di layar | Artinya | Solusi |
|---|---|---|
| `Missing required option: --license <license-token>` (keluar 1) | Perintah tanpa `--license` | Jalankan ulang dengan token penuh; tanpa lisensi bisa pakai `grouter-copilot init` (scaffold saja, tanpa `.env`). |
| `Unknown command: xyz` (keluar 1) | Perintah tidak dikenal | Perintah valid hanya `init` dan `install` (lihat `grouter-copilot --help`). |
| `✗ License validation failed — License rejected by the server` + `Cause: Malformed license` (keluar 1) | Token tidak sah bentuknya — paling sering karena yang ditempel **License ID** (`lic_…`), bukan token lisensi, atau token terpotong | Salin ulang perintah lengkap dari halaman sukses pembayaran (bagian 2). |
| `✗ … — License rejected by the server` + `Cause: license revoked` (keluar 1) | Lisensi sudah dicabut operator | Minta lisensi baru / selesaikan pembayaran, lalu install dengan token baru. |
| `✗ … — Cannot reach the license server` + `Cause: Network error … (fetch failed)` (keluar 1) | Server lisensi tidak terjangkau (internet/proxy/URL salah) | Cek koneksi dan `--license-server`; coba lagi. |
| `✗ … — License verification failed` + `Cause: Invalid URL` (keluar 1) | `--license-server` tanpa scheme | Tulis lengkap: `https://copilot.grouter.id` (dengan `https://`). |
| `License not activated` (pesan bawaan CLI) | Versi server lama menolak karena kredensial provider belum ditautkan | Ikuti `Fix:` di layar — minta operator menautkan kredensial, lalu ulangi. Server saat ini umumnya tidak lagi menolak di tahap install (aktivasi berdampak di tahap chat — `NOT_CONFIGURED`, bagian 7). |
| `Rate limited` (HTTP 429) | Terlalu banyak percobaan dari mesin ini dalam waktu singkat | Tunggu ±1 menit, ulangi perintah yang sama. |
| `Payment pending` (HTTP 402) | Pembayaran paket belum terkonfirmasi | Selesaikan pembayaran QRIS / hubungi operator, lalu ulangi. |
| `License server error` (HTTP 5xx) | Server sedang bermasalah/restart | Coba lagi beberapa saat; kalau terus, hubungi support dengan waktu percobaan. |
| `Server tried to hand off a provider credential` | Server lisensi lama/rusak mencoba mengirim kredensial — installer menolak demi keamanan | Perbarui license server (laporkan ke tim gRouter). |

**Saat aplikasi berjalan (runtime):** lihat tabel respons di bagian 7 (`NOT_CONFIGURED`,
`LICENSE_INVALID`, `LICENSE_REVOKED`, `QUOTA_EXHAUSTED`), plus:

| Gejala | Penyebab | Solusi |
|---|---|---|
| Health 503 `license:false` padahal `--env-file` sudah dipakai | `.env` terduplikasi / baris `GROUTER_LICENSE=` lama menang | Pastikan hanya SATU baris `GROUTER_LICENSE=` terbaru di `.env`, restart. |
| Health 503 `provider:false` | `GROUTER_LICENSE_SERVER` tidak terbaca di proses | Muat `.env` sebelum start (bagian 6), restart. |
| `TypeError: res.status is not a function` | Handler scaffold dipasang di `http.createServer` polos | Pakai Express / API `res` bergaya Express (bagian 5). |
| `Error: listen EADDRINUSE :::3000` | Port dipakai proses lain | Matikan proses lama (cari dengan `ss -ltnp | grep 3000`) atau ganti port. |

---

## 9. Upgrade, perpanjang, copot

**Upgrade paket (versi baru):**
```bash
npm install /path/ke/grouter-copilot-<versi-baru>.tgz
```
Lalu restart aplikasi. Jalankan ulang perintah `install` hanya bila versi baru menambah
kunci `.env` (output installer akan menyebutkannya).

**Perpanjang / ganti lisensi:**
1. Beli paket lagi di dashboard → setelah lunas, token baru tampil di halaman sukses.
2. Jalankan ulang perintah `install --license <TOKEN-BARU>` — keempat kunci `GROUTER_*`
   di `.env` diperbarui **di tempat**; file proyek lain tidak ditimpa (tampil `· Skipped (already exists)`).
3. Pastikan `.env` hanya berisi **satu** baris `GROUTER_LICENSE=` yang terbaru, lalu restart aplikasi.

**Copot (uninstall):**
```bash
npm uninstall @grouter/copilot        # menghapus CLI + library (terverifikasi)
```
Bersihkan sisanya secara manual bila mau: hapus file scaffold (`copilot.config.js`,
`skills/example.js`, rute `copilot*`, `components/CopilotWidget.jsx`) dan keempat baris
`GROUTER_*` di `.env`. Untuk mencabut akses secara paksa (mis. perangkat hilang),
minta operator mencabut lisensi — setelah dicabut, semua chat langsung ditolak
`LICENSE_REVOKED` (terverifikasi) dan `install` dengan token lama juga ditolak.

---

## 10. Ringkasan keamanan

- CLI hanya mengirim **token lisensi** ke license server lewat HTTPS; tidak ada kredensial
  provider yang pernah diminta, diterima, atau ditulis ke proyek Anda.
- Token lisensi adalah materi sensitif: hanya di `.env` sisi server, **jangan** di-commit,
  **jangan** dipakai di kode browser.
- Tanpa override model, gateway memakai model default paket lisensi (kebijakan sisi server).
- Pembayaran tidak pernah otomatis aktif tanpa verifikasi server — status lunas selalu
  diverifikasi ulang ke penyedia pembayaran sebelum lisensi diterbitkan.

---
*Diverifikasi live 2026-10-13: `npm pack` → instal fresh di direktori kosong → `install`
sukses + 7 skenario gagal nyata → health 200 → chat (NOT_CONFIGURED/LICENSE_REVOKED nyata)
→ uninstall. Sumber: `bin/grouter-copilot.js`, `src/index.js`, `examples/mini-crm-copilot/`,
`docs/22-customer-flow.md`. Dokumen pendamping: `docs/user-guide-akun.md` (akun & pembayaran).*
