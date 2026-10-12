# Commercial Model — gRouter Copilot

## 1. Positioning

gRouter Copilot dijual sebagai **plugin/module** yang menambah AI copilot ke aplikasi yang sudah ada. gRouter existing = supplier AI (usage). Copilot = nilai integrasi + skill layer.

## 2. Distribusi

- npm registry (`@grouter/copilot`);
- dokumentasi + contoh (CRM/POS);
- GitHub + landing page.

## 3. Packaging (hypothesis)

| Tier | Isi |
|---|---|
| Free core | install, skills read-only, 1 key gRouter, chat widget |
| Pro | advanced skills, observasi, multi-model, budget/limits, dukungan |
| Enterprise | mutating skills (gated), kustomisasi, multi-bahasa, support SLA |

## 4. Pricing hypotheses (belum final)

- Free untuk adopsi;
- Pro: per-app / per-seat subscription;
- Enterprise: kontrak tahunan;
- AI usage lewat gRouter (supplier) — terpisah dari nilai Copilot.

## 5. Unit economics questions

- skill call per answer;
- context size;
- cache hit;
- cost per task (dari gRouter);
- support cost per install;
- churn reduction.

## 6. Guardrails

- hard budget + soft warning;
- rate limit;
- no surprise pass-through;
- jelas saat quota habis.

## 7. Monetization timing

Jangan blokir adopsi dengan paywall terlalu awal. Bebaskan install + proof-of-value dulu, monetize di Pro/Enterprise setelah retensi terbukti.


---

## Rekonsiliasi implementasi aktual (2026-10-12)

Model yang **sudah live di produksi** (store.json `settings.plans`, SSOT
server-side, A1-safe) berbeda dari hipotesis §3-4 di atas:

| Paket aktif | Harga | Kuota | Masa berlaku | AI |
|---|---|---|---|---|
| `quota-3b-90d` | Rp 10.000 sekali bayar | 3.000.000 token | 90 hari | `ai.enabled=false` |
| `quota-15b-365d` | sekali bayar | 15.000.000 token | 365 hari | `ai.enabled=false` |
| `custom` | dikonfirmasi operator | Custom | 365 hari | — |

- Skema: **lisensi pre-paid per kuota token** (sekali bayar), bukan
  subscription Free/Pro/Enterprise. Hipotesis §3-4 tetap sebagai arah masa
  depan, bukan kondisi sekarang.
- AI quota semantics + entitlement ditentukan plan & lisensi (D-020/D-021);
  harga TIDAK pernah dari browser (A1, cost-integrity.test.js).
- Unit economics §5: sumber data nyata tersedia via usage ledger
  (`/api/me` usage, admin ledger) — perlu agregasi sebelum dipakai pricing.

*Dokumen ini TIDAK mengubah harga produksi. Perubahan harga = keputusan PO
terpisah via admin packages.*
