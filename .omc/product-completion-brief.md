# Copilot product completion — OMC execution brief

## Product outcome
Bring the gRouter Copilot repository at `/home/ubuntu/grouter_copilot` to the strongest safely verifiable product state without crossing the Copilot/gRouter-gateway boundary. Work incrementally; keep each slice testable, reversible, and independently reviewed. The product is NOT production-ready until all gated acceptance criteria below have evidence.

## Hard boundaries
- This is gRouter Copilot only. Do not access, probe, configure, or modify the separate gRouter supplier/gateway at port 20128. Use injected fakes or clearly bounded existing supplier configuration; never route tests to that gateway.
- Work only in this repository and only in scope of the currently assigned goal. Preserve all pre-existing dirty files unless directly required; inspect their current diffs first. No broad reset, stash, clean, or checkout of user changes.
- No npm install/add/remove, database migration, production credential mutation, PM2 restart, payment-mode change, production data modification, deployment, git commit, or push without explicit PO authorization. Do not touch secrets or print them. `.env` and `data/` must never be staged.
- Cost integrity: resolve price and entitlement server-side from plan catalogue; never trust client amount. License tokens are signed, not encrypted; never put secrets in them. KlikQRIS webhooks must re-verify upstream; test with injected fake fetch only.
- Runtime config SSOT remains `DEFAULT_SETTINGS <- env seeds <- store.settings` (D-020). No configurable call-site hardcoding.
- Zero new production dependencies; static MPA dashboards remain Node.js/zero-dependency per repo guidance.
- Do not alter brand/design direction or promote any draft landing route without PO approval.

## Required context
Read before each goal: `AGENTS.md`, `docs/handoff-2026-10-02.md`, `docs/handoff-2026-10-05.md`, `MEMORY.md`, `docs/15-decision-log.md`, `docs/29-backend-api-contract.md`, relevant docs in `docs/20`, `docs/22`, `docs/25`, `docs/28`, plus `server/test` patterns. The project is currently on `main` with pre-existing edits; don't overwrite them.

## Workflow per goal
1. Reconcile actual worktree/diff and define exact file scope before edits.
2. Use OMC planner/architect to propose the smallest safe slice; wait for explicit acceptance evidence.
3. Implement with RED→GREEN tests and no unrelated cleanup.
4. Run focused tests, then full `cd server && node --test` and root `node --test` when relevant. Check syntax and `git diff --check`.
5. Independently inspect the final diff, auth/data boundaries, cost integrity, secrets, production side effects, and acceptance evidence. Do not trust agent claims alone.
6. Mark goals separately as implemented, tested, isolated-canary passed, or production-enabled. Never claim production ready from unit tests.
7. At each completed goal, report to Jie in Bahasa Indonesia using: Summary / What Works / What's Broken / Risks / Plan / Files / Validation. Do not proceed to production activation, commit, or push without approval.

## Goals (ordered; finish one and checkpoint before next)
1. **Isolated install-to-chat proof** — inspect plugin docs/current implementation; define and run deterministic isolated tests for install/config, license validation, developer-defined read-only skill execution, chat request via FakeSupplier, safe errors/context limits, and no provider key in browser/license payload. Fix only proven product defects required for this path. No live supplier calls. Exit evidence: clean temporary state, focused tests, root+backend suites if changed, reproducible steps/docs.
2. **P0 traceability and safe failure behavior** — reconcile each P0 in `docs/20-requirements-traceability.md` against actual code/tests; add missing acceptance/failure tests and minimally fix confirmed gaps, prioritizing skill injection/read-only enforcement, key isolation, error redaction, limits, adapter contract, and versioning. Preserve locked decisions.
3. **Customer onboarding and install DX** — audit docs/examples/CLI from clean consumer perspective; close only verified gaps in `npx @grouter/copilot install` → license/config → sample skill → chat. Do not install packages; use existing tests/local packages. Add copy-pasteable examples and honest troubleshooting where missing.
4. **Customer dashboard journey verification** — use isolated auth/store state and fake payment upstream to cover registration/session assumptions, catalogue, order creation, paid settlement, license issuance, success/dashboard projections, authorization/ownership, empty/error states. No production DB or real payment. Add tests/fix only defects found.
5. **Admin/settings/security hardening** — verify all admin route auth, masked secrets, D-020 settings wiring/hot-vs-restart semantics, account/license ownership, input validation, webhook upstream verification, neutral public errors and audit paths. Add adversarial regression tests; no real credentials.
6. **Docs/product gap reconciliation** — update only docs proven stale by code/tests; maintain pending ops gates (KlikQRIS production credentials, durable signing keypair, admin token, provider setup) as blocked on Jie/operator authorization. Do not mark launch-ready until PO can do the required external steps.
7. **Release-readiness packet (no activation)** — provide an evidence matrix, reproducible isolated smoke recipe, rollback/release checklist, exact remaining PO actions, and status. No deploy, pm2 restart, commit, or push.

## Definition of done
- Every P0 has a reproducible acceptance test and explicit failure behavior.
- Install→configured read-only skill→chat is exercised with a fake provider and isolated state.
- All applicable root and backend suites pass; any baseline failure is proven against base before waiver.
- Secret boundary, cost-integrity, license signing, and webhook verification regressions are covered.
- Docs match verified code and distinguish development-complete from production-enabled.
- No unintended diff to pre-existing user changes; no secrets staged/exposed; no production mutation.
- Report all external/operator blockers honestly. Product is not labeled production-ready while any operational gate remains.
