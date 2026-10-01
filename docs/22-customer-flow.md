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
| Usage resolution (gRouter /check-usage) | ✅ `server/src/usageResolver.js` + `GET /api/admin/usage` |
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

`GET /api/admin/usage` → for each bound license, consume gRouter `/check-usage` (read-only), cache, aggregate.

Contract documented in `docs/23-grouter-api-contract.md`.

## Deferred (do NOT build yet)

- **Auto-provisioning:** on license purchase, auto-generate gRouter api key. Deferred until the gRouter provisioning contract is clear.
- Admin maps license → existing gRouter api key manually (via `POST /api/admin/licenses/:id/bind`).

## Open questions (semua sudah terjawab — diperbarui I5, 2026-10-01)

1. ~~gRouter api key generation endpoint (future auto-provision).~~ → DEFERRED (D-016); admin bind manual.
2. ~~Registration/auth mechanism.~~ → Better Auth email/password + Google OAuth kondisional (D-019), organization plugin.
3. ~~Payment flow.~~ → KlikQRIS end-to-end LIVE (sandbox): checkout `{packageKey}` (harga server-side, A1) → QR → webhook terverifikasi/admin settle → license (D-018, doc 26).
4. ~~License server + dashboard deployment (single vs separate).~~ → SINGLE public origin `copilot.grouter.id`; frontend :4601 proxy `/api/*` → backend :4600 (docs/27).

Status implementasi lengkap per komponen: lihat `docs/25-pending-implementations.md`
(P-001..P-005 sudah ditinjau ulang) dan `docs/29-backend-api-contract.md`.
