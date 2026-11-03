#!/usr/bin/env bash
# Restaura um backup gerado por backup.sh. ATENÇÃO: substitui os dados atuais.
# Uso: ./deploy/backup/restore.sh backups/votemais_leads-AAAAMMDD-HHMMSS.dump
set -euo pipefail
cd "$(dirname "$0")/../.."
FILE="${1:?Informe o arquivo .dump}"
[ -f .env ] && set -a && . ./.env && set +a
[ -f "$FILE.sha256" ] && sha256sum -c "$FILE.sha256"
read -r -p "Isso substituirá o banco ${POSTGRES_DB:-votemais_leads}. Digite RESTAURAR para continuar: " ok
[ "$ok" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }

if [ "${MODE:-docker}" = "host" ]; then
  pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" "$FILE"
else
  docker compose stop api worker
  docker compose exec -T postgres pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$FILE"
  docker compose run --rm migrate
  docker compose start api worker
fi
echo "Restauração concluída."
