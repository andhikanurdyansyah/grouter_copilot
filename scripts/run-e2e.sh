#!/usr/bin/env bash
# Runner E2E — membaca ADMIN_TOKEN dari server/.env TANPA mencetaknya,
# memastikan pm2 services hidup, lalu menjalankan Playwright.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! grep -q '^ADMIN_TOKEN=' server/.env; then
  echo "ERROR: ADMIN_TOKEN tidak ditemukan di server/.env" >&2
  exit 1
fi
export E2E_ADMIN_TOKEN
E2E_ADMIN_TOKEN="$(grep '^ADMIN_TOKEN=' server/.env | cut -d= -f2-)"

# Layanan harus hidup (produksi lokal). Tidak me-restart apa pun — read-only check.
curl -sf -o /dev/null http://localhost:4600/api/health || { echo "ERROR: backend :4600 tidak hidup (pm2 start copilot-backend)" >&2; exit 1; }
curl -sf -o /dev/null http://localhost:4601/app/ || { echo "ERROR: frontend :4601 tidak hidup (pm2 start copilot-frontend)" >&2; exit 1; }

# Pastikan symlink modul playwright untuk e2e (layout pnpm di frontend/)
mkdir -p e2e/node_modules
ln -sfn "$(cd frontend/node_modules/.pnpm/playwright@*/node_modules/playwright && pwd)" e2e/node_modules/playwright
ln -sfn "$(cd frontend/node_modules/.pnpm/playwright@*/node_modules/playwright-core && pwd)" e2e/node_modules/playwright-core

export E2E_BASE_URL="${E2E_BASE_URL:-http://localhost:4601}"
exec node frontend/node_modules/playwright/cli.js test --config=playwright.config.mjs "$@"
