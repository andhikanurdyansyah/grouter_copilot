# A-08 — Kebijakan retensi store & integritas kuota

Status: **DITUTUP** (2026-10-18). Sebelumnya diblokir karena pemangkasan `usage[]`
akan merusak akuntansi kuota.

## Masalah asli

`store.usageTotals(licenseId)` menghitung kuota dengan menjumlahkan **seluruh**
riwayat `usage[]` milik lisensi:

```js
for (const u of this.data.usage) { if (u.licenseId !== licenseId) continue; ... }
```

Konsekuensinya: `usage[]` tidak boleh dipangkas. Kalau diarsipkan, total turun,
kuota terlihat belum terpakai, dan pelanggan otomatis mendapat token gratis.
Retensi store jadi terkunci pada akuntansi kuota — dua hal yang seharusnya
independen.

## Perbaikan

Sumber kebenaran kuota dipindah ke **counter kumulatif per-lisensi**:

```json
"usageCounters": {
  "lic_xxx": { "usedTokens": 158322, "requestCount": 163 }
}
```

- `usageTotals()` membaca counter, bukan memindai riwayat → O(1), tidak
  bergantung pada berapa banyak riwayat yang disimpan.
- Counter diperbarui pada **setiap transisi** status record:
  - `addUsageRecord` → tambah kontribusi baris
  - `updateUsageRecord` → terapkan **selisih** kontribusi sebelum/sesudah
    (bukan nilai absolut), sehingga update berulang tidak double-count
- Kontribusi per status:
  - `ok` → `totalTokens` + 1 request
  - `reserved` → `reservedTokens` (mencegah bypass kuota via request in-flight)
  - `error` / `rejected` → 0 (reservasi dilepas; request gagal tidak pernah ditagih)

## Aturan pemuatan (penting)

| Kondisi store | Perilaku |
|---|---|
| `usageCounters` **tidak ada** (store lama) | Diturunkan sekali dari `usage[]`, lalu dipersist |
| `usageCounters` **ada** | **DIPERCAYA**. TIDAK dihitung ulang dari baris |

Alasan aturan kedua: kalau store memuat ulang dan menghitung ulang dari baris,
maka setelah `usage[]` diarsipkan totalnya kembali 0 — persis defect yang
hendak dicegah. Test `A-08: pruning usage[] does NOT reduce the quota total`
mengunci perilaku ini.

Escape hatch operator: `store.rebuildUsageCounters()` — **hanya** dipakai bila
`usage[]` diketahui lengkap (mis. setelah restore backup penuh). Jangan dipanggil
pada store yang riwayatnya sudah diarsipkan.

## Kebijakan retensi yang kini aman

Karena kuota tidak lagi bergantung pada `usage[]`, riwayat boleh diarsipkan:

1. Arsipkan baris `usage[]` yang lebih tua dari **180 hari** ke file terpisah
   (`data/archive/usage-YYYY.json`), **jangan** dihapus permanen.
2. Jalankan hanya saat backend berhenti, atau lewat prosedur yang menulis store
   secara atomik (`_save` sudah memakai rename + chmod 600).
3. Setelah arsip: verifikasi `usageTotals()` per lisensi **tidak berubah**.
4. Backup store sebelum dan sesudah (`cp store.json backups/store-pre-archive-*.json`).

Kebijakan ini **belum diotomasi** — sengaja. Pemangkasan otomatis pada data
billing adalah tindakan berisiko tinggi yang harus tetap menjadi keputusan
operator eksplisit, bukan efek samping jadwal.

## Bukti

- `server/test/a08-usage-retention.test.js` — 9 test, semuanya lulus.
- Migrasi pada salinan store prod: counter terbentuk `158322` token / `163` request,
  cocok dengan hitungan baris (`MATCH: true`).
- Prod setelah deploy: `usageCounters` ter-persist dengan nilai identik,
  185 baris `usage` utuh, `usageTotals()` mengembalikan angka yang sama.
- Backup pra-migrasi: `/home/ubuntu/backups/store-pre-a08-20261018T161730Z.json`.

## Sisa risiko

- Counter adalah sumber kebenaran tunggal; bila file store hilang total, angka
  kuota hilang bersama arsip. Karena itu arsip wajib disimpan, bukan dibuang.
- Tidak ada rekonsiliasi terjadwal antara counter dan arsip. Bila dicurigai
  drift, bandingkan `usageTotals()` dengan total arsip + baris tersisa secara manual.
