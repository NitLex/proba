#!/usr/bin/env bash
# Backup SQLite DB. Put in cron: 0 3 * * * /var/www/arbtrack/scripts/backup-db.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="$ROOT/server/data/arbtrack.db"
DEST="${BACKUP_DIR:-$ROOT/server/data/backups}"
KEEP="${BACKUP_KEEP:-14}"

mkdir -p "$DEST"
if [ ! -f "$DB" ]; then
  echo "DB not found: $DB"
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$DEST/arbtrack-$STAMP.db"
cp "$DB" "$OUT"
# also copy wal if present for consistency attempt
[ -f "$DB-wal" ] && cp "$DB-wal" "$OUT-wal" || true
[ -f "$DB-shm" ] && cp "$DB-shm" "$OUT-shm" || true

# prune old
ls -1t "$DEST"/arbtrack-*.db 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "Backup saved: $OUT"
