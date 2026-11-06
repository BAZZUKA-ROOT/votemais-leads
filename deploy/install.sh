#!/usr/bin/env bash
# =============================================================================
# VoteMais Leads — instalador de um comando (Ubuntu 22.04/24.04, x86_64 ou ARM)
#
#   curl -fsSL https://raw.githubusercontent.com/BAZZUKA-ROOT/votemais-leads/main/deploy/install.sh \
#     | sudo bash -s -- --email voce@votemais.online [--domain leads.votemais.online] [--ollama]
#
# Sem VPS (no seu computador, via Cloudflare Tunnel — grátis, HTTPS, sem abrir portas):
#     ... | sudo bash -s -- --email voce@votemais.online --domain leads.votemais.online --cloudflare-token TOKEN
#
# Instala Docker, baixa o projeto em /opt/votemais-leads, gera senhas/chaves,
# sobe PostgreSQL, Redis, SearXNG, API, workers, painel e Caddy, configura a
# busca gratuita (SearXNG) e dispara a primeira rodada de pesquisa.
# Pode ser executado de novo para atualizar (mantém .env e dados).
# =============================================================================
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/BAZZUKA-ROOT/votemais-leads.git}"
DIR="${DIR:-/opt/votemais-leads}"
EMAIL=""
DOMAIN=""
CF_TOKEN=""
OLLAMA=0
OLLAMA_MODEL="${OLLAMA_MODEL:-qwen2.5:7b}"
SKIP_DOCKER_INSTALL="${SKIP_DOCKER_INSTALL:-0}"
SKIP_FIREWALL="${SKIP_FIREWALL:-0}"
SKIP_BUILD="${SKIP_BUILD:-0}"
FORCE_BUILD="${FORCE_BUILD:-0}"
HTTP_PORT="${HTTP_PORT:-80}"

while [ $# -gt 0 ]; do
  case "$1" in
    --email) EMAIL="$2"; shift 2 ;;
    --domain) DOMAIN="$2"; shift 2 ;;
    --ollama) OLLAMA=1; shift ;;
    --cloudflare-token) CF_TOKEN="$2"; shift 2 ;;
    --build) FORCE_BUILD=1; shift ;;
    --dir) DIR="$2"; shift 2 ;;
    -h|--help) sed -n 2,13p "$0"; exit 0 ;;
    *) echo "Opção desconhecida: $1" >&2; exit 1 ;;
  esac
done

log() { printf '\n\033[1;35m▶ %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || die "Execute como root (use sudo)."

# ---------------------------------------------------------------- pacotes
if [ "$SKIP_DOCKER_INSTALL" != "1" ]; then
  log "Instalando dependências"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl git openssl cron >/dev/null
  if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
    log "Instalando Docker"
    curl -fsSL https://get.docker.com | sh
  fi
  systemctl enable --now docker >/dev/null 2>&1 || true
fi
command -v docker >/dev/null || die "Docker não encontrado."

# ------------------------------------------------------------- swap (VMs pequenas)
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$MEM_MB" -lt 3500 ] && ! swapon --show | grep -q . && [ "$SKIP_DOCKER_INSTALL" != "1" ]; then
  log "Memória baixa (${MEM_MB} MB): criando 4 GB de swap"
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
if [ "$OLLAMA" = "1" ] && [ "$MEM_MB" -lt 10000 ]; then
  echo "Aviso: ${MEM_MB} MB de RAM é pouco para ${OLLAMA_MODEL}. O Ollama ficará desativado; o modo regras (gratuito) continua ativo."
  OLLAMA=0
fi

# ---------------------------------------------------------------- código
log "Baixando o VoteMais Leads em $DIR"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull --ff-only
else
  git clone --depth 1 "$REPO_URL" "$DIR"
fi
cd "$DIR"

# ---------------------------------------------------------------- .env
PUBLIC_IP=$(curl -fsS -m 8 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
if [ ! -f .env ]; then
  [ -n "$EMAIL" ] || die "Informe --email para o administrador (primeira instalação)."
  log "Gerando .env com senhas aleatórias"
  ADMIN_PASSWORD="Vml$(openssl rand -hex 8)A9"
  PGPASS=$(openssl rand -hex 16)
  if [ -n "$DOMAIN" ]; then APP_URL="https://$DOMAIN"; SECURE=true; else APP_URL="http://$PUBLIC_IP"; SECURE=false; fi
  cat > .env <<EOF
NODE_ENV=production
APP_URL=$APP_URL
API_HOST=0.0.0.0
API_PORT=4000
TRUST_PROXY=true
COOKIE_SECURE=$SECURE
LOG_LEVEL=info
SESSION_TTL_HOURS=72
APP_ENCRYPTION_KEY=$(openssl rand -hex 32)
POSTGRES_USER=votemais
POSTGRES_PASSWORD=$PGPASS
POSTGRES_DB=votemais_leads
DATABASE_URL=postgres://votemais:$PGPASS@postgres:5432/votemais_leads
REDIS_URL=redis://redis:6379
QUEUE_PREFIX=vml
API_INTERNAL_URL=http://api:4000
SEARXNG_SECRET=$(openssl rand -hex 32)
VML_API_TOKEN=$(openssl rand -hex 32)
ADMIN_EMAIL=$EMAIL
ADMIN_PASSWORD=$ADMIN_PASSWORD
ADMIN_NAME=Administrador
DOMAIN=$DOMAIN
HTTP_PORT=$HTTP_PORT
CADDYFILE=./deploy/caddy/Caddyfile.generated
CLOUDFLARE_TUNNEL_TOKEN=$CF_TOKEN
COMPOSE_PROFILES=searxng$([ "$OLLAMA" = "1" ] && echo ",ollama")$([ -n "$CF_TOKEN" ] && echo ",cloudflare")
$( [ "$MEM_MB" -lt 2500 ] && printf 'NODE_OPTIONS=--max-old-space-size=200\nPG_SHARED_BUFFERS=48MB\nPG_MAX_CONNECTIONS=30\nDB_POOL_MAX=4\n' )
EOF
  chmod 600 .env
  FIRST_INSTALL=1
else
  FIRST_INSTALL=0
  log "Mantendo .env existente"
fi
CLI_DOMAIN="$DOMAIN"
CLI_CF_TOKEN="$CF_TOKEN"
set -a; . ./.env; set +a
# --cloudflare-token numa reinstalação: ativa o túnel mantendo senhas e dados
if [ -n "$CLI_CF_TOKEN" ] && [ "$CLI_CF_TOKEN" != "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]; then
  log "Ativando Cloudflare Tunnel"
  grep -q '^CLOUDFLARE_TUNNEL_TOKEN=' .env || echo "CLOUDFLARE_TUNNEL_TOKEN=" >> .env
  sed -i -e "s|^CLOUDFLARE_TUNNEL_TOKEN=.*|CLOUDFLARE_TUNNEL_TOKEN=$CLI_CF_TOKEN|" .env
  grep -q '^COMPOSE_PROFILES=.*cloudflare' .env || sed -i -e "s|^COMPOSE_PROFILES=\(.*\)|COMPOSE_PROFILES=\1,cloudflare|" .env
  set -a; . ./.env; set +a
fi
# --domain numa reinstalação: atualiza URL/HTTPS mantendo senhas e dados
if [ -n "$CLI_DOMAIN" ] && [ "$CLI_DOMAIN" != "${DOMAIN:-}" ]; then
  log "Configurando domínio $CLI_DOMAIN (HTTPS automático)"
  sed -i -e "s|^DOMAIN=.*|DOMAIN=$CLI_DOMAIN|" -e "s|^APP_URL=.*|APP_URL=https://$CLI_DOMAIN|" -e "s|^COOKIE_SECURE=.*|COOKIE_SECURE=true|" .env
  set -a; . ./.env; set +a
fi

# ---------------------------------------------------------------- Caddy
# Com Cloudflare Tunnel o HTTPS é feito pelo Cloudflare: o Caddy atende HTTP interno.
if [ -n "${DOMAIN:-}" ] && [ -z "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]; then SITE="$DOMAIN"; else SITE=":80"; fi
cat > deploy/caddy/Caddyfile.generated <<EOF
$SITE {
	encode zstd gzip
	header {
		X-Robots-Tag "noindex, nofollow"
		-Server
	}
	@api path /api/*
	handle @api {
		reverse_proxy api:4000
	}
	handle {
		reverse_proxy web:3000
	}
}
EOF

# ---------------------------------------------------------------- firewall do SO
if [ "$SKIP_FIREWALL" != "1" ]; then
  # Imagens Ubuntu da Oracle Cloud vêm com iptables bloqueando 80/443.
  if command -v iptables >/dev/null && iptables -L INPUT -n 2>/dev/null | grep -q REJECT; then
    log "Liberando portas 80 e 443 no iptables"
    for p in 80 443; do
      iptables -C INPUT -p tcp --dport $p -j ACCEPT 2>/dev/null || iptables -I INPUT 5 -p tcp --dport $p -j ACCEPT
    done
    command -v netfilter-persistent >/dev/null && netfilter-persistent save >/dev/null 2>&1 || true
  fi
  command -v ufw >/dev/null && ufw status | grep -q active && { ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; } || true
fi

# ---------------------------------------------------------------- subir
if [ "$SKIP_BUILD" != "1" ]; then
  if [ "$FORCE_BUILD" != "1" ] && docker compose pull -q migrate web >/dev/null 2>&1; then
    log "Imagens prontas baixadas (ghcr.io)"
  else
    log "Construindo imagens (primeira vez leva alguns minutos)"
    docker compose build
  fi
fi
log "Subindo serviços"
docker compose up -d

log "Aguardando a API"
for i in $(seq 1 90); do
  if docker compose exec -T api wget -qO- http://127.0.0.1:4000/api/health >/dev/null 2>&1; then break; fi
  sleep 3
  [ "$i" -eq 90 ] && { docker compose logs --tail 80 migrate api; die "API não respondeu."; }
done

# api METODO CAMINHO [JSON] — chama a API de dentro do contêiner com o token
api() {
  docker compose exec -T -e M="$1" -e P="$2" -e B="${3:-}" api node -e '
    fetch("http://127.0.0.1:4000" + process.env.P, { method: process.env.M,
      headers: { authorization: "Bearer " + process.env.VML_API_TOKEN, "content-type": "application/json" },
      body: process.env.B || undefined })
    .then(async (r) => { const t = await r.text(); if (!r.ok) { console.error(r.status, t); process.exit(1); } })
    .catch((e) => { console.error(e.message); process.exit(1); });'
}

log "Configurando busca gratuita (SearXNG)"
api PUT /api/integrations/searxng '{"enabled":true,"config":{"baseUrl":"http://searxng:8080"}}' || echo "Aviso: teste do SearXNG falhou agora; confira em Integrações."

if [ "$OLLAMA" = "1" ]; then
  log "Baixando modelo local $OLLAMA_MODEL (pode levar alguns minutos)"
  docker compose exec -T ollama ollama pull "$OLLAMA_MODEL" >/dev/null
  api PUT /api/integrations/ollama "{\"enabled\":true,\"config\":{\"baseUrl\":\"http://ollama:11434\",\"model\":\"$OLLAMA_MODEL\"}}" || true
  api PUT /api/automation/settings '{"concurrency":1}' || true
fi

if [ "$FIRST_INSTALL" = "1" ]; then
  log "Disparando a primeira rodada de pesquisa"
  api POST /api/automation/run-now '{}' || true
fi

# ---------------------------------------------------------------- backup diário
CRON="40 3 * * * cd $DIR && ./deploy/backup/backup.sh >> /var/log/vml-backup.log 2>&1"
( crontab -l 2>/dev/null | grep -v 'deploy/backup/backup.sh'; echo "$CRON" ) | crontab - 2>/dev/null || true

# ---------------------------------------------------------------- resumo
URL="${APP_URL}"
cat <<EOF

=====================================================================
 VoteMais Leads está no ar
=====================================================================
 Painel:        $URL
 Login:         ${ADMIN_EMAIL}
 Senha:         $( [ "$FIRST_INSTALL" = "1" ] && echo "$ADMIN_PASSWORD  (troque em Configurações → Conta)" || echo "(inalterada)")
 Busca:         SearXNG (grátis)  ·  Análise: $( [ "$OLLAMA" = "1" ] && echo "Ollama $OLLAMA_MODEL" || echo "modo regras (grátis)")
 Automação:     rodadas diárias 06:00 e 13:00 (seg–sáb) — ajuste em Automações
 Token /harvey: veja VML_API_TOKEN em $DIR/.env (não compartilhe)
 Backup:        diário às 03:40 em $DIR/backups
 Atualizar:     sudo bash $DIR/deploy/install.sh
=====================================================================
EOF
if [ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]; then
  echo " Cloudflare Tunnel ativo: no painel Zero Trust, a rota pública deve apontar para http://caddy:80"
elif [ -z "${DOMAIN:-}" ]; then
  echo " Sem domínio: acesso por HTTP no IP. Para HTTPS, crie o registro A (leads.votemais.online → $PUBLIC_IP)"
  echo " e rode: sudo bash $DIR/deploy/install.sh --domain leads.votemais.online"
fi
