# Mini CRM + gRouter Copilot — Demo Acceptance Testing

Demo aplikasi customer **nyata** untuk menguji gRouter Copilot end-to-end: install → license → first-run setup → AI menjawab dari data CRM.

> Mode instalasi di panduan ini adalah **local-dev** (package `@grouter/copilot` belum dipublikasikan ke npm registry). Instalasi memakai path repo langsung — mekanisme CLI dan lisensi 100% sama dengan yang akan dipakai customer via registry.

## Prasyarat
- Node.js >= 20
- Lisensi gRouter Copilot aktif (token dari dashboard admin / dari tim)
- Akses ke Copilot backend gateway (`https://copilot.grouter.id`)

## Langkah 1 — Jalankan CRM (tanpa Copilot)
```bash
cd examples/mini-crm-copilot
npm install
node seed.js            # generate 42 customers / 26 leads / 14 deals / 85 activities
npm start               # http://localhost:4602
```
**Berhasil jika:** browser membuka http://localhost:4602, Dashboard menampilkan angka overview (42 customer, 11 open deals), tab navigasi berfungsi.

## Langkah 2 — Instal gRouter Copilot (local-dev install)
```bash
export DEMO_LICENSE="<token lisensi Anda>"
npm run install:copilot   # atau: node ../../bin/grouter-copilot.js install --license "$DEMO_LICENSE" --license-server https://copilot.grouter.id
```
**Berhasil jika:** output menampilkan `✔ Saved gateway configuration to .env` dan file `.env` berisi GROUTER_GATEWAY_URL + GROUTER_LICENSE_PUBLIC_KEY (tanpa provider secret — D-021).

## Langkah 3 — Hubungkan route + panel ke CRM
Patch integrasi sudah diterapkan pada repo ini (server.js mount `/api/copilot`, index.html memuat `copilot-panel.js`). Jika membangun dari nol: ikuti komentar slot di `server.js` + instruksi `routes/copilot.js`.

## Langkah 4 — Restart & first-run setup
```bash
npm start
```
**Berhasil jika:** bubble `✦ Copilot (demo panel)` muncul kanan-bawah; klik pertama membuka panel; status health dari `/api/copilot/health`.

## Langkah 5 — Uji AI (data CRM nyata)
Contoh pertanyaan pada panel:
1. "Berapa total customer, leads aktif, dan deals yang masih terbuka saat ini?"
2. "Cari customer yang pernah mengeluhkan keterlambatan delivery."
3. (buka detail customer dulu) "Ringkas hubungan kita dengan customer ini."
4. "Deals mana yang berpotensi closing bulan ini, dan apa alasannya?"
5. "Buatkan draft follow-up untuk customer yang belum merespons selama tujuh hari."
6. "Ubah status lead lead_001 menjadi qualified." → proposal muncul → klik **Terapkan perubahan** → status di tab Leads berubah.

**Berhasil jika:** jawaban menyebut angka/nama dari data seed (bukan generik), sumber tercantum, dan use case 6 hanya berubah setelah konfirmasi.

## Error states
- Lisensi invalid/expired → pesan jelas dari gateway (`LICENSE_INVALID`), tidak ada jawaban karangan.
- Kuota habis → `QUOTA_EXCEEDED`.
- Skill tidak ditemukan / ID tak ada → Copilot menjawab "tidak ditemukan" (grounded).

## Reset
```bash
node seed.js      # kembalikan data awal (deterministik, sha256 identik)
```

## Struktur
```
copilot.config.js   # config Copilot (skills, limits, systemPrompt)
skills/             # 6 skill read-only (overview, find, detail, pipeline, draft, proposal)
routes/copilot.js   # Express router: POST /chat + GET /health (gatewayChat D-021)
public/copilot-panel.js  # panel chat demo (view only, label 'Copilot (demo panel)')
seed.js / lib/db.js # data deterministik + helper
test/               # integration tests (node --test)
e2e/                # journey acceptance (playwright)
CONTRACT.md         # kontrak antarmodul (locked)
```

## Troubleshooting
| Masalah | Penyebab | Solusi |
|---|---|---|
| `License verification failed` | token salah/expired | periksa token, minta lisensi baru |
| Panel error `failed to fetch` | gateway tidak terjangkau | cek GROUTER_GATEWAY_URL di .env |
| Jawaban generik/karangan | skill tidak terdaftar | cek copilot.config.js skills[] |
| `EADDRINUSE` 4602 | port dipakai | DEMO_PORT=4603 npm start |

---

## Acceptance journey otomatis (E2E)

```bash
# server demo harus jalan (npm start di terminal lain)
DEMO_LICENSE=<token> NODE_PATH=/home/ubuntu/grouter_copilot/e2e/node_modules node e2e/journey.mjs
```
Hasil: tabel PASS/FAIL per stage + screenshot di `shots/` (dashboard, pencarian, bubble, tiap use case, proposal, mutasi ter-apply).

## Use case yang dibuktikan live (2026-10-12, lisensi nyata lic_demo)
| # | Pertanyaan | Hasil |
|---|---|---|
| UC1 | Berapa total customer, leads aktif, dan deals terbuka? | 42 customer / 20 leads aktif / 11 deals terbuka — angka dari seed, bukan hardcode |
| UC2 | Cari customer keluhan keterlambatan pengiriman | 4–6 customer ditemukan + alasan (kutipan aktivitas asli) |
| UC3 | Ringkas hubungan dengan customer cus_003 | detail + aktivitas milik customer itu saja |
| UC4 | Deals yang berpotensi closing bulan ini | analisis dari stage/expectedClose aktual |
| UC5 | Draft follow-up >7 hari | 5 draft, bertanda DRAFT, tidak ada email terkirim |
| UC6 | Ubah status lead → qualified | proposal → tombol "Terapkan perubahan" → POST status → UI update (tanpa konfirmasi TIDAK ada mutasi) |
| UC7 | ID tak ada / data tak tersedia | "tidak ditemukan" — tidak mengarang record |

## Keputusan arsitektur penting
- **Arg extraction di runtime produk**: skill berparameter wajib (query/customerId/leadId) diekstrak dari pesan via SATU call kecil ke gateway (fail-closed). Tanpa ini pengguna natural-language selalu kena SKILL_INVALID_ARGS — gap produk, diperbaiki di `src/runtime/chat.js` (bukan dipancang di demo).
- **Model default**: config tanpa override → gateway memakai model default paket. Placeholder `grouter-default` DITOLAK upstream (ditemukan saat acceptance; template CLI diperbaiki juga).
- **Widget vs panel demo**: widget JSX produk dipakai untuk Next.js; demo Express memakai panel view ringan yang memanggil endpoint yang sama. Logika tetap milik produk.
- **Skill matching v1**: keyword matcher atas nama+deskripsi skill — pesan ambigu → pesan jelas "mohon lebih spesifik" (tidak menebak).
