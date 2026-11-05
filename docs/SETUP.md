# Configuração do ambiente

## Requisitos

- Node.js **22+** e pnpm **10+** (`corepack enable`)
- PostgreSQL **16**
- Redis **7** (persistência AOF recomendada; política `noeviction`)
- Opcional: Docker + Docker Compose v2 (deploy), SearXNG

## Instalação

```bash
git clone <repo> votemais-leads && cd votemais-leads
pnpm install
cp .env.example server/.env
openssl rand -hex 32          # cole em APP_ENCRYPTION_KEY
```

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `DATABASE_URL` | sim | `postgres://usuario:senha@host:5432/votemais_leads` |
| `REDIS_URL` | sim | `redis://host:6379` (pode incluir senha: `redis://:senha@host:6379`) |
| `APP_ENCRYPTION_KEY` | sim | 32 bytes (hex 64 caracteres ou base64). Cifra as credenciais das integrações. **Guarde com segurança**: sem ela as chaves salvas não podem ser decifradas |
| `APP_URL` | sim (prod) | `https://leads.votemais.online` — usada na verificação de origem (CSRF) |
| `NODE_ENV` | — | `production` em produção (ativa cookies `Secure` e verificação de origem) |
| `API_HOST` / `API_PORT` | — | padrão `0.0.0.0:4000` |
| `TRUST_PROXY` | — | `true` atrás de Caddy/Nginx |
| `SESSION_TTL_HOURS` | — | validade da sessão (renovação deslizante). Padrão 72 |
| `COOKIE_SECURE` | — | força cookie `Secure` (padrão: `true` em produção) |
| `LOG_LEVEL` | — | `info` |
| `QUEUE_PREFIX` | — | prefixo das chaves BullMQ no Redis (`vml`) |
| `CRAWLER_USER_AGENT` | — | identificação do robô nas requisições a sites |
| `DB_POOL_MAX` | — | conexões por processo (padrão 10) |
| `API_INTERNAL_URL` | web (build) | destino dos rewrites `/api/*` do Next. Padrão `http://127.0.0.1:4000` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | seed | cria o primeiro administrador se não houver usuários |
| `VML_API_TOKEN` | — | token Bearer (≥ 32 caracteres) para a skill `/harvey` e automações; vazio desativa |
| `ANALYSIS_DEBOUNCE_MS` | — | atraso para agrupar reanálises do mesmo lead (padrão 20000) |

Credenciais de serviços externos **não** ficam no `.env`: são cadastradas em **Integrações** e gravadas cifradas no banco. Veja [INTEGRATIONS.md](INTEGRATIONS.md).

## Banco de dados e migrations

```bash
pnpm db:migrate        # aplica server/drizzle/*.sql (idempotente)
pnpm db:seed           # categorias padrão, automação, integrações e admin (se ADMIN_* definidos)
pnpm --filter server admin:create email@dominio "Nome"   # cria admin interativamente
```

Alterou `server/src/db/schema.ts`? Gere uma nova migration e versione o SQL:

```bash
pnpm db:generate       # drizzle-kit generate → server/drizzle/NNNN_*.sql
pnpm db:migrate
```

Nunca edite uma migration já aplicada em produção; crie outra.

## Executando

```bash
pnpm --filter server dev          # API com reload
pnpm --filter server dev:worker   # workers com reload
pnpm --filter web dev             # http://localhost:3000
```

Produção sem Docker:

```bash
pnpm --filter server build && pnpm --filter web build
node server/dist/db/migrate.js
node server/dist/api/server.js
node server/dist/workers/main.js
```

## Workers

`server/src/workers/index.ts` inicia um `Worker` BullMQ por fila:

| Fila | Função | Concorrência |
| --- | --- | --- |
| `plan` | planeja rodadas (categorias × estados) | 1 |
| `search` | executa consultas nos provedores (limiter: 30/min) | `concurrency` das configurações |
| `process` | baixa páginas, extrai, valida e persiste | `concurrency` |
| `analyze` | classificação por IA | `concurrency/2` |
| `message` | geração de mensagens | 2 |
| `maintenance` | atualização, retenção, retomada, follow-ups | 1 |

- Retry: 3 tentativas com backoff exponencial (30 s, 60 s, 120 s). Erros não recuperáveis (integração ausente, recusa da IA) falham imediatamente e ficam visíveis na Central de automações para reexecução.
- A concorrência é recarregada a cada minuto a partir das configurações.
- Desligamento gracioso: `SIGTERM` aguarda as tarefas ativas.
- Vários processos worker podem rodar em paralelo (mesmo Redis/Postgres).
- Heartbeat em `vml:worker:heartbeat` (exibido no indicador de status do painel).

Agendamentos (BullMQ Job Schedulers, sincronizados a cada alteração nas configurações):

| Agendamento | Padrão |
| --- | --- |
| Rodadas de pesquisa | horários × dias configurados (fuso `America/Sao_Paulo`) |
| Atualização de eventos | diário 03:10 |
| Retenção LGPD | diário 04:20 |
| Retomada de pesquisas interrompidas | a cada 10 min |
| Follow-ups vencidos | a cada 30 min |

## Redis

- Use instância dedicada (ou `db` dedicado) — BullMQ exige `maxmemory-policy noeviction`.
- Ative persistência (`appendonly yes`) para não perder filas em reinícios.
- Em produção restrinja a rede (não exponha a porta 6379) e, se fora do Docker, configure `requirepass`.

## Testes

```bash
createdb votemais_leads_test
pnpm test     # usa TEST_DATABASE_URL (padrão postgres://postgres@127.0.0.1:5432/votemais_leads_test) e Redis db 1
```
