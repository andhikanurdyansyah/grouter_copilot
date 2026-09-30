# Copilot Backend — License Server & Admin Dashboard

> Separate from gRouter (port 20128, untouched). This is the license authority for gRouter Copilot.

## Responsibilities

- **Mint licenses** on purchase/entitlement.
- **Revoke licenses** (hard-kill for online phone-home).
- **Record heartbeats** (install counting, last-seen).
- **Serve the admin dashboard** for license/install monitoring.

## Structure

```text
server/
  src/store.js           → JSON file storage (zero dependency)
  src/licenseService.js  → issue/revoke/validate
  src/server.js          → http server + API + dashboard render
  src/index.js           → entry point (node src/index.js)
  public/dashboard.html  → admin dashboard (gRouter design system)
  test/server.test.js    → 5 integration tests
```

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/stats` | none | aggregate counts |
| GET | `/api/licenses` | none | list (no raw tokens) |
| POST | `/api/licenses` | admin (Bearer) | issue license, returns token ONCE |
| POST | `/api/licenses/:id/revoke` | admin (Bearer) | revoke |
| POST | `/api/heartbeat` | license token | validate + record install |

## License model

- Ed25519 asymmetric: private key on server, public key compiled into the plugin.
- Offline validation in the plugin (no server dependency for normal use).
- Best-effort online heartbeat for revocation + counting.

## Run

```bash
cd server
node src/index.js                 # default port 4600
PORT=5100 node src/index.js      # custom port
ADMIN_TOKEN=secret node src/index.js  # enable admin auth for issue/revoke
```

## Keys (production)

- Persist the keypair: set `LICENSE_PRIVATE_KEY_PEM` (server) and compile the public key into the plugin via `GROUTER_LICENSE_PUBLIC_KEY`.
- Never ship the private key in the plugin package.

## Security notes

- Issue/revoke require `ADMIN_TOKEN` (Bearer) in production.
- Raw license tokens are returned once at issue, never persisted or listed.
- Heartbeat validates the signed license and blocks revoked licenses (403).
