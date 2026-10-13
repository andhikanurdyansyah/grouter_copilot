#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# gRouter Copilot — READ-ONLY production smoke test.
#
# Separate from the mutating E2E suite on purpose: this script performs only
# non-mutating checks against the LIVE production services. It never creates
# accounts/orders/licenses and never settles a payment.
#
# Checks: backend health, frontend health, public origin health, /api/plans
# (public catalogue), and that admin routes are FAIL-CLOSED (401 without a
# token). It does NOT read or print server/.env secrets.
#
# Exit code is non-zero if any live check fails.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

BE="${LIVE_BE_URL:-http://localhost:4600}"
FE="${LIVE_FE_URL:-http://localhost:4601}"
PUBLIC="${LIVE_PUBLIC_URL:-https://copilot.grouter.id}"

fail=0
check() { # url expected label
  local url="$1" want="$2" label="$3"
  local got
  got="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url" || echo 000)"
  if [ "$got" = "$want" ]; then
    printf '  ✔ %-48s %s\n' "$label" "$got"
  else
    printf '  ✖ %-48s %s (want %s)\n' "$label" "$got" "$want"
    fail=1
  fi
}

echo "READ-ONLY production smoke test"
check "$BE/api/health" 200 "backend health ($BE)"
check "$FE/" 200 "frontend root ($FE)"
check "$FE/app/" 200 "frontend /app/ (SPA shell)"
check "$PUBLIC/api/health" 200 "public origin health ($PUBLIC)"
check "$PUBLIC/" 200 "public origin root"
check "$BE/api/plans" 200 "public plan catalogue"
# Admin must fail closed without a token.
check "$BE/api/admin/stats" 401 "admin fails closed (no token)"

echo
echo "NOTE: no mutating request was made; production data untouched."
if [ "$fail" -ne 0 ]; then echo "RESULT: FAIL"; exit 1; fi
echo "RESULT: PASS"
