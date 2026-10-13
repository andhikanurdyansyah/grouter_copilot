#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# gRouter Copilot — frontend deploy (build → stage → atomic swap → restart).
#
# Frontend is a static Vite SPA served by `copilot-frontend` (:4601) from
# server/public/app. Historically this was a manual `cp frontend/dist/. …` with
# no pruning (hundreds of orphaned hashed assets accumulated) and no rollback.
#
# This script:
#   1. builds the SPA (tsc + vite),
#   2. validates the built index.html + every referenced asset exists,
#   3. backs up the current app dir,
#   4. swaps in the new build (prunes orphaned hashed assets),
#   5. restarts copilot-frontend and health-checks it,
#   6. on ANY failure, rolls back to the backup automatically.
#
# Backend changes (server/src/*.js) are NOT deployed here — restart copilot-backend
# separately with `pm2 restart copilot-backend --update-env`.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
APP_DIR="$ROOT/server/public/app"
DIST_DIR="$ROOT/frontend/dist"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="/home/ubuntu/backups/copilot-fe-$STAMP"

echo "== 1/6 build =="
(cd frontend && npx tsc -b --noEmit && npm run build >/dev/null)
echo "   build ok"

echo "== 2/6 validate dist =="
[ -f "$DIST_DIR/index.html" ] || { echo "FATAL: no dist/index.html"; exit 1; }
missing=0
for a in $(grep -oE 'assets/[A-Za-z0-9_.-]+' "$DIST_DIR/index.html" | sort -u); do
  [ -f "$DIST_DIR/$a" ] || { echo "FATAL: dist missing referenced asset $a"; missing=1; }
done
[ "$missing" -eq 0 ] || exit 1
echo "   all referenced assets present"

echo "== 3/6 backup current app dir =="
mkdir -p "$BACKUP_DIR"
if [ -d "$APP_DIR" ]; then cp -a "$APP_DIR" "$BACKUP_DIR/app"; fi
echo "   backed up to $BACKUP_DIR"

rollback() {
  echo "== ROLLBACK =="
  if [ -d "$BACKUP_DIR/app" ]; then
    rm -rf "$APP_DIR"
    cp -a "$BACKUP_DIR/app" "$APP_DIR"
    pm2 restart copilot-frontend --update-env >/dev/null 2>&1 || true
    echo "   reverted + restarted"
  else
    echo "   no backup to revert to"
  fi
}
trap 'status=$?; if [ $status -ne 0 ]; then rollback; echo "DEPLOY FAILED (exit $status)"; exit $status; fi' EXIT

echo "== 4/6 swap in new build =="
# Full replace so orphaned hashed assets are pruned; state is stateless static files.
rm -rf "$APP_DIR.new"
mkdir -p "$APP_DIR.new"
cp -a "$DIST_DIR/." "$APP_DIR.new/"
rm -rf "$APP_DIR"
mv "$APP_DIR.new" "$APP_DIR"
echo "   deployed $(ls "$APP_DIR/assets" | wc -l) assets (pruned)"

echo "== 5/6 restart frontend =="
pm2 restart copilot-frontend --update-env >/dev/null
sleep 2

echo "== 6/6 health check =="
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:4601/app/ || echo 000)"
[ "$code" = "200" ] || { echo "health /app/ = $code"; exit 1; }
code2="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:4601/ || echo 000)"
[ "$code2" = "200" ] || { echo "health / = $code2"; exit 1; }
echo "   / 200, /app/ 200"

trap - EXIT
echo
echo "DEPLOY OK — backup at $BACKUP_DIR (rollback: rm -rf $APP_DIR && cp -a $BACKUP_DIR/app $APP_DIR && pm2 restart copilot-frontend)"
