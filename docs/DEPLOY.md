# Deploy na VPS — leads.votemais.online

Recomendado: VPS Ubuntu 24.04, 2 vCPU / 4 GB RAM / 40 GB SSD (com SearXNG: 4 GB+).

## 1. DNS

Crie um registro **A** (e **AAAA**, se houver IPv6) `leads.votemais.online → IP da VPS`. Aguarde a propagação antes de subir o Caddy (ele emite o certificado TLS automaticamente).

## 2. Servidor

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install ca-certificates curl git ufw
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

## 3. Código e configuração

```bash
sudo mkdir -p /opt/votemais-leads && sudo chown $USER /opt/votemais-leads
git clone <url-do-repositório> /opt/votemais-leads && cd /opt/votemais-leads
cp .env.example .env
```

Edite `.env`:

```dotenv
NODE_ENV=production
APP_URL=https://leads.votemais.online
TRUST_PROXY=true
APP_ENCRYPTION_KEY=<openssl rand -hex 32>
POSTGRES_USER=votemais
POSTGRES_PASSWORD=<senha forte>
POSTGRES_DB=votemais_leads
DATABASE_URL=postgres://votemais:<senha forte>@postgres:5432/votemais_leads
REDIS_URL=redis://redis:6379
SEARXNG_SECRET=<openssl rand -hex 32>
ADMIN_EMAIL=voce@votemais.online
ADMIN_PASSWORD=<mín. 12, maiúscula, minúscula, número>
```

> Guarde `APP_ENCRYPTION_KEY` e a senha do banco em um cofre (ex.: gerenciador de senhas). Perder a chave obriga a recadastrar as credenciais das integrações.

## 4. Subir

```bash
docker compose build
docker compose --profile searxng up -d     # sem SearXNG: docker compose up -d
docker compose ps
docker compose logs -f migrate api worker
```

O serviço `migrate` aplica as migrations e o seed (categorias, configurações e o administrador) e encerra; `api` e `worker` sobem em seguida. Acesse <https://leads.votemais.online> e faça login.

Após o primeiro login: remova `ADMIN_PASSWORD` do `.env` (o seed só cria o admin quando não há usuários).

## 5. Configurar no painel

1. **Integrações**: SearXNG (`http://searxng:8080`) e/ou Brave/Serper/Tavily; Anthropic.
2. **Automações**: horários, dias, limites (meta inicial 20–50 qualificados/dia), ordem dos provedores.
3. **Pesquisas → Nova pesquisa** para validar uma rodada manual.

## Atualizações

```bash
cd /opt/votemais-leads
./deploy/backup/backup.sh
git pull
docker compose build
docker compose up -d          # migrate roda antes de api/worker
docker image prune -f
```

## Escalar workers

```bash
docker compose up -d --scale worker=2
```

Ajuste também "Pesquisas simultâneas" em Automações. Respeite os limites dos provedores.

## Alternativa sem Docker (systemd + Nginx)

1. Instale Node 22, pnpm, PostgreSQL 16, Redis 7 e Nginx.
2. Usuário de serviço: `sudo useradd -r -m -d /opt/votemais-leads vml`.
3. Build:
   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter server build
   API_INTERNAL_URL=http://127.0.0.1:4000 pnpm --filter web build
   cp -r web/.next/static web/.next/standalone/web/.next/static
   cp -r web/public web/.next/standalone/web/public
   node server/dist/db/migrate.js && node server/dist/db/seed.js
   ```
   Com `.env` na raiz: `DATABASE_URL=postgres://...@127.0.0.1/...`, `REDIS_URL=redis://127.0.0.1:6379`, `API_HOST=127.0.0.1`.
4. `sudo cp deploy/systemd/*.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now votemais-leads-api votemais-leads-worker votemais-leads-web`
5. Nginx: `deploy/nginx/leads.votemais.online.conf` + `sudo certbot --nginx -d leads.votemais.online`.

## Observabilidade

- Painel: **Logs do sistema**, **Central de automações** (filas, falhas, reexecução), **Consumo e custos**.
- Contêineres: `docker compose logs -f api worker` (JSON estruturado via pino).
- Saúde: `GET /api/health` (público) e indicador de status no topo do painel (banco, Redis, workers, IA).
