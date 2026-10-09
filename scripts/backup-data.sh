#!/bin/sh
# gRouter Copilot — local backup of production data (store.json + auth.sqlite + keys).
# Runs via cron; keeps last N copies; never prints secret values.
set -eu
DATA_DIR=/home/ubuntu/grouter_copilot/server/data
BACKUP_DIR=/home/ubuntu/backups/copilot-data
KEEP=14
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$BACKUP_DIR"
# Atomic-ish: copy then tar. Exclude nothing — keys/ is REQUIRED for license signing.
TMP="$BACKUP_DIR/.tmp.$STAMP"
mkdir -p "$TMP"
cp "$DATA_DIR/store.json" "$TMP/store.json"
[ -f "$DATA_DIR/auth.sqlite" ] && cp "$DATA_DIR/auth.sqlite" "$TMP/auth.sqlite"
[ -d "$DATA_DIR/keys" ] && cp -r "$DATA_DIR/keys" "$TMP/keys"
tar -czf "$BACKUP_DIR/backup-$STAMP.tar.gz" -C "$TMP" .
rm -rf "$TMP"
chmod 600 "$BACKUP_DIR/backup-$STAMP.tar.gz"
# Prune old backups beyond KEEP
ls -1t "$BACKUP_DIR"/backup-*.tar.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "backup ok: backup-$STAMP.tar.gz"
