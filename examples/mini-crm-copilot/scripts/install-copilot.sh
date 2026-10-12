#!/usr/bin/env bash
# scripts/install-copilot.sh — instalasi lisensi gRouter Copilot untuk demo mini-CRM.
#
# MODE LOCAL-DEV (EKSPLISIT, tidak disamarkan):
#   npx @grouter/copilot (dari npm registry) BELUM tersedia karena package belum
#   di-publish. Bentuk final setelah registry publish memang npx @grouter/copilot;
#   hari ini kita memanggil CLI langsung dari repo: ../../bin/grouter-copilot.js.
#
# Pemakaian:  DEMO_LICENSE=<token> bash scripts/install-copilot.sh
#   (token TIDAK pernah di-echo; hanya diteruskan ke CLI via env)
set -euo pipefail

cd "$(dirname "$0")/.."   # root demo: examples/mini-crm-copilot/

: "${DEMO_LICENSE:?DEMO_LICENSE env var wajib diisi dengan token lisensi demo (tidak di-print)}"

node ../../bin/grouter-copilot.js install \
  --license "$DEMO_LICENSE" \
  --license-server "${GROUTER_LICENSE_SERVER:-https://copilot.grouter.id}"

echo "Install selesai. .env berisi GROUTER_LICENSE / GROUTER_LICENSE_SERVER /"
echo "GROUTER_GATEWAY_URL / GROUTER_LICENSE_PUBLIC_KEY (non-secret)."
echo "Catatan: ini mode local-dev; npx @grouter/copilot adalah bentuk final setelah registry publish."
