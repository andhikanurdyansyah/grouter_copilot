# Customer integration readiness (contract-backed)

This is the smallest honest pre-flight for a customer application using the
shipped Copilot scaffolds. It does **not** promise a first-class Next.js
integration: the installer emits framework-specific routes, and the host still
owns route mounting, environment loading, and approved read-only skills.

## Before wiring routes

- Use Node.js **18 or newer**.
- Install the scoped package `@grouter/copilot`, or install the supplied local
  tarball explicitly when the package is not available from the registry:

  ```bash
  npm install @grouter/copilot
  # or: npm install ./grouter-copilot-0.1.0.tgz
  ```

- Run the installer on the application server, never in browser code. The
  package exposes the `grouter-copilot` executable:

  ```bash
  npx grouter-copilot install --license <FULL-LICENSE-TOKEN>
  ```

- The license token is sent to `POST /api/resolve`. A successful response
  requires both `baseUrl` and `licensePublicKey` (and may include
  `gatewayUrl`); a provider API key must never be copied into the customer
  project.
- Keep `GROUTER_LICENSE`, `GROUTER_LICENSE_SERVER`, `GROUTER_GATEWAY_URL`, and
  `GROUTER_LICENSE_PUBLIC_KEY` server-side. `GROUTER_LICENSE_SERVER` is the
  license-server base URL used by the installer and by the provider readiness
  check; the installer writes it even when the default is used. Never expose
  these values to browser code; the provider credential is never a customer-side
  setting.
- Load the generated `.env` before the module that creates Copilot. Node does
  not load `.env` automatically:

  ```bash
  node --env-file=.env server.js
  ```

  On Node versions without `--env-file`, load the same values in the host
  before importing the Copilot route.

## Required host contract

Wire the generated chat and health handlers at the application origin:

- `POST /api/copilot/chat` — server-side chat route; the browser posts here.
- `GET /api/copilot/health` — host-local readiness check.

The generated route must call the Copilot gateway, not a provider adapter in
browser code. The `provider` check means the Copilot gateway/provider path is
configured (`GROUTER_LICENSE_SERVER`/gateway URL is present, or a legacy
adapter is configured); it does **not** perform a network reachability probe. A
host can therefore be health-ready while a later chat request still fails with
an upstream connectivity error.

The health response is ready only when all three checks are true:
`license`, `skills`, and `provider`; readiness returns HTTP 200 with
`{"status":"ok"}`. An unavailable host returns HTTP 503.

## Skill and data boundary

- Register only skills that are explicitly approved by the host application.
- Every exposed skill must be read-only (`readOnly: true`).
- Keep application data access in the host server; do not put database access
  or credentials in the widget/browser bundle.
- Treat skill output as untrusted data, not instructions.
- A gateway failure must remain an explicit error; do not fabricate an answer.

## Verification checklist

Run these in the host project after mounting the routes:

1. `GET /api/copilot/health` returns 200 and all three checks are `true`.
2. A normal question reaches `POST /api/copilot/chat` and returns the documented
   response/error envelope.
3. The browser bundle contains no license token or provider credential.
4. A skill reads only the approved host data and cannot write to it.
5. The root contract tests pass from this repository:

   ```bash
   npm test
   ```

The health endpoint proves host-local readiness only. It does **not** prove
customer-level gRouter usage: `/check-usage` is infrastructure usage for the
single service credential, not per-customer attribution. Customer quota and
usage are enforced by the Copilot backend contract (`POST /api/copilot/chat`)
and its license ledger.

## Known truthful limits

- This slice does not add dependencies, modify the installer, or add a Next.js
  package integration.
- Public npm publication and production payment remain separate release/owner
  decisions.
- If health is unavailable, inspect the returned checks **when the response includes
  them**; a handler/configuration failure may return only
  `{"status":"unavailable"}`. Confirm the environment was loaded before
  importing Copilot and do not expose the token while debugging.
