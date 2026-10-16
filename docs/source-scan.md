# Production source scan

`npm run audit:source` runs a deterministic, zero-dependency hygiene scan over the
production source roots `src/`, `frontend/src/`, `server/src/`, and `bin/`.

It reports only file, line, and rule identifiers (never matched source text) for:

- `hardcoded-secret`: long credential-shaped string literals assigned to names
  such as `token`, `secret`, `password`, or `apiKey`. Environment/config reads,
  obvious placeholders, comments, tests, and examples are excluded.
- `mock-data-in-production`: executable-looking assignments, object properties,
  calls, or imports using common mock/fake/fixture/dummy data terms. Full-line
  and trailing comments are ignored; the known `FakeSupplier` test adapter is
  allowed.

The scan intentionally does **not** attempt to prove that a repository contains
no secrets, infer whether every configurable value is hardcoded, inspect generated
bundles, or parse JavaScript/TypeScript. Localhost URLs are allowed for the
current isolated server configuration and are not a violation by themselves.

Scope is deliberately narrow to keep findings reviewable and false positives low.
A finding requires human review; do not paste secret values into issue comments or
logs. Use `npm run audit:source:test` for the contract tests. `--json` is available
for machine consumers and remains secret-safe.
