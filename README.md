# gRouter Copilot

License-based AI copilot plugin for Node.js apps. Developers control data access through explicitly defined, read-only skills.

## Install

A license must be activated (an existing gRouter provider key bound by an operator) before installation can complete. In the host application's server environment, run:

```bash
npx @grouter/copilot install --license <YOUR_COPILOT_LICENSE>
```

The CLI sends the Copilot license to the configured license server over HTTPS, receives the server-resolved provider credential, stores it in the host app's server-side `.env`, and does not print it. Never expose `.env` values to browser code or commit `.env` to version control. The customer does not provide a gRouter API key.

To target a non-default license server, pass `--license-server <URL>`. Default: `https://copilot.grouter.id`.

If install reports the license is not activated, contact the operator/support; automatic provider-key provisioning is not implemented (D-016).

## Initialize only

`npx @grouter/copilot init` scaffolds `copilot.config.js`, `skills/example.js`, and a route example. It does not validate a license or make the chat ready by itself.

After installation, edit the example skill to read only the application data you explicitly want to expose, mount `CopilotChat` in the application's UI, and wire the generated route. Provider credentials and chat requests belong on the application server, not the browser.

## Development tests

```bash
node --test
cd server && node --test
```

Payment remains sandbox and the complete public npm install/customer chat path has not yet been certified as production-ready.
