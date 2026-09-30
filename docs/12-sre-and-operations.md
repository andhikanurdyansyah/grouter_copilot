# SRE & Operations — gRouter Copilot

## 1. Scope operasional

Karena self-contained, operasional Copilot = operasional **di dalam aplikasi customer**. Copilot tidak menjalankan service sendiri di v1.

## 2. Dependency: gRouter API

Copilot bergantung pada gRouter API sebagai supplier AI.

| Aspek | Target (hypothesis) |
|---|---|
| Timeout | bounded, configurable |
| Retry | terbatas, hanya idempotent read |
| Fallback | status `upstream_unavailable`, bukan jawaban palsu |
| Streaming | cancel propagasi |
| Rate limit | patuhi limit gRouter, jangan unbounded queue |

## 3. Observability (local)

- log terstruktur + redacted;
- metrics: request, latency, token, error, skill usage;
- trace: requestId → skill → gRouter call;
- TIDAK log: key, data aplikasi, raw prompt/content (default).

## 4. Failure behavior

| Kondisi | Behavior |
|---|---|
| skill gagal | error state, requestId, retry jujur |
| gRouter down | `upstream_unavailable`, retry terbatas |
| timeout | cancel + error |
| skill not found | klarifikasi |
| scope deny | `blocked`, tanpa bocorkan data |

## 5. Kill switches (developer)

- disable skill di config;
- disable model/feature;
- set budget/limit;
- revoke key gRouter (di gRouter).

## 6. No Copilot incident scope

Karena Copilot tidak menyentuh gRouter existing, insiden Copilot = insiden di app customer. gRouter existing hanya supplier; Copilot tidak mengubahnya.

## 7. Support

Developer support berfokus: install gagal, skill error, adapter error, key config. Support tidak boleh meminta/menampilkan key gRouter plaintext.
