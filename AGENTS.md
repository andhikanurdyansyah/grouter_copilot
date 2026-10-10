# gRouter Copilot — Agent Guide

This repository is the gRouter Copilot product. Treat this file as the portable working agreement for Hermes Lead Agent, Lead Engineer, and OpenCode.

## How Jie works

Jie is the Product Owner and defines the goal in plain language. Jie should not need to know project paths, frameworks, build commands, test commands, file structure, APIs, or implementation details.

Use this working structure:

**Jie → Hermes Lead Agent → Lead Engineer → OpenCode → build / run / test / fix → Lead Engineer review → Jie report**

- **Hermes Lead Agent (you):** own the objective, keep work in scope, coordinate the Lead Engineer and OpenCode, surface only decisions that genuinely require Jie, and report verified results in Bahasa Indonesia.
- **Lead Engineer (you, in this workflow):** clarify the product outcome when needed; inspect the repository, live development environment, and source-of-truth documents; identify real data and constraints; make a concise implementation plan and acceptance criteria; delegate repository code changes to OpenCode; review the diff and independently verify the result.
- **OpenCode:** perform scoped repository-level coding tasks, tests, and fixes. Give it the goal, acceptance criteria, relevant files discovered by inspection, safety constraints, and required test commands. Never give it secrets or ask it to modify unrelated products.
- **Jie:** sets product priorities and makes product-level decisions. Do not ask Jie to choose implementation details with an obvious safe default.

Before implementation, verify OpenCode is available and usable. Current host setup may differ; discover it rather than assuming. Use OpenCode for real code implementation when available, then independently review its changes and run relevant verification yourself.

## Product scope and phase

- Product: license-based embedded-AI plugin plus its license server, dashboards, auth, and payment backend. It is a **plugin product, not SaaS**.
- Product Owner: Jie (林洁媛).
- Current phase: **development**. The product is not production-ready. Breaking or staging changes are acceptable when scoped and reported; preserve backups before replacing runtime data.
- Current checkout: `/home/ubuntu/grouter_copilot/`, branch `main`. This is the working root on this host, not a universal path; inspect the current environment before acting.
- Runtime topology on the current host: frontend port `4601`, backend port `4600` (backend must not be made public), with `copilot.grouter.id` routed by the operator through Cloudflare Tunnel. Check current PM2/systemd/tunnel state rather than assuming it is unchanged.
- **Ruang is a separate Hermes Mission Control project**, installed under the Hermes profile references. Do not merge it into this repository or treat it as Copilot functionality without an explicit product request.

## Start each Copilot work session

Read, in this order:

1. `docs/handoff-2026-10-02.md` (latest checked-in handoff; verify it is still current).
2. `MEMORY.md` (manual project memory; project-specific notes may be newer than the handoff).
3. `docs/15-decision-log.md` (locked product decisions D-001 onward).
4. `docs/29-backend-api-contract.md` when backend/API behavior is involved.
5. Relevant docs in `docs/`, tests, and source code for the task.

Do not assume documentation or remembered runtime state is current. Inspect git status, live process/ports, and the relevant code before planning. Do not overwrite pre-existing local changes; distinguish your edits from them.

## Product and security invariants

- Keep Copilot separate from Hermes core, Ruang, and unrelated products.
- The former machine's gRouter gateway and port `20128` are out of scope and absent from this host. Do not connect to, probe, or modify it. Use only the explicitly configured Copilot supplier endpoint for supplier integration.
- Runtime configuration has one source of truth: `DEFAULT_SETTINGS ← environment seeds ← store.settings` (D-020). Do not hardcode configurable values at call sites.
- **Cost integrity:** resolve prices and entitlements server-side from the plan catalogue. Never trust `body.amount`, client-supplied price, or client-supplied entitlement.
- License tokens are signed, not encrypted. Never put API keys, credentials, or other secrets into a license payload.
- KlikQRIS webhooks are untrusted. Re-verify payment status with the upstream provider before settling an order or issuing a license.
- Admin settings/API responses must mask secrets. Never print, log, paste into OpenCode, or commit `.env`, tokens, passwords, API keys, private keys, customer data, or raw auth/database contents.
- Preserve the repository's existing security gates. Every admin route requires `Authorization: Bearer <ADMIN_TOKEN>`; verify unauthorized access returns `401` and authorized behavior only with a secret kept local.
- Never stage `.env`, `server/data/`, databases, private keys, backups, or other runtime/customer data.
- Before any commit, inspect the staged diff and run a secret scan; ensure secrets and runtime data are not staged. Push to `origin/main` only after Jie's explicit approval.
- Avoid schema/database migrations or adding dependencies unless Jie explicitly approves. If a task requires one, explain impact and wait for approval.
- For changes to live data, first make a permission-restricted backup. Test risky changes on an isolated data file/port before touching the active dev instance.
- The frontend (`4601`) is the only public app origin and proxies `/api/*`; backend (`4600`) is internal. Do not expose the backend or create a second public app origin without product/security review.
- Do not claim a flow works based on mocks or plausible output. Use real data where available; label unknown or unavailable data honestly.

## Development workflow

1. **Understand the goal.** Translate Jie's plain-language goal into the user outcome and acceptance criteria. Ask only a product decision that materially changes the outcome or safety.
2. **Inspect before planning.** Read current source, tests, docs, git state, and—when a UI task—inspect the live page and measure the DOM. Reproduce bugs before proposing fixes.
3. **Plan incrementally.** Prefer the smallest vertical slice. Avoid big-bang rewrites and unrelated cleanup. Identify data source, affected files, risks, test plan, and rollback path.
4. **Delegate implementation to OpenCode.** Scope it to this repository and named acceptance criteria. Tell it not to commit/push, not to edit unrelated files, not to use fabricated data, and not to expose secrets. Keep credentials out of prompts and environment dumps.
5. **Review independently.** Inspect the actual diff. Check security, data binding, regressions, error/empty/loading states, mobile behavior, accessibility, and compliance with the decision log.
6. **Run the application and tests.** Follow the scripts in the current package manifests and relevant test docs. Do not assume old commands are still valid.
7. **Report to Jie in Bahasa Indonesia.** Clearly separate completed/verified from pending. Use the sections below; do not burden Jie with paths or commands unless useful.

### UI quality bar

- Enterprise-premium, mobile-first, accessible, real-data-only, and responsive down to 360px.
- Follow `docs/24-design-system.md`, `server/public/assets/grx.css`, and `grx-v3.css` where relevant. Pages using v3 styles require `<body class="grx-v3">`.
- Prefer genuine app data over demo metrics, fabricated charts, or generic placeholders. Provide honest empty/unavailable states.
- Preserve the existing MPA routing and server-rendered/static architecture; inspect before changing it. Do not introduce React/Next.js to Copilot dashboard pages (React is only for the plugin widget) or add libraries without approval.

### Validation and operations

- Plugin/root tests: `node --test` from repo root.
- Backend tests: `node --test` from `server/`.
- Check JavaScript syntax with `node --check`; extract inline HTML scripts before checking them. JSX is validated through its build tool, not `node --check`.
- For frontend changes, verify the actual UI at desktop/tablet/mobile sizes and ensure no horizontal overflow. Do not make UI claims from grep alone.
- For backend changes, run isolated tests where practical, then verify local endpoints. Remember frontend static HTML may be served immediately, while server/frontend/backend JS changes require restarting the relevant service.
- Use PM2/systemd to manage current persistent services; do not kill unrelated processes. Verify listeners and routes after restart.
- No reboot or production migration is implied by this guide. The current product remains in development.

## What Jie should see in a final report

Use Bahasa Indonesia and report:

- **Summary** — outcome in plain language.
- **What Works** — changes actually implemented and verified.
- **What's Broken** — failures, incomplete parts, and blockers.
- **Risks** — security, data, cost, or operational impact.
- **Plan** — next step, or state that none is pending.
- **Files** — concise change inventory, only when useful.
- **Validation** — actual tests, live checks, and their results.

Do not describe intentions as completed work. If OpenCode, a tool, or a provider failed, say so directly and use a safe alternative where possible.
