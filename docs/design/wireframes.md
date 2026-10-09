# Wireframes & Visual Direction — gRouter Copilot v2

## 3.3 Wireframes

### Admin — Overview "Antrean Operasional"
```
┌──────────┬──────────────────────────────────────────────────────┐
│ gR Admin │  Antrean Operasional          [health: ● Sehat] ⟳    │
│          ├──────────────────────────────────────────────────────┤
│ OPERA-   │  ┌─ PERLU TINDAKAN ──────────────────────────────┐   │
│ SIONAL   │  │ ⚠ 2 order menunggu verifikasi    [Buka Orders]│   │
│ ▸Antrean │  │ ⚠ 1 lisensi dicabut 7 hari      [Buka Lisensi]│   │
│ ▸Lisensi │  │ ✓ Tidak ada kuota meluap               (riuh=0)│   │
│ ▸Orders  │  └────────────────────────────────────────────────┘   │
│ KOMER-   │  ┌─ METRIK SINGKAT ──────────────────────────────┐   │
│ SIAL     │  │ Lisensi aktif 8 │ Order lunas 12 │ Revoked 5  │   │
│ ▸Paket   │  └────────────────────────────────────────────────┘   │
│ ▸Ledger  │  ┌─ AKTIVITAS TERAKHIR (ledger 10 terbaru) ──────┐   │
│ INFRA    │  │ waktu │ lisensi │ model │ token │ status      │   │
│ ▸Usage   │  │ …     │ mono    │ mono  │ tab   │ badge       │   │
│ ▸Pengat. │  └────────────────────────────────────────────────┘   │
└──────────┴──────────────────────────────────────────────────────┘
```
Primary action = item antrean (mengarah ke alur). Metrik penopang, bukan bintang halaman.

### Admin — Lisensi (list) & Detail
```
List: h1 Lisensi [10]        primary: [+ Terbitkan]
 [search pelanggan/lic_] [status ▾]
 ┌ tabel padat ───────────────────────────────────────────────┐
 │ Pelanggan▾ │ ID (mono, copy) │ Paket │ Status▾ │ Kedal.▾ │ ⋯ │
 └────────────────────────────────────────────────────────────┘
 ─ footer: 10 dari 10 lisensi ─
Detail (/admin/licenses/:id): header nama+status+copy-id, ringkasan
(status/paket/kuota/kedaluwarsa), ledger 10 terakhir utk lisensi ini,
zona aksi: [Cabut Lisensi] merah terpisah bawah + konfirmasi berlapis.
```

### Admin — Orders (reconciliasi)
```
h1 Orders & Reconciliasi  [tab: Menunggu | Lunas | Semua] [⟳]
 tabel: ID │ Paket+kuota │ Nominal │ Status │ Dibuat │ Dibayar │ [Verifikasi]
 settle → dialog: nominal, upstream re-verify disclaimer, tombol [Verifikasi]
 empty(menunggu): "Tidak ada order menunggu — antrean bersih." + ilustrasi netral
```

### Admin — Paket & Kebijakan AI
```
h1 Paket & Kebijakan AI      dirty: [Simpan perubahan]
 per paket (kartu-baris, bukan kartu dekoratif): nama, harga (IDR, server),
 durasi, kuota; editor AI: [AI aktif ⌾] provider, allowlist (chips),
 default (dropdown dari allowlist), quota token (format ribuan)
 drift warning: "Konfigurasi tidak valid → AI fail-closed 503"
```

### Customer — Beranda "Status saya"
```
┌──────────┬──────────────────────────────────────────────────────┐
│ gR       │  Selamat datang, {nama}                              │
│          │  ┌─ STATUS LISENSI ─────────────────────────────┐    │
│ ▸Beranda │  │ ● AKTIF — Pro · s.d. 12 Mei 2027             │    │
│ ▸Instal. │  │ Kuota AI  [██████░░░░] 62% terpakai          │    │
│ ▸Pemak.  │  │ Sisa 5.7 jt token dari 15 jt (lifetime)      │    │
│ ▸Paket   │  │        primary: [Pasang Copilot]             │    │
│ ▸Akun    │  └──────────────────────────────────────────────┘    │
│          │  ┌─ LANGKAH SAMPAI JALAN (jika belum lengkap) ──┐    │
│          │  │ ① beli ✓ ② lisensi aktif ✓ ③ pasang → panduan│    │
│          │  └──────────────────────────────────────────────┘    │
│          │  (habis: banner merah "Kuota habis — Perpanjang")    │
└──────────┴──────────────────────────────────────────────────────┘
```

### Customer — Instalasi, Pemakaian, Paket, Akun
```
Instalasi: stepper 3 langkah (Salin ID → jalankan installer → verifikasi
heartbeat), blok ID + copy, troubleshooting accordion.
Pemakaian: progress ring besar + sisa/limit + tabel riwayat + "cara hitung".
Paket: comparison table (Baris=fitur: kuota, durasi, AI, harga; kolom=paket),
paket aktif ditandai; primary [Beli/Perpanjang] → drawer QRIS + status order.
Akun: identitas, sesi (perangkat), [Keluar] (dialog).
```

## 3.4 Visual direction
- **Karakter**: "precise operations" — permukaan tenang, aksen tunggal, data mono, density tinggi utk admin; card lembut utk customer.
- **Type**: Inter UI (scale 12/13/14/16/20/24, tabular-nums utk angka, mono utk ID/model).
- **Space**: 4-base (4/8/12/16/24/32); konten max-w-6xl; tabel cell py-2.5 (admin) vs card p-6 (customer).
- **Surface**: border 1px `--border`, radius lg (kartu) md (kontrol), elevation minimal (shadow hanya dialog/popover).
- **Warna**: brand primary (tetap sistem shadcn, token Copilot), semantic: success=emerald, warning=amber, danger=red, info=blue; status TIDAK hanya warna (selalu + teks label).
- **Sidebar**: admin = grouped sections w/ label uppercase kecil; active = pill accent + ikon; customer = nav polos besar (5 item) + header produk.
- **Table**: header muted uppercase-kecil, row hover, kolom angka kanan tabular, ID mono + copy affordance hover.
- **Feedback**: toast (sonner) utk hasil aksi; dialog utk keputusan; skeleton utk loading; EmptyState dgn 1 CTA.
- **Theme**: light default + dark (prefers), kontras AA di keduanya.
- **Charts**: hanya progress kuota (bar/ring); tidak ada chart dekoratif.
- **Mobile**: admin tabel → kolom prioritas + scroll-x terkendali; nav → sheet drawer; customer card stack penuh.
