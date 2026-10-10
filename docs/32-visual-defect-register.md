# Visual Defect Register — Acceptance Review (post-15d054d)

> Basis: 56 screenshot live `/root/shots-accept/` (14 rute × 1440/1280/768/390).
> Diranking per dampak user. Status diupdate saat fix terverifikasi.

| # | Rute · Viewport | Defect | Dampak | Fix | Verifikasi |
|---|---|---|---|---|---|
| D1 | `/admin/licenses/$id` · semua | Kolom Waktu ledger menampilkan **"Invalid Date"** — `fmtDate(String(createdAt))` mem-parse epoch ms sebagai string | Data rusak tampil di UI; merusak kepercayaan | Pass number langsung ke `fmtDate` | Screenshot detail: tanggal tampil benar |
| D2 | `/admin/licenses/$id` · semua | Badge status lisensi **hanya "—"** (status undefined dari list API) | Operator tak bisa lihat status di halaman detail | Derive status seperti halaman list (fallback expiresAt) | Badge "AKTIF" tampil |
| D3 | Admin semua rute · 390 | **Tidak ada trigger drawer/hamburger** — sidebar tak terjangkau di mobile | Navigasi mustahil di ponsel admin | Tambah `SidebarTrigger` di header (sudah ada Sheet mobile di ui/sidebar) | Screenshot 390: tombol menu terlihat & membuka drawer |
| D4 | `/admin/licenses/$id` · 768 | **Horizontal overflow** (sw=820 > 768) dari tabel ledger | Scroll ganda, konten terpotong | Bungkus tabel `overflow-x-auto` + `min-w-0` | sw ≤ 768 di capture ulang |
| D5 | `/admin/ledger` · semua | Badge `ok` (sukses) tampil **merah gelap** seperti error | Sukses tak terbedakan dari gagal — inti ledger | Perbaiki tone success StatusBadge agar terbaca di dark (emerald kontras) | Screenshot: ok hijau, error merah |
| D6 | Nav admin+customer · semua | Label nav **EN** (dari ZIP) vs konten halaman **ID** | Produk setengah-lokal; terasa template | Nav item di-Indonesiakan (label rute = h1 halaman) | Sidebar & h1 konsisten |
| D7 | `/user/payments` + `/user/orders` · semua | Banner pending menampilkan **slug mentah** (`quota-3b-90d`) + label status dobel (uppercase + pill) | Data mentah bocor ke customer; terlihat debug | Tampilkan `planName`, hapus label dobel | Banner manusiawi |
| D8 | `/user` · semua | Card-in-card (Ringkasan akun), KPI sama besar dgn body text, shortcut tanpa affordance | Hierarki datar; shortcut terlihat statik | Hapus nesting (divide-x), nilai KPI prominent, arrow + hover di shortcut | Screenshot |
| D9 | `/user/orders` · semua | CTA pricing cards **tidak sejajar** (card Custom punya teks di bawah tombol) | Ritme pricing table rusak | Footer area tinggi sama; disclaimer pindah atas CTA | Baseline CTA sejajar |
| D10 | `/admin/packages` · semua | Suffix "hari" & prefix "Rp" **melayang di luar input**; kuota teks polos tanpa styling | Form terlihat setengah jadi | Affix terintegrasi (relative wrapper), kuota konsisten | Screenshot |
| D11 | `/admin/settings` · semua | Key-value list **inkonsisten** (inline vs stacked), judul "SERVICE HEALTH" uppercase beda gaya, kartu tinggi tak rata | Kartu terlihat disatukan tanpa sistem | Property list seragam inline, judul Title Case, items-start | Screenshot |
| D12 | `/admin/licenses` · semua | Toolbar asimetris (search kiri, 70% kosong), `···` tanpa wrapper tombol | Density & affordance kurang | Ringkas kolom lebar + tombol ghost utk `···` | Screenshot |

**Ditolak (false positive vision QA):** "Nominal left-aligned" — kode sudah `text-right tabular-nums`; "Rp 0 jt" — unit `jt` sudah kecil+muted sesuai konvensi.

**Diluar scope sadar:** sort indikator kolom, bulk-select, page-size selector, date-range picker — fitur baru, bukan defect visual; masuk backlog produk.
