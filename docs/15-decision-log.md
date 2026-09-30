# Decision Log — gRouter Copilot

## Locked decisions

### D-001 — Plugin, bukan platform SaaS
**Accepted.** gRouter Copilot adalah plugin/module yang di-install ke aplikasi customer.

### D-002 — Self-contained key
**Accepted (updated by D-008).** API key gRouter disimpan di `.env` customer. Data aplikasi tetap self-contained; yang berubah: plugin menambah license gate.

### D-003 — Developer-defined skills
**Accepted.** Developer mengekspos data lewat `run()`. Tidak ada auto-scan penuh DB.

### D-004 — Read-only default
**Accepted.** v1 skill read-only. Mutasi = gate terpisah.

### D-005 — Node.js/Next.js first
**Accepted.** Java/Python setelah protokol stabil.

### D-006 — In-process runtime
**Accepted.** Runtime di dalam app customer. Satu-satunya panggilan keluar = gRouter (AI) + license server (validasi/heartbeat).

### D-007 — gRouter = supplier, READ-ONLY
**Accepted.** gRouter existing (port 20128) TIDAK disentuh sama sekali — tidak ada perubahan code. Hanya konsumsi API key.

### D-008 — License-based (NOT open-source)
**Accepted.** Produk terkunci license. Dua properti license:
1. **Lock install/run:** tanpa license valid, Copilot menolak jalan (offline Ed25519 signature).
2. **Lock ke gRouter:** hanya menerima API key gRouter (base-url + key disimpan saat install).

### D-009 — Backend Copilot (license server + admin dashboard)
**Accepted.** License + dashboard memaksa backend Copilot terpisah dari gRouter. Backend ini mengelola: mint/revoke license, hitung install, telemetri penggunaan.

## Install flow (D-008/D-009)

```text
npx @grouter/copilot install
  → input base-url (gRouter API)
  → input api-key (gRouter)
  → input license (signed token)
  → simpan ke .env
  → runtime verifikasi license (offline) sebelum chat
  → phone-home ke license server (best-effort) untuk counting + revoke
```

## Proposed (perlu konfirmasi)

- **License validation mode:** offline-only vs hybrid (offline + online heartbeat). Rekomendasi: hybrid.
- **Install lock scope:** runtime gate (package publik, tapi nolak jalan tanpa license) vs private npm registry.
- **Dashboard scope:** MVP (license list + install count) vs penuh (per-project telemetri, revoke, billing).

## Rejected (v1)

- backend Copilot yang menyimpan data aplikasi;
- auto-scan seluruh DB;
- mutating skills;
- fine-tuning;
- multi-bahasa dari awal;
- marketplace plugin publik;
- open-source.
