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
Plugin resolves gRouter api key from license (server-side)
        ↓
Chat runs; usage recorded; dashboard shows quota via gRouter /check-usage
```

## Principles

1. **One customer credential = license key.** Customer never manually copies a gRouter api key.
2. **Api key is bundled behind the license**, resolved server-side — never embedded in the token.
3. **Auto-provisioning is DEFERRED** until the flow is finalized. For now: admin maps license → existing gRouter api key manually.

## License token contents (customer-facing)

The license token is a signed claim. It contains entitlement, NOT secrets:

```json
{
  "aud": "grouter-copilot",
  "lic": "lic_xxx",
  "customer": "Acme CRM",
  "features": ["core", "pro"],
  "quota": { "monthlyTokens": 1000000, "tier": "pro" },
  "exp": 1793381856
}
```

**The gRouter api key is NEVER in the token.** The token is signed (integrity), not encrypted — its payload is readable to anyone who holds it.

## Api key resolution (server-side)

```text
Copilot backend holds (secret, server-side):
  licenseId → { gRouterApiKey, quota, status }

Install / runtime handoff (Option A):
  plugin sends license key
    → backend validates signature + quota
    → backend returns the bound gRouter api key (over TLS)
    → plugin stores it in customer .env (server-only)
    → plugin calls gRouter directly
```

### Why Option A (key handoff) over Option B (proxy)

| | Option A: key handoff | Option B: backend proxy |
|---|---|---|
| Customer sees api key | No (auto-materialized) | No |
| App works if license server down | Yes (hybrid offline holds) | No (backend is critical path) |
| Backend load | Only at install + periodic revalidation | Every AI call |
| Consistency with locked hybrid design | ✅ | ❌ |

**Decision: Option A.**

## Install flow (license-first)

```text
npx @grouter/copilot install
  → prompt: LICENSE KEY
  → (server-side) plugin exchanges license → resolves api key
  → writes .env: GROUTER_API_KEY, GROUTER_LICENSE, GROUTER_BASE_URL, GROUTER_LICENSE_SERVER
  → done; customer never typed an api key
```

## Usage / quota monitoring

Copilot dashboard shows per-license usage/quota by consuming gRouter `/check-usage`:

```text
Copilot backend
  → for each license, resolve bound api key
  → call gRouter /check-usage (read-only)
  → cache + aggregate
  → dashboard renders quota consumption per license
```

This is read-only consumption of gRouter (consistent with the "read-only" boundary). No gRouter code/database is touched.

## Deferred (do NOT build yet)

- **Auto-provisioning:** on license purchase, Copilot backend auto-generates a gRouter api key. Deferred until the purchase → gRouter provisioning contract is clear.
- For now: admin maps license → existing gRouter api key manually.

## Open questions (to lock before building)

1. Exact gRouter api key generation endpoint (for future auto-provisioning).
2. Exact gRouter `/check-usage` request/response contract (for quota display).
3. Quota semantics: token-based, request-based, or both.
4. Registration/auth mechanism (email+password, OAuth, magic link).
5. Whether license server and dashboard share one deployment or separate.
