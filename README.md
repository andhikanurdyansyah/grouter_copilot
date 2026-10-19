# gRouter Copilot

License-based AI copilot plugin for Node.js apps. Developers control data access through explicitly defined, read-only skills.

## Install & activation

A license must be activated (an existing gRouter provider key bound by an operator) before installation can complete. The package tarball is verified (clean extraction, import smoke, CLI install E2E against a local license server); registry publication is pending publisher credentials, so until `npm publish` happens install from the registry will not resolve. In the host application's server environment, run:

```bash
npx @grouter/copilot install --license <YOUR_COPILOT_LICENSE>
```

Successful output (actual CLI output, Next.js App Router project):

```text
gRouter Copilot — install

→ Validating license…
✔ License valid (****…bHVl) — exchanging for gateway configuration (non-secret)
✔ Framework detected: Next.js (App Router layout)
→ Writing project files…
✔ Created copilot.config.js
✔ Created skills/example.js
✔ Created app/api/copilot/chat/route.js
✔ Created app/api/copilot/health/route.js
✔ Created components/CopilotWidget.jsx
✔ Created .env (GROUTER_GATEWAY_URL, GROUTER_LICENSE, GROUTER_LICENSE_SERVER, GROUTER_LICENSE_PUBLIC_KEY)

How it works: your app calls the Copilot backend gateway; the gRouter service
credential stays server-side (D-021) and is never stored in your project.

Next steps:
  1. Restart your app so the new .env values are loaded.
  2. Mount the widget in your app layout: <CopilotWidget /> from components/CopilotWidget.jsx.
  3. Edit skills/example.js to expose only data you explicitly approve (read-only).
  4. Verify: GET /api/copilot/health on your app returns {"status":"ok"}.
```

Per-framework differences in the same output: Express prints `✔ Framework detected: Express` and `routes/copilot.js` + `routes/copilot-health.js` instead of the Next routes (widget step becomes "Wire the chat route … copilotHandler from routes/copilot.js at POST /api/copilot/chat"); a vanilla Node project prints `Node.js (vanilla)` and `src/copilot-route.js` + `src/copilot-health.js`. Files that already exist print `· Skipped (already exists)`; an already-correct `.env` prints `· Unchanged (already configured) .env (…)`.

What the installer does with your license:

- Sends the license token to the license server (`POST /api/resolve` over HTTPS; default server `https://copilot.grouter.id`, override with `--license-server <URL>` or `GROUTER_LICENSE_SERVER`).
- Receives NON-SECRET configuration only — the chat gateway URL, the provider base URL, and the PUBLIC license verifier key. No provider credential is ever handed off or stored (D-021).
- Writes `GROUTER_GATEWAY_URL`, `GROUTER_LICENSE`, `GROUTER_LICENSE_SERVER`, `GROUTER_LICENSE_PUBLIC_KEY` into the host app's server-side `.env` (creating it, or updating exactly those keys in place if it exists).
- Masks the license in ALL output (`****…last4`); the full token is never printed. Never expose `.env` values to browser code or commit `.env` to version control. The customer does not provide a gRouter API key.

### When install fails

Every failure prints a cause and a fix; nothing is scaffolded and no `.env` is written (fail closed, exit code 1). Actual CLI output for the most common case:

```text
✗ License validation failed — License not activated
  Cause: The license server accepted the token format but no gRouter provider key is bound to it yet.
  Fix: ask the gRouter operator to bind a provider key to this license (admin console → Licenses → Bind), then run the installer again.
  Re-run: grouter-copilot install --license <your-license-token>
  (Your license is never printed in full: ****)
```

| Message | Meaning | What to do |
|---|---|---|
| `License not activated` | license issued but no provider key bound yet (D-016) | operator binds the key (admin console → Licenses → Bind), then re-run |
| `License rejected by the server` | token invalid, expired, or revoked (HTTP 401/403; the server's reason is echoed in `Cause:`) | re-copy the FULL token — it is shown once — and re-run; request a new license if it persists |
| `Cannot reach the license server` | network error (`fetch failed`, DNS, proxy/firewall) | check connectivity and the `--license-server` URL, then retry |
| `Rate limited` (HTTP 429) | too many activation attempts | wait a minute and re-run |
| `License server error` (HTTP 5xx) | backend unavailable/restarting | retry; contact support if it persists |
| `Server tried to hand off a provider credential` | a legacy/broken server attempted to send an API key | installer refused it (D-021 defense in depth); update the license server |

### Re-install / renewal

Re-running `install` with a new license updates the four `GROUTER_*` keys in the existing `.env` in place and leaves every other entry untouched (existing project files are never overwritten — they print `· Skipped (already exists)`). If the runtime still reports a missing or invalid license after a renewal, check that `.env` contains exactly one current `GROUTER_LICENSE=` line — a stale copy from an earlier install takes precedence over the new one appended below it.

## Initialize only

`npx @grouter/copilot init` scaffolds the same files WITHOUT contacting a license server and without writing `.env` (actual CLI output, vanilla Node project):

```text
gRouter Copilot — init

→ Detecting framework…
✔ Framework detected: Node.js (vanilla)

→ Writing project files…
✔ Created copilot.config.js
✔ Created skills/example.js
✔ Created src/copilot-route.js
✔ Created src/copilot-health.js

Next steps:
  1. Add your license to the server-side environment (.env) — never in browser code or git:
       GROUTER_LICENSE=<your-license-token>
       Or let the installer validate and write it for you:
       npx @grouter/copilot install --license <your-license-token>
  2. Wire the chat route: mount copilotHandler from src/copilot-route.js at POST /api/copilot/chat in your server.
     If your UI is React, render CopilotChat from "@grouter/copilot/widget" in your own wrapper component.
  3. Edit skills/example.js to expose only data you explicitly approve (read-only).
  4. Verify: GET /api/copilot/health on your app returns {"status":"ok"}.
```

After installation, edit the example skill to read only the application data you explicitly want to expose, mount `CopilotChat` in the application's UI, and wire the generated route. Provider credentials and chat requests belong on the application server, not the browser.

## First-run experience (end customer)

After install + restart, the end customer sees a floating `✦` bubble (bottom-right, draggable) in the host app. First open with the scaffolded `<CopilotChat firstUseSetup />` shows a one-time setup card ("Siapkan Copilot") that asks the installer to confirm the license lives in the server environment and runs the host health check (`GET /api/copilot/health`); once the health check reports ready, the card is dismissed and remembered in `localStorage`. From then on the bubble opens the chat panel directly: the customer asks a question, the widget posts to the app's own `/api/copilot/chat` route, and the answer renders with its data sources listed. If the license or gateway is unavailable, the panel shows an explicit error (e.g. `LICENSE_INVALID`, `QUOTA_EXCEEDED`) instead of an invented answer.

## Development tests

Production gates are enforced when `NODE_ENV` is unset (fail-closed admin auth, persisted-license-keypair requirement), so tests declare `NODE_ENV=test` explicitly:

```bash
npm test                      # root plugin suite (sets NODE_ENV=test)
cd server && npm test         # backend suite (sets NODE_ENV=test)
```

Payment remains sandbox. The plugin is published to npm as
`@grouter/copilot@0.1.0` (install from the registry is verified), but the full
public install → purchase → customer chat path has not yet been certified
end-to-end against production payment credentials.
