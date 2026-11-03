# VoteMais Leads

Plataforma **interna** de prospecção comercial da VoteMais. Descobre continuamente organizadores de eventos em todo o Brasil (concursos de beleza, rainhas de rodeio/expo/festa, premiações "Melhores do Ano", concursos com votação popular etc.), identifica quem organiza, coleta **apenas contatos comerciais públicos com fonte registrada**, classifica a oportunidade com IA e prepara mensagens personalizadas para abordagem manual pelo WhatsApp.

> Produto divulgado: <https://votemais.online> · Painel: <https://leads.votemais.online>
> Nenhuma mensagem é enviada automaticamente. O sistema abre o WhatsApp (`wa.me`) com o texto pronto para você revisar e enviar.

## Fluxo diário

1. Acesse o painel → **Dashboard** / **Leads** (filtro "Qualificados").
2. Abra o lead, confira fatos × hipóteses e as fontes de cada dado.
3. **Abrir WhatsApp** → revise/edite a mensagem gerada → envie manualmente.
4. **Registrar contato** → o lead vai para *Contatado* e um follow-up é agendado.
5. Atualize o estágio no **Pipeline** (Kanban com arrastar e soltar).

## Stack

| Camada | Tecnologias |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, componentes no padrão shadcn/ui (Radix), TanStack Query, Recharts, dnd-kit |
| Backend | Node.js 22, Fastify 5, TypeScript, Zod, Drizzle ORM |
| Dados | PostgreSQL 16 (migrations, índices, constraints, FKs) |
| Processamento | Redis 7 + BullMQ (workers independentes, agendamento, retry com backoff, concorrência) |
| IA | Anthropic Claude (saída estruturada validada por Zod + validação factual determinística) |
| Pesquisa | Conectores plugáveis: SearXNG (self-hosted), Brave Search API, Serper.dev, Tavily, Google Programmable Search |
| Enriquecimento | BrasilAPI (CNPJ público) · n8n (webhook opcional) |

## Início rápido (desenvolvimento)

```bash
pnpm install
cp .env.example server/.env        # ajuste DATABASE_URL, REDIS_URL, APP_ENCRYPTION_KEY, ADMIN_*
pnpm db:migrate && pnpm db:seed
pnpm --filter server dev           # API  :4000
pnpm --filter server dev:worker    # workers
pnpm --filter web dev              # painel :3000
```

Depois, em **Integrações**, cadastre ao menos um provedor de pesquisa e a chave da Anthropic.

## Documentação

- [Arquitetura e estrutura de pastas](docs/ARCHITECTURE.md)
- [Configuração do ambiente, variáveis, banco, migrations, workers e Redis](docs/SETUP.md)
- [Integrações e credenciais necessárias](docs/INTEGRATIONS.md)
- [Deploy na VPS (leads.votemais.online)](docs/DEPLOY.md)
- [Backup e restauração](docs/BACKUP.md)
- [Segurança e LGPD](docs/SECURITY.md)
- [Auditoria final e limitações conhecidas](docs/AUDIT.md)

## Testes

```bash
# requer PostgreSQL e Redis locais (ou TEST_DATABASE_URL / TEST_REDIS_URL)
pnpm test
```

Cobrem autenticação, CSRF, lockout, CRUD e filtros de leads, deduplicação, pesquisa com fallback entre provedores, cache de consultas, processamento em filas reais (BullMQ), classificação por IA, validação anti-alucinação, geração e validação de mensagens, links do WhatsApp, pipeline/estágios, follow-ups, automações/agendamento, supressão/LGPD, CSV e tratamento de erros.
