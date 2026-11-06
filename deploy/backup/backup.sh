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

# Cópia externa no Google Cloud Storage: BACKUP_GCS_BUCKET=gs://bucket[/pasta]
# BACKUP_GCS_KEY = chave JSON de uma conta de serviço com permissão de gravação no bucket (opcional na VM com escopo de escrita)
if [ -n "${BACKUP_GCS_BUCKET:-}" ] && command -v gcloud >/dev/null; then
  export CLOUDSDK_CONFIG="${BACKUP_GCS_CONFIG:-/root/.config/vml-backup-gcloud}"
  if [ -n "${BACKUP_GCS_KEY:-}" ] && ! gcloud auth list --format='value(account)' 2>/dev/null | grep -q .; then
    gcloud auth activate-service-account --key-file="$BACKUP_GCS_KEY" --quiet
  fi
  gcloud storage cp --quiet "$FILE" "$FILE.sha256" "${BACKUP_GCS_BUCKET%/}/"
  # .env guarda APP_ENCRYPTION_KEY: sem ela as credenciais cifradas do banco não podem ser lidas
  gcloud storage cp --quiet .env "${BACKUP_GCS_BUCKET%/}/env/.env"
  echo "$(date -Is) cópia externa ok: ${BACKUP_GCS_BUCKET%/}/$(basename "$FILE")"
fi
