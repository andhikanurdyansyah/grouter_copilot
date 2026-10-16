# Dependency audit

The repository audits its two tracked dependency lockfiles without changing the
working tree:

```bash
npm run audit:dependencies
```

This runs `npm audit --omit=dev --audit-level=high` for `server/package-lock.json`
and `pnpm audit --prod --audit-level=high` for `frontend/pnpm-lock.yaml`. The
command does not run install/update/upgrade or write a lockfile. It exits nonzero
when a package manager reports a high (or critical) vulnerability, when a
lockfile is missing, or when the package-manager command cannot run.

The audit subprocess receives a minimal environment and an empty, temporary npm
configuration file, so user registry configuration and credential-bearing settings
are not used. Output redaction covers bearer/basic authorization, npm auth fields,
and credential-bearing URLs. The audit still contacts the package registry; a
network-restricted environment may fail the audit rather than silently treating an
unavailable audit as clean.

For offline contract verification, use:

```bash
npm run audit:dependencies:check
```

This deterministic check verifies both lockfiles exist and the configured audit
commands retain the production-only and high-severity policy. It does not claim
that the dependency tree is vulnerability-free.
