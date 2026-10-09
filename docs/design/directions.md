# Design Directions — Final (2026-10-08)

## Tiga arah dirancang & dirender (prototype HTML live, bukan mockup statis)
- A — Refined enterprise SaaS: light Swiss, Plus Jakarta Sans, restraint (`/root/proto/a-1440.png`)
- B — Modern product console: light, brand blue #175CD3, bento composed, icon chips (`/root/proto/b-1440.png`)
- C — High-density control plane: dark compact, mono infra log, PRI P0/P1 (`/root/proto/c-1440.png`)

## Keputusan: B disempurnakan dgn density A + compact bars C
Alasan: B satu-satunya arah yang membawa identitas aplikasi (bukan marketing, bukan terminal)
dan komposisinya meluas ke customer console tanpa menyamakan karakter admin vs customer.
Kritik reviewer atas B (kurang densitas) diambil dari A: tabel terstruktur, ringkasan dl-grid,
restraint warna. Dari C hanya bar-header padat (h-11, panel headers 12.5px).

## Penerapan
- Theme light enterprise default (dark chassis tetap tersedia via .dark)
- Tokens: bg #F6F7F9, card #FFF, primary #175CD3, border #E5E8EC, muted-fg #667085
- Admin overview = bento "Butuh tindakan" (action cards dgn icon chips + inline CTA)
  + kolom "Kondisi bisnis & sistem" (pendapatan lunas bulan ini dari data nyata) + log AI kontekstual
- PageHeader scale: h1 text-xl, deskripsi 13.5px — rhythm konsisten semua route
- Customer: empty state padat, plan cards dgn harga nyata (Rp 10.000/20.000), Custom = label "Custom" (bukan Rp 0)
- axe 0 violations semua route (incl. settings fix emerald-700); tests 65+87; overflow none 390-1440
