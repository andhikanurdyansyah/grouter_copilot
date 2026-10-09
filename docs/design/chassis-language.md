# Design Language Inventory & Adoption (2026-10-08, f362f44)

## Sumber identitas (protected, tidak diubah)
`server/public/landing.html` + `intro.html` — checksum `/tmp/protected_v3.sha256` 7/7 sebelum & sesudah.

## Chassis tokens (replikasi ke `frontend/src/styles/theme.css` .dark + index.css)
- Surfaces: bg #0f0f11 · card #18181b · popover/well #131315 · secondary #202023
- Borders: #27272a (utama) · #3f3f46 (tebal) · white/5 (kartu landing)
- Well recessed: `shadow-[inset_0_2px_4px_0_rgba(0,0,0,0.6)]` → utility `chassis-well`
- Accent: cyan-400/500 (`#7ed6f3` primary token) · emerald=ok · amber=warning · red=danger
- Type: Inter (UI) + JetBrains Mono (data/label); label micro = 10px mono uppercase tracking-widest → utility `label-mono`
- Headings: font-medium tracking-tight (bukan bold)

## Keputusan
1. Console default DARK (identitas brand = dark chassis). Light theme tetap tersedia via toggle.
2. `chassis-well` & `label-mono` = utilities reusable; scrollbar + selection di-theme (craft-floor: browser surfaces).
3. Settings page = read-only control surface (backend hanya expose baca) — tidak mengarang kontrol edit.
4. Paket tanpa harga (amount 0) ≠ gratis → badge "harga menyusul" + CTA daftar; key `custom` = jalur sales by design. Tidak ada Rp0 sebagai harga.
5. Fixtures harga (Rp 250k/890k) hanya via route-intercept QA (Playwright), tidak pernah masuk runtime produksi.

## Pemakaian shadcn-admin
Layout proporsi (sidebar collapsed→w-(--sidebar-width), content max-w), Dialog/AlertDialog/Sonner, data table density, form composition — sesuai template asli; bukan sekadar sidebar gelap.
