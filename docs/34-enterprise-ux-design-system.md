# 34 — gRouter Copilot: Enterprise UX Design System (Ringkas)

Status: token nyata di `src/widget/design-tokens.js` (ESM, import langsung oleh kode).
Selaras dengan `server/public/assets/grx.css` (Enterprise Design System v2 — gunmetal
steel + cyan `#22d3ee`) dan `docs/24-design-system.md`. Bukan mockup: setiap nilai di
file token adalah nilai yang dipakai komponen.

## 1. Design Direction

gRouter Copilot harus terasa seperti bagian dari konsol enterprise yang sama dengan
dashboard gRouter: latar gunmetal gelap berlapis steel, satu aksen cyan `#22d3ee` yang
dipakai hemat (CTA, fokus, indikator aktif), tipografi sistem 13–14px dengan density
rapat tapi tetap bernapas. Widget Copilot bukan "chatbot lucu" — ia adalah asisten data
di dalam tool kerja: bubble, panel, dan kartu approval-nya mengikuti bahasa visual
panel admin (border hairline, radius 12–16, shadow lembut, tanpa gradasi norak, tanpa
animasi dekoratif permanen). Referensi kelas: Cloudflare / Supabase / Vercel dashboards.

Karena Copilot berdiri di atas data pelanggan, kepercayaan adalah bahasa desainnya:
setiap jawaban menampilkan sumber, setiap aksi tulis lewat kartu approval yang eksplisit
(tombol putus-putus, bukan autofire), dan setiap state non-ideal (error, onboarding,
kosong, loading) punya tampilan tetap — bukan teks polos yang mengambang. Dark adalah
tema default produk; tema light tersedia penuh di token untuk host berlatar terang,
dengan nilai foreground/semantic yang dihitung ulang (bukan palet gelap yang dibalik).

## 2. Prinsip

1. **Satu aksen.** Cyan `#22d3ee` untuk CTA/fokus/aktif. Warna lain hanya semantik
   (success/warn/danger). Tidak ada aksen kedua, tidak ada gradasi teks.
2. **Dark-first, light-lengkap.** Default dark (grx.css dark-only); light theme di
   token, nilai dihitung ulang untuk kontras AA, bukan inversi mentah.
3. **Enterprise density.** Font 13–14px, spacing skala 4–32, panel 360×520. Rapat,
   tapi cukup ruang bernapas (padding kartu ≥ 12px).
4. **Kepercayaan di atas surface.** Sources selalu tampil; aksi tulis butuh approval
   eksplisit; error jelas dan bisa di-retry.
5. **Tanpa AI-slop.** Tidak ada gradasi teks, neon halo, animasi dekoratif permanen,
   em-dash di UI copy, atau angka palsu.
6. **Data nyata.** Tidak ada placeholder palsu di empty state — selalu CTA nyata.

## 3. Do / Don't

| Do | Don't |
|---|---|
| Cyan hanya untuk CTA, fokus, state aktif | Cyan untuk teks paragraf atau badge sekunder |
| Teks utama `fg.primary` di atas `bg.surface` | Teks abu `muted` untuk kalimat yang wajib dibaca |
| Radius `md` 12 (bubble/input), `lg` 16 (panel), `full` (chip/pill) | Radius campur aduk per elemen |
| Shadow `overlay` hanya untuk panel/bubble mengambang | Shadow di setiap kartu statis |
| Motion 120–320ms `cubic-bezier(0.16,1,0.3,1)`, hormati `prefers-reduced-motion` | Animasi loop dekoratif |
| Ikon SVG konsisten 16–18px | Emoji sebagai ikon fungsional |
| Label aksi konkret ("Terapkan perubahan") | Label ambigu ("OK", "Lanjut") untuk aksi tulis |

## 4. Mapping tokens

Sumber: `src/widget/design-tokens.js` → `default export` (dark), `tokens.light`,
`themes.dark|light` (komponen-style map siap spread ke `style` React).

| Token path | Nilai dark | Nilai light | Dipakai untuk |
|---|---|---|---|
| `color.bg.canvas` | `#06080b` | `#f5f8fa` | latar panel paling dalam |
| `color.bg.surface` | `#11161d` | `#ffffff` | header, kartu, bubble asisten |
| `color.bg.sunken` | `#0b0f14` | `#e7edf2` | input/composer well |
| `color.fg.primary` | `#e8eef5` | `#0f1720` | teks utama |
| `color.fg.secondary` | `#93a1b1` | `#46586c` | teks pendukung, label |
| `color.fg.muted` | `#7c8b9b`* | `#5b6b7c` | placeholder, timestamp |
| `color.accent.base` | `#22d3ee` | `#22d3ee` | CTA, bubble, fokus |
| `color.accent.hover/active` | `#67e8f9` / `#0e7490` | `#0aa8c4` / `#0e7490` | state CTA |
| `color.accent.onAccent` | `#04141a` | `#04141a` | teks di atas cyan (10.4:1) |
| `color.accent.asText` | `#22d3ee` | `#0e7490` | teks link/aksen di surface |
| `color.success/warn/danger` | `#34d399` / `#fbbf24` / `#f87171` | `#0d7a4f` / `#92510a` / `#c02b2b` | semantik (asText versi teks) |
| `color.border.subtle/strong` | `#1a212b` / `#33404f` | `#eef2f6` / `#c6d2dc` | hairline / input border |
| `typography.size` | 12/13/14/16/20/24 | sama | xs/sm/md/lg/xl/xxl |
| `typography.weight` | 400/500/600/700 | sama | regular/medium/semibold/bold |
| `typography.lineHeight` | 1.25/1.45/1.6 | sama | tight/normal/relaxed |
| `spacing` | 4/8/12/16/20/24/32 | sama | xs–xxxl |
| `radius` | 8/12/16/full | sama | sm/md/lg/full |
| `shadow` | overlay/panel/subtle | versi lebih ringan | panel mengambang/kartu |
| `motion.duration` | 120/160/220/320 ms | sama | instant/fast/normal/slow |
| `motion.easing` | `cubic-bezier(0.16,1,0.3,1)` | sama | semua transisi |
| `focus.ring` | `0 0 0 2px void, 0 0 0 4px cyan55%` | `0 0 0 2px putih, 0 0 0 4px teal55%` | semua elemen fokus |
| `zIndex` | bubble 9999 → toast 10200 | sama | stacking widget |

\* `#7c8b9b` disengaja berbeda dari `--grx-ink-faint #5c6975` grx.css: nilai asli hanya
3.2:1 di atas `steel-1`, di bawah AA 4.5:1. Token memakai versi yang lolos AA.

Komponen (`themes.dark`, style object React inline): `bubble`, `panel`, `header`,
`message-user`, `message-assistant`, `composer`, `button-primary` (+`-hover/-active/
-disabled`), `button-ghost` (+`-hover`), `input` (+`-focus/-placeholder`),
`approval-card` (+`-actions`), `suggestion-chip` (+`-hover`).

## 5. Acceptance criteria visual per komponen

**Bubble (launcher).** Bulat 58×58, `radius.full`, latar `accent.base`, ikon/glyph
`onAccent`, shadow `overlay`. Hover: naik 2px + latar `accent.hover`. Label `aria-label`
selalu ada; fokus keyboard memperlihatkan `focus.ring`. Posisi kanan-bawah, draggable,
tidak pernah menutupi konten kritis (min offset 8px dari tepi).

**Panel.** 360×520 (responsive `min(360px, 100vw-32)`), latar `bg.canvas`, border
`border.strong` 1px, radius `lg` 16, shadow `overlay`, `role="dialog"` + `aria-label`.
Header `bg.surface` dengan border bawah `subtle`; tombol tutup bergaya ghost dan bisa
dijangkau keyboard; Escape menutup panel dan mengembalikan fokus ke bubble.

**Onboarding (first-use setup).** Bagian di dalam panel, bukan modal terpisah. Judul
20px semibold, body 13px `fg.secondary`, checklist checkbox nyata; status server
dirender sebagai `role="status"` dengan warna semantik (`success`/`danger`) — bukan
teks polos. Tombol "Selesai" disabled sampai checklist tercentang. Health gagal =
kartu danger dengan langkah perbaikan, bukan pesan error mentah.

**Approval card (proposal tulis).** Kartu di bawah bubble asisten: latar `bg.surface`,
border `accent.active` 1px + left-edge 3px `accent.base`, radius `md`. Teks proposal
12px, tombol aksi primary + tombol ghost batal berdampingan (`approval-card-actions`).
Sudah diterapkan: tombol disabled + label berubah ("Terkirim"). Tidak pernah autofire;
tanpa konfirmasi tambahan di luar tombol eksplisit.

**Error state.** Bubble/blok `role="alert"`, latar `danger.soft`, border kiri 3px
`danger.base`, teks `danger.asText` (≥ 4.5:1 di semua tema) + pesan perbaikan singkat.
Tetap di dalam alur chat (bukan modal). Ada jalan retry (kirim ulang) tanpa kehilangan
pesan user.

**Empty state.** Welcome message `fg.secondary` 13px + 2–3 `suggestion-chip` berisi
pertanyaan nyata yang bisa diklik (mengisi composer dan mengirim). Tidak ada ilustrasi
kosong generik; chip hilang otomatis setelah pesan pertama.

**Loading/busy.** Teks "Mengambil data…" `fg.muted` + input & tombol kirim disabled
(opacity 0.55). Indikator tidak menggeser layout; `aria-live="polite"`.

## 6. i18n

- Default **Indonesia** ("Kirim", "Tutup Copilot", "Tanyakan sesuatu tentang data
  Anda…", "Terapkan perubahan"). Label `aria-label` ikut ID.
- **EN tersedia**: semua string UI harus dilewatkan sebagai props/strings agar host
  bisa meng-inject terjemahan (pola `title`/`placeholder`/`welcomeMessage` yang sudah
  ada di `CopilotChat.jsx`); jangan hardcode label baru di dalam komponen.
- Interpolasi aman: konten dinamis lewat text node (bukan `innerHTML`), konsisten
  dengan `escapeHtml` yang ada.

## 7. A11y (WCAG 2.1 AA)

- **Kontras**: teks utama ≥ 7:1, teks sekunder ≥ 4.5:1, `fg.muted` hanya untuk
  placeholder/timestamp dan tetap ≥ 4.5:1 (dark `#7c8b9b`, light `#5b6b7c`). Teks di
  atas cyan selalu `onAccent #04141a` (10.4:1). Tidak ada warna teks utama di bawah
  4.5:1 pada latar mana pun.
- **Focus visible**: setiap elemen interaktif memperlihatkan `focus.ring` (2px gap +
  4px cyan/teal 55%) — jangan pernah `outline: none` tanpa pengganti.
- **Keyboard**: seluruh alur bisa dijalankan tanpa mouse — Tab ke bubble → Enter buka →
  fokus masuk ke input → Enter kirim → Escape tutup → fokus kembali ke bubble. Panel
  `role="dialog"`, live region `aria-live="polite"` untuk status/error.
- **Motion**: semua transisi ≤ 320ms dan hormati `prefers-reduced-motion: reduce`
  (turun ke instant/0).
- **Touch target**: bubble 58px, tombol ≥ 40px tinggi efektif.

## 8. Verifikasi

- `node --check src/widget/design-tokens.js` → lulus (sintaks ESM valid, `type: module`).
- Kontras dihitung per pasangan (relative luminance WCAG): 27/27 pasangan utama
  dark+light ≥ 4.5:1 setelah `fg.muted` dinaikkan dari `#5c6975` ke `#7c8b9b`.
