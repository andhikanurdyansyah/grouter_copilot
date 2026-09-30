# Decision Log — gRouter Copilot

## Locked decisions

### D-001 — Plugin, bukan platform SaaS
**Accepted.** gRouter Copilot adalah plugin/module yang di-install ke aplikasi customer.

### D-002 — Self-contained key (data tetap di customer)
**Accepted.** API key gRouter di `.env` customer. Data aplikasi tetap self-contained.

### D-003 — Developer-defined skills
**Accepted.** Developer mengekspos data lewat `run()`.

### D-004 — Read-only default
**Accepted.** Mutasi = gate terpisah.

### D-005 — Node.js/Next.js first
**Accepted.** Java/Python setelah protokol stabil.

### D-006 — In-process runtime
**Accepted.** Runtime di app customer. Panggilan keluar: gRouter (AI) + license server (heartbeat).

### D-007 — gRouter = supplier, READ-ONLY
**Accepted.** gRouter existing (port 20128) TIDAK disentuh. Hanya konsumsi API key.

### D-008 — License-based (NOT open-source)
**Accepted.** Runtime menolak jalan tanpa license valid (offline Ed25519 signature), dan hanya menerima API key gRouter.

### D-009 — Backend Copilot (license server + admin dashboard)
**Accepted.** Backend terpisah dari gRouter: mint/revoke license, hitung install, dashboard admin.

### D-010 — License validation: HYBRID
**Accepted (rekomendasi).** Offline signature + best-effort online heartbeat (grace period). App tetap jalan walau license server down; revoke + counting tetap jalan saat online.

### D-011 — Install lock: runtime gate
**Accepted (rekomendasi).** Package publik, tapi runtime nolak jalan tanpa license. Private registry ditunda.

### D-012 — Dashboard MVP scope: minimal
**Accepted (rekomendasi).** License list + install count + issue/revoke. Telemetri per-project & billing = fase lanjut.

## Install flow

```text
npx @grouter/copilot install
  --base-url       https://api.grouter.io
  --api-key        sk-...
  --license        <signed-token>
  --license-server https://license.grouter.io
```

## Proposed (fase lanjut)

- per-project telemetry dashboard;
- billing integrasi;
- private npm registry;
- multi-bahasa (Java/Python);
- mutating skills (gate + confirmation + audit).

## Rejected (v1)

- backend Copilot yang menyimpan data aplikasi;
- auto-scan seluruh DB;
- fine-tuning;
- marketplace plugin publik;
- open-source;
- validasi license online-only (membuat app customer dependen pada license server).
