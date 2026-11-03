# Backup e restauração

## O que precisa de backup

| Item | Onde | Observação |
| --- | --- | --- |
| Banco PostgreSQL | volume `pgdata` | todos os dados de negócio |
| `.env` | raiz do projeto | contém `APP_ENCRYPTION_KEY` — sem ela as credenciais cifradas são irrecuperáveis |
| Redis | volume `redisdata` | apenas filas em andamento; pesquisas interrompidas são retomadas automaticamente (não é crítico) |

## Backup automático

```bash
crontab -e
# diário às 03:40, mantém 14 dias
40 3 * * * cd /opt/votemais-leads && ./deploy/backup/backup.sh >> /var/log/vml-backup.log 2>&1
```

Variáveis opcionais: `BACKUP_DIR` (padrão `./backups`), `BACKUP_KEEP_DAYS` (14), `BACKUP_REMOTE` (destino `rclone`, ex.: `b2:meu-bucket/vml`) para cópia fora da VPS — **recomendado**.

Cada arquivo `votemais_leads-AAAAMMDD-HHMMSS.dump` (formato custom do `pg_dump`, compactado) acompanha um `.sha256`.

Sem Docker: `MODE=host ./deploy/backup/backup.sh` (usa `DATABASE_URL` e `pg_dump` do host).

## Restauração

```bash
./deploy/backup/restore.sh backups/votemais_leads-20270115-034000.dump
```

O script verifica o checksum, pede confirmação, para API e workers, executa `pg_restore --clean`, reaplica migrations pendentes e reinicia os serviços.

## Teste de restauração (mensal)

```bash
docker compose exec -T postgres createdb -U votemais vml_restore_test
docker compose exec -T postgres pg_restore -U votemais -d vml_restore_test < backups/<arquivo>.dump
docker compose exec -T postgres psql -U votemais -d vml_restore_test -c "select count(*) from leads"
docker compose exec -T postgres dropdb -U votemais vml_restore_test
```
