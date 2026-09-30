# Customer Flow — gRouter Copilot

## End-to-end flow

```text
Landing page (copilot.grouter.id)
  → documentation, how-to, integration guide, pricing, license model
        ↓
Register (customer account)
        ↓
Dashboard
  → manage license, purchase, monitor usage/quota
        ↓
Purchase license (include quota/tier)
        ↓
Receive LICENSE KEY (the ONLY customer credential)
        ↓
npx @grouter/copilot install
  → prompted for LICENSE KEY (not api key)
        ↓
Plugin resolves gRouter api key from license (server-side key handoff)
        ↓
Chat runs; usage recorded; dashboard shows quota via gRouter /check-usage
```

## Implemented (done)

| Component | Status |
|---|---|
| License server (issue/revoke/validate) | ✅ `server/src/licenseService.js` |
| Heartbeat (install counting) | ✅ `POST /api/heartbeat` |
| Key handoff (license → api key) | ✅ `POST /api/resolve` + `bind` |
| Usage resolution (gRouter /check-usage) | ✅ `server/src/usageResolver.js` + `GET /api/usage` |
| Admin dashboard | ✅ `server/public/dashboard.html` |
| Landing page | ✅ `server/public/landing.html` (`/landing`) |
| gRouter API contract (verified) | ✅ `docs/23-grouter-api-contract.md` |

## Verified live (2026-09-30)

```text
issue license (bound to real gRouter key)
  → POST /api/resolve  → apiKey prefix gRouter-...
  → UsageResolver.fetchUsage  → { status:active, 353672/15000000 tokens, 115 req, 41 models }
```

## Api key resolution (Option A: key handoff)

```text
plugin install
  → send license key (TLS)
  → backend validate signature + revocation
  → backend return bound gRouter api key
  → plugin write to customer .env (server-only)
  → plugin calls gRouter directly
```

- Customer never types an api key.
- App keeps working if license server is down (hybrid offline).

## Usage / quota (verified)

`GET /api/usage` → for each bound license, consume gRouter `/check-usage` (read-only), cache, aggregate.

Contract documented in `docs/23-grouter-api-contract.md`.

## Deferred (do NOT build yet)

- **Auto-provisioning:** on license purchase, auto-generate gRouter api key. Deferred until the gRouter provisioning contract is clear.
- Admin maps license → existing gRouter api key manually (via `POST /api/licenses/:id/bind`).

## Open questions

1. gRouter api key generation endpoint (future auto-provision).
2. Registration/auth mechanism.
3. Payment flow.
4. License server + dashboard deployment (single vs separate).
