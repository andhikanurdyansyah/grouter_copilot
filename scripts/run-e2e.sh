#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# gRouter Copilot — ISOLATED E2E runner (DEFAULT).
#
# Runs the Playwright suite against a DISPOSABLE instance (temp auth DB + temp
# store + mock upstream, ports 4690/4691). It NEVER touches production
# (localhost:4600/4601) and creates ZERO production accounts/orders/licenses.
#
# One command, locally and in CI:   npm run e2e
#
# Env knobs:
#   E2E_PAY_SEAM=1      mock upstream reports a paid status (isolated only)
#   E2E_BACKEND_PORT    default 4690
#   E2E_FRONTEND_PORT   default 4691
#   E2E_GREP=<pattern>  forwarded as `-g <pattern>` to Playwright
#
# For a READ-ONLY production smoke test (no mutation), use scripts/e2e-smoke-live.sh.
#
# Requirements: Node ≥20.6 (node:sqlite). Playwright is resolved from
# frontend/node_modules (pnpm layout) — symlinked below.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

# Resolve Playwright + playwright-core from the pnpm store once (the frontend
# dependency tree is the source of truth). `playwright-core` is a transitive
# dep, so it is only present under .pnpm — resolve it there, not under
# frontend/node_modules directly.
PW_MAIN="$(cd frontend/node_modules/playwright && pwd -P)"
PW_CORE="$(cd "$(dirname "$PW_MAIN")/playwright-core" && pwd -P)"

# Specs import bare 'playwright/test' → resolvable from the repo root and e2e/.
mkdir -p e2e/node_modules node_modules
ln -sfn "$PW_MAIN" e2e/node_modules/playwright
ln -sfn "$PW_CORE" e2e/node_modules/playwright-core
ln -sfn "$PW_MAIN" node_modules/playwright
ln -sfn "$PW_CORE" node_modules/playwright-core

PW_ARGS=()
if [ -n "${E2E_GREP:-}" ]; then PW_ARGS+=("-g" "${E2E_GREP}"); fi

exec node e2e/isolated/run.mjs "${PW_ARGS[@]}" "$@"
