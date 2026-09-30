# Decision Log — gRouter Copilot

## Locked decisions

### D-001 — Plugin, bukan platform
**Accepted.** gRouter Copilot adalah plugin/module yang di-install ke aplikasi customer, bukan platform SaaS multi-tenant.

### D-002 — Self-contained key
**Accepted.** API key gRouter disimpan di `.env` customer. Tidak ada backend Copilot wajib di v1.

### D-003 — Developer-defined skills
**Accepted.** Developer mengekspos data lewat `run()`. Tidak ada auto-scan penuh DB di v1.

### D-004 — Read-only default
**Accepted.** v1 skill read-only. Mutasi = gate terpisah (confirmation + audit + idempotency).

### D-005 — Node.js/Next.js first
**Accepted.** Bahasa pertama Node.js/Next.js. Java/Python setelah protokol skill stabil.

### D-006 — In-process runtime
**Accepted.** Runtime berjalan di dalam app customer (API route). Satu-satunya panggilan keluar = gRouter.

### D-007 — gRouter = supplier, bukan bagian Copilot
**Accepted.** gRouter existing (port 20128) tidak disentuh; dipanggil lewat adapter yang stabil.

## Proposed (perlu konfirmasi saat implementasi)

- auto-discovery terbatas sebagai helper (bukan default);
- optional Copilot backend (telemetry/provisioning) — hanya jika diperlukan nanti;
- session history (lokal vs in-memory).

## Rejected (v1)

- backend Copilot wajib;
- auto-scan seluruh DB;
- mutating skills;
- fine-tuning;
- multi-bahasa dari awal;
- marketplace plugin publik.
