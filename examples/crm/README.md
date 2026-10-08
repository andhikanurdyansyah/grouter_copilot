# gRouter Copilot — CRM example

This is a minimal example of exposing CRM data as a read-only Copilot skill.

## Files

- `skills/sales.js` — a `sales-summary` skill scoped per user.

## Usage

```bash
# in a Next.js app
npx @grouter/copilot init
# copy this skill over skills/example.js
# connect the app to the Copilot backend with its license (D-021:
# GROUTER_API_KEY never lives in the customer app — it stays in the Copilot backend)
```

See the root `README.md` and `docs/` for the full guide.
