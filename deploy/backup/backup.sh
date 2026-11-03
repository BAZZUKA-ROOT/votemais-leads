#!/usr/bin/env bash
# Backup do PostgreSQL (formato custom, compactado) com rotação.
# Uso: ./deploy/backup/backup.sh            (docker compose)
#      MODE=host ./deploy/backup/backup.sh  (Postgres instalado no host; usa DATABASE_URL)
# Cron sugerido (03:40 diário):  40 3 * * * cd /opt/votemais-leads && ./deploy/backup/backup.sh >> /var/log/vml-backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -f .env ] && set -a && . ./.env && set +a
DEST="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DEST"
FILE="$DEST/votemais_leads-$STAMP.dump"

if [ "${MODE:-docker}" = "host" ]; then
  pg_dump --format=custom --no-owner --dbname="$DATABASE_URL" --file="$FILE"
else
  docker compose exec -T postgres pg_dump --format=custom --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB" > "$FILE"
fi

[ -s "$FILE" ] || { echo "Backup vazio: $FILE" >&2; exit 1; }
sha256sum "$FILE" > "$FILE.sha256"
find "$DEST" -name 'votemais_leads-*.dump*' -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) backup ok: $FILE ($(du -h "$FILE" | cut -f1))"

# Cópia externa opcional (rclone configurado previamente): BACKUP_REMOTE=s3:bucket/vml
if [ -n "${BACKUP_REMOTE:-}" ] && command -v rclone >/dev/null; then
  rclone copy "$FILE" "$BACKUP_REMOTE" && rclone copy "$FILE.sha256" "$BACKUP_REMOTE"
fi
