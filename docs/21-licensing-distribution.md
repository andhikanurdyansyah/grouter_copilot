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

## Api key resolution (Option A: key handoff)

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

## Install flow

```text
npx @grouter/copilot install
  → prompt: LICENSE KEY
  → (server-side) resolve api key
  → write .env
  → done
```

## Usage / quota

Copilot dashboard consumes gRouter `/check-usage` (read-only) per license, cache + aggregate, render quota consumption.

## Auto-provisioning (DEFERRED)

Do not wire "purchase license → auto-generate gRouter api key" yet. Admin maps license → existing gRouter api key manually until the gRouter provisioning contract is clear.

## Admin dashboard

- license list + install count;
- issue/revoke license;
- per-license usage/quota (from gRouter `/check-usage`).

## Design decisions locked

1. Validation: hybrid (offline + best-effort online).
2. Install lock: runtime gate (public package, refuses to run without license).
3. Api key delivery: Option A (handoff), not Option B (proxy).
4. Auto-provisioning: deferred.
