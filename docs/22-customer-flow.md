# Customer Flow — gRouter Copilot

## Supported customer path

```text
Landing → account → purchase from server plan catalogue → LICENSE KEY
→ run `npx @grouter/copilot install --license <LICENSE_KEY>` in a Node.js app
→ installer POSTs the license to the Copilot license server `/api/resolve`
→ server verifies signature/revocation and returns the bound provider credential over TLS
→ installer writes it to the host application's server-side `.env`
→ developer defines read-only skills and mounts the chat UI
```

The only credential the customer supplies is the Copilot license. A gRouter provider key is never requested from the customer, included in the signed license token, printed by the installer, or sent to browser code. The provider key remains a secret in the server-side host app environment after handoff. Keep `.env` out of source control.

## Activation dependency

D-016 defers automatic gRouter key provisioning. Therefore a paid license does not necessarily resolve immediately: an operator must bind an existing provider key to that license first. Until bound, `/api/resolve` returns 404 and the installer stops before writing scaffold files. Do not describe checkout as fully self-service until provisioning/operations have been addressed.

## Verified repository components

- License server issue/revoke/validate: `server/src/licenseService.js`
- Heartbeat/install counting: `POST /api/heartbeat`
- Provider key handoff: `POST /api/resolve` and admin bind
- Usage reporting: `server/src/usageResolver.js`
- CLI scaffold and license-based install: `bin/grouter-copilot.js`
- React chat panel: `src/widget/CopilotChat.jsx`

## Not yet verified or implemented

- Published npm package install via `npx` from the public registry.
- Customer purchase → operator binding → installer against a real issued license.
- Draggable launcher, configurable welcome message, and first-use setup modal.
- Full host-app install → configured skill → successful live chat.

Treat these as pending; do not market the product as production-ready until a repeatable isolated E2E passes. Payment remains KlikQRIS sandbox per the current handoff.
