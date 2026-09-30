# Decision Log — gRouter Copilot

## Locked decisions

### D-001 — Plugin, bukan platform SaaS
**Accepted.** gRouter Copilot adalah plugin/module yang di-install ke aplikasi customer.

### D-002 — Self-contained key (data tetap di customer)
**Accepted.** Data aplikasi tetap self-contained di app customer.

### D-003 — Developer-defined skills
**Accepted.** Developer mengekspos data lewat `run()`.

### D-004 — Read-only default
**Accepted.** Mutasi = gate terpisah.

### D-005 — Node.js/Next.js first
**Accepted.** Java/Python setelah protokol stabil.

### D-006 — In-process runtime
**Accepted.** Runtime di app customer.

### D-007 — gRouter = supplier, READ-ONLY
**Accepted.** gRouter existing (port 20128) TIDAK disentuh. Hanya konsumsi API key + `/check-usage` (read-only).

### D-008 — License-based (NOT open-source)
**Accepted.** Runtime menolak jalan tanpa license valid.

### D-009 — Backend Copilot (license server + dashboard)
**Accepted.** Terpisah dari gRouter: mint/revoke license, hitung install, dashboard admin.

### D-010 — License validation: HYBRID
**Accepted.** Offline signature + best-effort online heartbeat.

### D-011 — Install lock: runtime gate
**Accepted.** Package publik, runtime nolak jalan tanpa license.

### D-012 — Dashboard MVP scope: minimal
**Accepted.** License list + install count + issue/revoke.

### D-013 — Customer flow: register → purchase → license → install
**Accepted.** Landing page (copilot.grouter.id) → register → dashboard → purchase license (include quota) → dapat LICENSE KEY → install.

### D-014 — ONE credential = license key
**Accepted.** Customer tidak memegang api key gRouter secara manual. Api key di-resolve server-side dari license.

### D-015 — Api key TIDAK di-embed di token license
**Accepted.** Token license berisi entitlement (licenseId, quota, features), BUKAN api key. Api key disimpan di backend (secret) + di-handoff ke plugin saat install (Option A: key handoff).

### D-016 — Auto-provisioning DEFERRED
**Accepted.** Jangan wire auto-generate api key gRouter saat purchase sampai flow + kontrak endpoint gRouter jelas. Untuk sekarang: admin map license → existing api key manual.

## Customer flow

```text
Landing → Register → Dashboard → Purchase license (quota) → LICENSE KEY → install → chat
```

## Api key resolution (Option A)

```text
plugin install → kirim license → backend validate → resolve api key → simpan .env customer → panggil gRouter langsung
```

## Usage/quota

Copilot backend consume gRouter `/check-usage` (read-only) per license → tampil di dashboard.

## Open questions (lock before building)

- gRouter api key generation endpoint (future auto-provision).
- gRouter `/check-usage` contract.
- quota semantics.
- registration/auth mechanism.
- license server + dashboard deployment shape.

## Rejected (v1)

- backend Copilot menyimpan data aplikasi;
- auto-scan DB;
- fine-tuning;
- marketplace publik;
- open-source;
- validasi online-only;
- embed api key di token license.
