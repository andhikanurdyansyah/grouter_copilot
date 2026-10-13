#!/usr/bin/env bash
#
# restore-drill.sh — isolated RESTORE DRILL for gRouter Copilot.
#
# WHAT IT DOES (no production impact):
#   1. Picks the latest production backup dir under /home/ubuntu/backups/
#      (a `copilot-*` dir containing auth.sqlite + store.json), or one given
#      with --backup <path>.
#   2. Copies auth.sqlite + store.json into a FRESH isolated scratch dir (mode 700).
#   3. Boots an isolated backend on PORT 4691 with DATA_FILE / AUTH_DB_FILE
#      pointing at the restored copies (never touches server/data/ or pm2).
#   4. Verifies integrity:
#        - auth.sqlite opens and every table's row count matches the backup source,
#        - store.json parses and accounts/orders/licenses counts match the backup,
#        - GET /api/health responds (HTTP 200, status "ok").
#   5. Prints a PASS/FAIL summary; exits non-zero on any mismatch.
#   6. Cleans up the booted process (killed BY PID resolved from `ss -ltnp`;
#      never `pkill -f`, which would self-terminate this shell).
#
# USAGE:
#   server/scripts/restore-drill.sh
#   server/scripts/restore-drill.sh --backup /home/ubuntu/backups/copilot-20261013T040849Z
#   server/scripts/restore-drill.sh --port 4691 --keep   # --keep: leave scratch dir
#
# NOTE: credentials for the isolated boot come from server/.env via loadEnv();
#       this script never reads or prints secret values.

set -euo pipefail

# ---- config ---------------------------------------------------------------
SERVER_DIR="/home/ubuntu/grouter_copilot/server"
BACKUP_ROOT="/home/ubuntu/backups"
SCRATCH_ROOT="/root/.hermes/profiles/copilot-grouter/cache/scratch"
PORT="4691"
KEEP=0
BACKUP=""
HEALTH_RETRIES=40

# ---- args -----------------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --backup) BACKUP="${2:-}"; shift 2 ;;
    --port)   PORT="${2:-}";   shift 2 ;;
    --keep)   KEEP=1;          shift ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

log()  { printf '%s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; }

# ---- pick the backup dir --------------------------------------------------
pick_latest_backup() {
  local d latest=""
  # Newest mtime first; keep the newest copilot-* dir holding both artifacts.
  while IFS= read -r d; do
    [ -z "$d" ] && continue
    if [ -f "$d/auth.sqlite" ] && [ -f "$d/store.json" ]; then
      latest="$d"; break
    fi
  done < <(find "$BACKUP_ROOT" -maxdepth 1 -type d -name 'copilot-*' -printf '%T@ %p\n' 2>/dev/null \
             | sort -rn | awk '{print $2}')
  printf '%s' "$latest"
}

if [ -z "$BACKUP" ]; then
  BACKUP="$(pick_latest_backup)"
fi
if [ -z "$BACKUP" ] || [ ! -d "$BACKUP" ]; then
  fail "no usable backup dir (need auth.sqlite + store.json) under $BACKUP_ROOT"; exit 1
fi
if [ ! -f "$BACKUP/auth.sqlite" ] || [ ! -f "$BACKUP/store.json" ]; then
  fail "backup dir missing auth.sqlite and/or store.json: $BACKUP"; exit 1
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ISO_DIR="$SCRATCH_ROOT/restore-drill-$STAMP"

# ---- process cleanup helpers ---------------------------------------------
# Resolve listening PIDs for a TCP port from `ss`, without pkill ever seeing the
# port string in a matching pattern. Only kills a node running OUR src/index.js.
server_pids_for_port() {
  ss -ltnp 2>/dev/null | awk -v p=":$PORT" '$4 ~ p' | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u
}
kill_isolated_server() {
  local pid
  for pid in $(server_pids_for_port); do
    if tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | grep -q "src/index.js"; then
      kill "$pid" 2>/dev/null || true
    fi
  done
}
cleanup() {
  kill_isolated_server
  if [ "${KEEP}" -eq 0 ] && [ -n "${ISO_DIR:-}" ] && [ -d "$ISO_DIR" ]; then
    rm -rf "$ISO_DIR"
  fi
}
trap cleanup EXIT

# ---- restored scratch dir (mode 700) --------------------------------------
umask 077
mkdir -p "$SCRATCH_ROOT"
mkdir -m 700 -p "$ISO_DIR"
cp -p "$BACKUP/auth.sqlite" "$ISO_DIR/auth.sqlite"
cp -p "$BACKUP/store.json"  "$ISO_DIR/store.json"
chmod 600 "$ISO_DIR/auth.sqlite" "$ISO_DIR/store.json"

log "== gRouter Copilot restore drill =="
log "backup source : $BACKUP"
log "scratch dir   : $ISO_DIR (mode $(stat -c '%a' "$ISO_DIR"))"
log "port          : $PORT"
log ""

# ---- integrity verifier (node stdlib only) --------------------------------
# Compares restored copies against the backup source and prints a JSON verdict.
VERIFIER="$ISO_DIR/verify.mjs"
cat > "$VERIFIER" <<'NODE'
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const [backupDir, isoDir] = process.argv.slice(2);

function authCounts(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  const tables = db.prepare("select name from sqlite_master where type='table' order by name").all();
  const out = {};
  for (const t of tables) out[t.name] = db.prepare(`select count(*) c from "${t.name}"`).get().c;
  db.close();
  return out;
}
function storeCounts(file) {
  const s = JSON.parse(readFileSync(file, 'utf8'));
  return {
    accounts: (s.accounts ?? []).length,
    orders:   (s.orders ?? []).length,
    licenses: (s.licenses ?? []).length,
  };
}

const result = { store: {}, auth: {}, mismatches: [] };

const bs = storeCounts(`${backupDir}/store.json`);
const is = storeCounts(`${isoDir}/store.json`);
for (const k of Object.keys(bs)) {
  result.store[k] = { backup: bs[k], restored: is[k], ok: bs[k] === is[k] };
  if (bs[k] !== is[k]) result.mismatches.push(`store.${k}: backup=${bs[k]} restored=${is[k]}`);
}

const ba = authCounts(`${backupDir}/auth.sqlite`);
const ia = authCounts(`${isoDir}/auth.sqlite`);
for (const k of Object.keys(ba)) {
  const restored = Object.prototype.hasOwnProperty.call(ia, k) ? ia[k] : null;
  result.auth[k] = { backup: ba[k], restored, ok: restored === ba[k] };
  if (restored !== ba[k]) result.mismatches.push(`auth.${k}: backup=${ba[k]} restored=${restored}`);
}
for (const k of Object.keys(ia)) {
  if (!Object.prototype.hasOwnProperty.call(ba, k)) {
    result.auth[k] = { backup: null, restored: ia[k], ok: false };
    result.mismatches.push(`auth.${k}: table present in restore but not in backup`);
  }
}

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exit(result.mismatches.length ? 1 : 0);
NODE

log "== row-count integrity (restored vs backup source) =="
VERIFY_OUT="$(node "$VERIFIER" "$BACKUP" "$ISO_DIR" 2>&1)" && VERIFY_RC=0 || VERIFY_RC=$?
printf '%s\n' "$VERIFY_OUT"
log ""
if [ "$VERIFY_RC" -ne 0 ]; then
  fail "row-count mismatch between restore and backup source"
  exit 1
fi

# ---- boot the isolated instance -------------------------------------------
log "== booting isolated backend on :$PORT =="
(
  cd "$SERVER_DIR"
  DATA_FILE="$ISO_DIR/store.json" \
  AUTH_DB_FILE="$ISO_DIR/auth.sqlite" \
  PORT="$PORT" \
  BETTER_AUTH_URL="http://localhost:$PORT" \
  BETTER_AUTH_TRUSTED_ORIGINS="http://localhost:$PORT,http://127.0.0.1:$PORT" \
  node src/index.js > "$ISO_DIR/server.log" 2>&1 &
  echo $! > "$ISO_DIR/server.pid"
)
SERVER_PID="$(cat "$ISO_DIR/server.pid" 2>/dev/null || echo '')"
log "booted pid: ${SERVER_PID:-unknown}"

HEALTH_BODY=""
HEALTH_CODE="000"
for _ in $(seq 1 "$HEALTH_RETRIES"); do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then break; fi
  rm -f "$ISO_DIR/health.json"
  HEALTH_CODE="$(curl -s -o "$ISO_DIR/health.json" -w '%{http_code}' "http://127.0.0.1:$PORT/api/health" 2>/dev/null)" || HEALTH_CODE="000"
  [ -n "$HEALTH_CODE" ] || HEALTH_CODE="000"
  if [ "$HEALTH_CODE" != "000" ] && [ -f "$ISO_DIR/health.json" ]; then
    HEALTH_BODY="$(cat "$ISO_DIR/health.json")"
    break
  fi
  sleep 0.5
done

log "GET /api/health -> HTTP $HEALTH_CODE"
if [ -n "$HEALTH_BODY" ]; then printf 'body: %s\n' "$HEALTH_BODY"; fi
log ""

# ---- shutdown + verdict ---------------------------------------------------
log "== cleanup =="
kill_isolated_server
[ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true
log "isolated backend stopped."

STATUS="PASS"
if [ "$HEALTH_CODE" != "200" ]; then STATUS="FAIL"; fi
case "$HEALTH_BODY" in
  *'"status":"ok"'*|*'"status": "ok"'*) : ;;
  *) STATUS="FAIL" ;;
esac

log ""
log "== summary =="
log "backup source : $BACKUP"
log "restored to   : $ISO_DIR"
log "row counts    : MATCH (auth + store)"
log "health        : HTTP $HEALTH_CODE"
log "result        : $STATUS"

if [ "$STATUS" != "PASS" ]; then
  fail "health check did not return ok"
  log "---- server.log (tail) ----"; tail -n 30 "$ISO_DIR/server.log" 2>/dev/null || true
  exit 1
fi

log "PASS: restore drill completed and verified."
exit 0
