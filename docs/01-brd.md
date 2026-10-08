# Business Requirements Document — gRouter Copilot

## 1. Executive summary

gRouter Copilot adalah **plugin/module** yang dijual ke developer aplikasi bisnis agar mereka bisa menambah AI copilot ke aplikasi yang sudah ada dalam hitungan menit. Ini produk terpisah dari gRouter existing; gRouter berperan sebagai supplier AI (API key + model).

## 2. Stakeholders

| Stakeholder | Need | Risk if ignored |
|---|---|---|
| Developer (integrator) | Install cepat, dokumentasi jelas | Gagal adopsi |
| Aplikasi vendor | Fitur AI tanpa infrastruktur sendiri | Tidak ada alasan bayar |
| End user aplikasi | Jawaban berguna & aman | Tidak dipakai |
| gRouter (supplier) | Konsumsi API terprediksi | Beban tidak terkontrol |

## 3. Business model hypothesis

Distribusi via npm/package registry. Monetisasi bertingkat:

- **Free core:** install + skills dasar + 1 key gRouter.
- **Pro:** advanced skills, observability, multi-model, dukungan.
- **Enterprise:** kustomisasi, support SLA, mutating skills dengan kontrol, multi-bahasa.

gRouter existing menyediakan AI usage; Copilot menambah nilai integrasi dan skill layer.

## 4. Business requirements

| ID | Requirement | Priority |
|---|---|---|
| BR-01 | Developer bisa install plugin lewat satu command | P0 |
| BR-02 | Plugin detect framework & generate scaffold | P0 |
| BR-03 | Developer expose data lewat skill | P0 |
| BR-04 | Chatbot menjawab dari data aplikasi | P0 |
| BR-05 | AI consume gRouter via SATU service credential di Copilot backend (D-021) — kredensial tidak pernah di app customer | P0 |
| BR-06 | Key gRouter tidak pernah ke browser | P0 |
| BR-07 | Read-only default; mutasi butuh kontrol terpisah | P0 |
| BR-08 | Tidak ada backend Copilot wajib di v1 | P0 |
| BR-09 | Protokol skill & chat stabil untuk port ke bahasa lain | P1 |
| BR-10 | Dokumentasi + contoh (CRM/POS) | P1 |

## 5. Business non-functional requirements

- Instalasi tidak mengubah database customer.
- Tidak ada migration paksa.
- Key gRouter tersimpan lokal, bukan central.
- Versi package mengikuti semver; breaking change = major bump.
- Error handling jelas (gRouter down, skill gagal, scope ditolak).

## 6. Business acceptance

v0.1 diterima ketika developer Node.js/Next.js bisa install, tulis 1 skill, dan end user mendapat jawaban bersumber dari data aplikasi, tanpa key gRouter bocor dan tanpa backend Copilot *(catatan rekonsiliasi I5: berlaku untuk RUNTIME plugin; backend Copilot kini ada sebagai license authority + pembayaran + dashboard per D-009)*.
