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
