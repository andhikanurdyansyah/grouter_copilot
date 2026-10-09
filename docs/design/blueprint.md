# Product Experience Blueprint — gRouter Copilot (v2, zero-based)

## 3.1 Blueprint

### Persona (non-fiktif, dari data produk nyata)
1. **Operator Copilot** (admin): pekerjaan harian = menyetujui pembayaran (settle), menerbitkan/cabut lisensi, menyetel kebijakan AI per paket, menyelidiki ledger. 1 orang, volume kecil, tugas presisi, berisiko (uang & akses customer). BUTUH: kepadatan data, urutan kerja jelas, jejak konteks.
2. **Pemilik Produk/Customer** (customer): ingin tahu "apakah lisensi saya aktif, sisa kuota berapa, bagaimana pasang, kapan harus perpanjang". Non-teknis-menengah, self-service. BUTUH: kepastian status, bahasa sederhana, langkah berikutnya yang jelas.

### Job-to-be-done kunci
- Admin JTBD: "Saat order masuk, saya harus bisa memverifikasi & menyetel pembayaran dengan percaya diri dalam <2 menit, tanpa salah kirim lisensi."
- Admin JTBD 2: "Saat customer lapor gagal AI, saya harus bisa menemukan lisensinya, melihat ledger request terakhirnya, dan mengetahui penyebab (kuota/model/policy) cepat."
- Customer JTBD: "Setelah bayar, saya ingin langsung tahu lisensi saya aktif dan cara memasangnya hari ini."
- Customer JTBD 2: "Saya ingin tahu kapan kuota saya mau habis SEBELUM pekerjaan saya terganggu."

### Prioritas informasi per konteks
- Admin: (1) antrian tindakan (order pending, lisensi bermasalah), (2) status sistem, (3) data lengkap dengan filter, (4) konfigurasi.
- Customer: (1) status lisensi & kuota saya, (2) langkah berikutnya, (3) riwayat, (4) katalog beli.

### Perbedaan mendasar admin vs customer (kenapa shell berbeda)
- Admin = **control plane**: tabel padat, workflow multi-langkah, aksi berisiko → layout tabel-first, kolom aksi, dialog konfirmasi berlapis.
- Customer = **self-service product**: kartu status + panduan, bukan grid internal → layout card/guide-first, satu kolom fokus, bahasa non-administratif.
- Konsekuensi IA: admin nav berdasar OBJEK kerja (Lisensi, Order, Paket, Ledger); customer nav berdasar PERTANYAAN (Status saya, Cara pasang, Pemakaian saya, Beli, Akun).

### Masalah UX yang diselesaikan v2
1. Overview admin = "4 kartu + quick actions" generik → ganti: **antrian tindakan (work queue)** + health strip; kartu metrik hanya penopang.
2. Tidak ada halaman detail → tambah **License detail** (admin): status, paket, kuota, ledger terkait, riwayat, aksi (revoke).
3. Customer onboarding tercecer (install di halaman lisensi) → **journey onboarding 3-langkah** di overview + halaman khusus "Instalasi".
4. Purchase journey = grid paket datar → **comparison table + selected state + langkah pembayaran QRIS** yang jelas.
5. Empty/error/prototype state tidak konsisten → satu komponen state + penanda jelas "pratinjau" utk fitur tanpa backend.

### Prinsip desain
1. **Antrian > dashboard**: admin melihat "apa yang butuh tindakan saya", bukan angka total.
2. **Status dulu, angka kemudian**: customer tahu AKTIF/HABIS/EXPIRED sebelum token.
3. **Satu aksi utama per halaman**; aksi berisiko selalu 2-langkah + jelaskan dampak.
4. **Data hidup nyata**: angka dari API; bila prototype, diberi label "PRATINJAU".
5. **Bahasa peran**: admin boleh teknis (license, revoke, settle); customer pakai istilah produk (aktif, kuota, perpanjang).

## 3.2 Information Architecture

### Admin sitemap (control plane)
```
/admin (Control plane)
├─ Overview "Antrean Operasional"     → work queue: order pending, lisensi perlu perhatian, health
├─ Lisensi (objek kerja utama)
│  ├─ Daftar Lisensi (tabel + filter + search + bulk-safe)
│  └─ /admin/licenses/:id (detail: status, kuota, ledger, aksi)
├─ Orders & Reconciliasi
│  └─ tabel + tab status (Pending/Paid/Semua) + settle workflow
├─ Paket & Kebijakan AI
│  └─ kartu paket + editor policy (allowlist, default, kuota)
├─ AI Ledger (pencarian & filter padat, pagination)
├─ Infrastruktur
│  ├─ Usage provider (terpisah dari kuota customer)
│  └─ Pengaturan & Health
└─ (topbar) health pill, command menu, profile
```
Primary nav = 5 grup objek; halaman detail TIDAK jadi menu; aksi destruktif hanya di konteks detail/row.

### Customer sitemap (self-service)
```
/user (Produk untuk pelanggan)
├─ Beranda "Status saya"      → kartu status lisensi+kuota, next best action, onboarding 3 langkah
├─ Instalasi & Panduan        → step-by-step + troubleshooting
├─ Pemakaian AI               → progress kuota + riwayat pemakaian
├─ Paket & Perpanjangan       → comparison + checkout QRIS + riwayat order
└─ Akun                       → identitas, sesi, keluar
```
Primary nav = 5 pertanyaan pelanggan; tanpa grid admin; tanpa istilah infrastruktur.

### Per-halaman spec (ringkas, semua route)
Lihat 3.3 wireframes untuk komposisi. Setiap halaman menetapkan: primary action tunggal, secondary, empty/loading/error/destructive state, responsive (mobile = stack + drawer nav), a11y (h1 unik, landmark, focus trap dialog, status bukan hanya warna + ikon + teks).

---
## STATUS IMPLEMENTASI (2026-10-08)
- Admin IA baru live: Antrean Operasional (work queue) / Objek Kerja (Lisensi, Orders & Reconciliasi, AI Ledger) / Konfigurasi (Paket & Kebijakan AI, Usage Provider, Pengaturan & Health).
- Customer IA baru live: Status Saya / Instalasi & Panduan / Pemakaian AI / Paket & Perpanjangan (comparison table) / Akun.
- axe-core: 0 violations di admin-licenses/packages/orders/gate + /user, /user/install, /user/orders, /user/account.
- Semua data nyata dari API; tidak ada mock di runtime produksi.
- Screenshots: /root/shots-v2/*.png; checkpoint rollback: tag `pre-zero-redesign` (ef56d91).
