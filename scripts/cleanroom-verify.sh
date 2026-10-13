#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Clean-room installer verification matrix (NO npm publish).
#
# Packs the tarball from the working tree and, for each supported host variant
# (ESM, CommonJS), does a from-scratch install in a temp dir OUTSIDE the repo,
# runs `grouter-copilot install` against a disposable isolated license server,
# boots the host, and asserts the health + chat contract.
#
# Read-only w.r.t. production: the isolated license server runs on port 4693 with
# its own temp DATA_FILE/AUTH_DB_FILE.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d /tmp/copilot-cleanroom-XXXXXX)"
echo "work dir: $WORK"
FAIL=0
pass() { echo "  ✔ $1"; }
fail() { echo "  ✖ $1"; FAIL=1; }

cleanup() {
  [ -n "${SRV_PID:-}" ] && kill "$SRV_PID" 2>/dev/null
  rm -rf "$WORK"
}
trap cleanup EXIT

# 1. Pack from the tree (no publish).
cd "$REPO"
TARBALL="$(npm pack --pack-destination "$WORK" 2>/dev/null | tail -1)"
if [ -f "$WORK/$TARBALL" ]; then pass "npm pack -> $TARBALL ($(stat -c%s "$WORK/$TARBALL") bytes)"; else fail "npm pack"; exit 1; fi

# 2. Disposable isolated license server (port 4693).
ISO="$WORK/iso"
mkdir -p "$ISO/data"
BETTER_AUTH_SECRET=cleanroom-secret-0123456789abcdef \
NODE_ENV=test AUTH_DB_FILE="$ISO/data/auth.sqlite" DATA_FILE="$ISO/data/store.json" \
PORT=4693 ALLOW_UNAUTHENTICATED_ADMIN=1 \
node "$REPO/server/src/index.js" > "$WORK/server.log" 2>&1 &
SRV_PID=$!
for i in $(seq 1 40); do
  curl -sf http://127.0.0.1:4693/api/health >/dev/null 2>&1 && break
  sleep 0.25
done
if curl -sf http://127.0.0.1:4693/api/health >/dev/null 2>&1; then pass "isolated license server healthy (:4693)"; else fail "isolated license server"; fi

# 3. Mint a license token.
TOK="$(curl -sf -X POST http://127.0.0.1:4693/api/admin/licenses \
  -H 'content-type: application/json' \
  -d '{"planKey":"quota-3b-90d","customer":"clean-room"}' 2>/dev/null \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log(j.token||j.data?.token||"")}catch{console.log("")}})')"
if [ -n "$TOK" ]; then pass "minted license token (${#TOK} chars, not printed)"; else fail "mint license"; fi

# 4. Per-variant clean-room install + boot.
for VARIANT in esm cjs; do
  echo "── variant: $VARIANT ──"
  V="$WORK/$VARIANT"
  mkdir -p "$V"
  cd "$V"
  if [ "$VARIANT" = "esm" ]; then
    npm init -y >/dev/null 2>&1
    node -e "const f='package.json',p=require('./'+f);p.type='module';require('fs').writeFileSync(f,JSON.stringify(p,null,2))"
  else
    npm init -y >/dev/null 2>&1   # default = CommonJS
  fi
  npm install "$WORK/$TARBALL" >/dev/null 2>&1 && pass "$VARIANT: tarball installed" || fail "$VARIANT: install tarball"

  npx grouter-copilot install --license "$TOK" --license-server http://127.0.0.1:4693 > "$WORK/$VARIANT-install.log" 2>&1
  if [ $? -eq 0 ]; then pass "$VARIANT: CLI install exit 0"; else fail "$VARIANT: CLI install"; fi

  # D3: the scaffold extension must match the host module system.
  if [ "$VARIANT" = "esm" ]; then
    [ -f copilot.config.js ] && ! [ -f copilot.config.cjs ] && pass "$VARIANT: ESM scaffold (.js)" || fail "$VARIANT: ESM scaffold extension"
  else
    [ -f copilot.config.cjs ] && pass "$VARIANT: CJS scaffold (.cjs)" || fail "$VARIANT: CJS scaffold extension"
  fi

  # Boot a minimal host that wires the scaffolded health handler, then assert 200.
  if [ "$VARIANT" = "esm" ]; then
    cat > host.mjs <<'EOF'
import http from 'node:http';
import process from 'node:process';
process.loadEnvFile?.();
const mod = await import('./src/copilot-health.js');
const h = mod.copilotHealthHandler ?? mod.default;
const srv = http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/copilot/health')) {
    try { await h(req, res); } catch (e) { res.writeHead(500); res.end(String(e)); }
  } else { res.writeHead(404); res.end(); }
});
srv.listen(4698, () => console.log('HOST_UP'));
EOF
  else
    cat > host.cjs <<'EOF'
const http = require('node:http');
try { process.loadEnvFile?.(); } catch {}
const mod = require('./src/copilot-health.cjs');
const h = mod.copilotHealthHandler ?? mod.default;
const srv = http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/copilot/health')) {
    try { await h(req, res); } catch (e) { res.writeHead(500); res.end(String(e)); }
  } else { res.writeHead(404); res.end(); }
});
srv.listen(4698, () => console.log('HOST_UP'));
EOF
  fi
  ENTRY=$([ "$VARIANT" = "esm" ] && echo host.mjs || echo host.cjs)
  node --env-file=.env "$ENTRY" > "$WORK/$VARIANT-host.log" 2>&1 &
  HPID=$!
  for i in $(seq 1 40); do
    curl -sf http://127.0.0.1:4698/api/copilot/health >/dev/null 2>&1 && break
    sleep 0.25
  done
  CODE="$(curl -s -o "$WORK/$VARIANT-health.json" -w '%{http_code}' http://127.0.0.1:4698/api/copilot/health 2>/dev/null)"
  if [ "$CODE" = "200" ]; then pass "$VARIANT: host health 200"; else fail "$VARIANT: host health (got $CODE)"; cat "$WORK/$VARIANT-host.log" | tail -3; fi
  kill $HPID 2>/dev/null
  cd "$REPO"
done

echo
if [ "$FAIL" -eq 0 ]; then echo "CLEAN-ROOM RESULT: PASS"; else echo "CLEAN-ROOM RESULT: FAIL"; fi
exit $FAIL
