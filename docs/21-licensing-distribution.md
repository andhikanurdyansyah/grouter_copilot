# Licensing & Distribution — gRouter Copilot

## Model

gRouter Copilot is **license-based, not open-source**. Customer holds ONE credential: a **license key**. The gRouter api key is bundled behind the license and resolved server-side.

## Customer flow

```text
Landing (copilot.grouter.id) → Register → Dashboard → Purchase license (quota) → LICENSE KEY → install
```

## Two locks

### Lock 1 — Run lock (license)

- License = Ed25519-signed token. Plugin verifies offline.
- Without a valid license, Copilot throws `SCOPE_DENIED`.

### Lock 2 — Provider lock (gRouter only)

- Base URL + API key fixed to gRouter, resolved from the license (server-side).

## License token vs api key (critical separation)

| | License token (customer holds) | gRouter api key (secret) |
|---|---|---|
| Contents | entitlement: licenseId, quota, features | raw credential |
| Stored | customer `.env` | Copilot backend (secret) |
| Embedded in token? | — | **NEVER** |

The token is **signed (integrity), not encrypted** — its payload is readable. Embedding the api key would expose it to anyone who decodes the token.

## Api key resolution

> **SUPERSEDED by D-021 (2026-10-08):** pola "Option A: key handoff" di bawah adalah pola LAMA
> (per-customer key). Arsitektur target kini = **SATU service credential di Copilot backend**;
> per-customer gRouter api key DITOLAK untuk MVP (lihat `docs/15-decision-log.md` D-021 dan
> `docs/04-solution-architecture.md` §3). Teks lama dipertahankan sebagai catatan historis.

```text
plugin install
  → send license key (TLS)
  → backend validate signature + quota
  → backend return bound gRouter api key
  → plugin write to customer .env (server-only)
  → plugin calls gRouter directly
```

- Customer never types an api key.
- App keeps working if license server is down (consistent with hybrid offline design).

**Target (D-021):** installer menukar license dengan `licensePublicKey` + `baseUrl` saja —
TANPA provider key. Semua pemanggilan gRouter dilakukan Copilot backend memakai satu service
credential; host app customer tidak pernah memegang kredensial provider.

## Install flow

```text
npx @grouter/copilot install
  → prompt: LICENSE KEY
  → (server-side) resolve licensePublicKey + baseUrl (target D-021: tanpa api key)
  → write .env
  → done
```

## Usage / quota

Dua dimensi akuntansi yang BERBEDA (jangan dicampur):

1. **Copilot customer usage** (per license): entitlement Copilot — unit ditetapkan Copilot
   (request/token/credit), diukur usage ledger Copilot. Quota customer = batas PEMAKAIAN
   customer, bukan infra.
2. **gRouter infrastructure usage** (per service credential): dibaca read-only via
   `GET /check-usage?key=…`. Angka ini mencakup trafik SEMUA customer Copilot — TIDAK boleh
   ditampilkan seolah itu kuota satu customer.

Dashboard render keduanya dengan label yang jelas dan terpisah.

## Auto-provisioning (REJECTED for MVP by D-021)

"purchase license → auto-generate gRouter api key per customer" tidak dibutuhkan dan ditolak
untuk MVP — Copilot memakai SATU service credential (D-021). Auto-provisioning per-customer
(D-016) tetap deferred dan hanya relevan jika arsitektur berubah (lihat future evolution di
`docs/04-solution-architecture.md` §10).

## Admin dashboard

- license list + install count;
- issue/revoke license;
- per-license usage/quota (from gRouter `/check-usage`).

## Design decisions locked

1. Validation: hybrid (offline + best-effort online).
2. Install lock: runtime gate (public package, refuses to run without license).
3. Api key delivery: Option A (handoff), not Option B (proxy).
4. Auto-provisioning: deferred.
