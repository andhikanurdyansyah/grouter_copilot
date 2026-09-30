# Licensing & Distribution — gRouter Copilot

## Model

gRouter Copilot is **license-based, not open-source**. The plugin is installed via npm, but refuses to run without a valid license, and is locked to the gRouter AI service.

## Two locks

### Lock 1 — Run lock (license)

- License = Ed25519-signed token (JWT-style).
- Plugin embeds only the PUBLIC key; license server holds the PRIVATE key.
- Verification is offline: a valid license proves it was issued by us and cannot be forged client-side.
- Without a valid license, Copilot throws `SCOPE_DENIED` and refuses to serve chat.

### Lock 2 — Provider lock (gRouter only)

- Base URL + API key are fixed to gRouter at install time.
- The adapter does not accept arbitrary provider keys or URLs.

## Install flow

```text
npx @grouter/copilot install
  --base-url      https://api.grouter.io        (gRouter AI endpoint)
  --api-key       sk-...                        (gRouter key)
  --license       <signed-token>                (issued license)
  --license-server https://license.grouter.io    (revoke/count)
```

Stored in `.env` (server-only). The widget/browser never receives the API key or license.

## License server (Copilot backend)

A separate service from gRouter (port 20128 is untouched). Responsibilities:

- mint license (on purchase/entitlement);
- revoke license;
- validate heartbeat / count active installs;
- report to admin dashboard.

## Admin dashboard

Purpose: see how many customers/installs use gRouter Copilot, manage licenses (issue/revoke), and observe usage.

## Design decisions to confirm

1. **Validation mode** — offline-only vs hybrid (offline + best-effort online heartbeat). Recommended: hybrid so apps keep working if the license server is briefly down, while still enabling revocation + counting.
2. **Install lock scope** — runtime gate on a public npm package (installable but refuses to run) vs a private npm registry (can't install at all). Recommended: runtime gate first, private registry later if needed.
3. **Dashboard MVP scope** — license list + install count first, then per-project telemetry, revocation, and billing.
