# Arquitetura

```
                       ┌──────────────── VPS ────────────────────────────────────────────┐
 navegador ──HTTPS──►  │ Caddy/Nginx ──/api/*──► API Fastify (:4000) ──┐                  │
                       │        └──────/*──────► Next.js (:3000)       │                  │
                       │                                              ▼                  │
                       │   Workers BullMQ ◄──── Redis 7 ────► filas / locks / rate limit │
                       │        │                                     ▲                  │
                       │        ▼                                     │                  │
                       │   PostgreSQL 16  ◄──────────────────────────┘                  │
                       │   SearXNG (opcional, rede interna)                              │
                       └───────┬─────────────────────────────────────────────────────────┘
                               ▼
         APIs externas: Brave · Serper · Tavily · Google CSE · Anthropic · BrasilAPI · n8n
         Sites públicos de eventos (respeitando robots.txt)
```

- **API** (`server/src/api`): REST, sessão por cookie httpOnly, CSRF, rate limit em Redis, validação Zod, Helmet.
- **Workers** (`server/src/workers`): processo separado, escalável horizontalmente. Toda a lógica de negócio vive em `server/src/services` e é compartilhada.
- **Frontend** (`web/`): Next.js com páginas client-side e React Query; `/api/*` é encaminhado à API (mesma origem → cookies `SameSite=Lax`, sem CORS).
- **n8n** é opcional e apenas recebe eventos (lead qualificado, follow-ups vencidos). A lógica central fica no backend.

## Pipeline de descoberta

```
[agendador BullMQ] ─► plan ─► cria SearchJob + SearchQueries (categoria × estado, rotação por cursor)
                               │
                               ▼
                         search (por consulta)
                           · cache: não repete a mesma consulta por N dias
                           · provedor principal → fallback (ordem configurável)
                           · registra consumo/custo
                           · grava SearchResults (URL canônica, dedup por hash)
                           · relevância heurística (palavras-chave, negativos, domínios bloqueados, ano)
                               │ relevantes
                               ▼
                         process (por resultado)
                           · limite diário de leads (adiado para o dia seguinte)
                           · fetch da página (robots.txt, SSRF guard, 2,5 MB, 15 s, throttle por domínio)
                             Instagram: apenas título/trecho do resultado de busca (não acessa a plataforma)
                           · extração determinística: telefones BR, wa.me, e-mails, @instagram, JSON-LD Event
                           · IA (extração estruturada) → VALIDAÇÃO FACTUAL (groundExtraction)
                           · CNPJ publicado → BrasilAPI (opcional)
                           · persistDiscovery: dedup de evento/organizador, fontes, contatos, lead
                           · pesquisa progressiva: consultas sugeridas pela IA (profundidade limitada)
                               ▼
                         analyze (por lead, com debounce)
                           · dossiê com fatos verificados → IA: score 0–100, potencial, prob. de votação,
                             justificativa, fatos × hipóteses
                           · checklist e qualidade dos dados calculados de forma determinística
                           · qualificado → estágio "Qualificado", enriquecimento, notificação n8n
                               ▼
                         message (por lead)
                           · mensagem curta personalizada, estilos variados, regras validadas
                           · NUNCA envia — fica como rascunho para revisão
```

**Manutenção** (`maintenance`): atualização de eventos (disponibilidade do site, novos contatos, cancelamento com evidência literal, detecção de novas edições), retenção LGPD, retomada de pesquisas interrompidas (heartbeat), follow-ups vencidos.

### Garantias contra informações inventadas

`server/src/ai/extraction.ts → groundExtraction()`:

- Contatos só podem ser escolhidos **por índice** de uma lista extraída literalmente do HTML/resultado.
- Nome do evento precisa ter ≥ 60% dos termos presentes na fonte; caso contrário o resultado é descartado.
- Organizador, responsável, empresa, cidade, edição, evidência de votação e CNPJ são descartados se não aparecerem no texto.
- Datas/ano inexistentes na fonte são removidos; votação "confirmada" sem evidência literal vira "não confirmada".
- Campos descartados ficam registrados (`ai_analyses.output.dropped`) e visíveis no detalhe do lead.
- Mensagens são revalidadas: link obrigatório, sem placeholders, sem afirmar votação não confirmada, tamanho.

### Deduplicação

- Resultados: hash da URL canônica (sem utm/fragmento/www).
- Evento: `fingerprint = sha256(nome-base sem ano/edição/stopwords | UF | cidade | ano)` + buscas alternativas por nome-base+UF+ano, site+ano, Instagram+ano.
- Organizador: @instagram, domínio próprio (ignora domínios genéricos como instagram.com, sympla), telefone comercial já vinculado, nome normalizado+UF.
- Contatos: único por (evento, tipo, valor normalizado). Telefones em E.164 (`55DDDNUMERO`).

## Estrutura de pastas

```
.
├── server/                      API + workers (Node/TypeScript)
│   ├── drizzle/                 migrations SQL versionadas
│   ├── scripts/create-admin.ts  criação interativa de administrador
│   ├── src/
│   │   ├── ai/                  cliente Anthropic, extração, classificação, mensagens
│   │   ├── api/                 app Fastify, plugins (auth/CSRF/erros), server.ts
│   │   ├── config/env.ts        validação das variáveis de ambiente
│   │   ├── db/                  schema Drizzle, client, migrate, seed
│   │   ├── extraction/          fetch seguro + extração de contatos/JSON-LD
│   │   ├── lib/                 normalização, crypto, regiões, logger, whatsapp
│   │   ├── queue/               conexões Redis e filas BullMQ
│   │   ├── routes/              rotas REST
│   │   ├── search/              conectores, gerador de consultas, relevância
│   │   ├── services/            regras de negócio (discovery, leads, analysis, planner…)
│   │   └── workers/             processadores BullMQ e entrypoint
│   └── test/                    testes unitários e de integração (Vitest)
├── web/                         painel Next.js
│   └── src/{app,components,lib}
├── deploy/                      caddy, nginx, searxng, systemd, backup
├── docs/                        documentação
└── docker-compose.yml
```

## Modelo de dados

| Tabela | Papel |
| --- | --- |
| `users`, `sessions` | administradores/operadores; sessões com hash do token e CSRF |
| `categories`, `campaigns` | palavras-chave de pesquisa; agrupamento de pesquisas |
| `organizers` | quem organiza (1:N eventos), com `field_sources` por campo |
| `events` | evento/edição, fatos (`confirmed/unconfirmed/not_found/denied`), `fingerprint` único |
| `contacts` | contatos públicos com URL e trecho da fonte, comercial ou não |
| `leads` | oportunidade comercial (1:1 evento), estágio, score, contatos principais denormalizados |
| `lead_sources` | todas as fontes de um evento |
| `search_jobs`, `search_queries`, `search_results` | execução das pesquisas e resultados |
| `ai_analyses` | extrações e classificações (modelo, tokens, custo, checklist, fatos/hipóteses) |
| `generated_messages` | mensagens (rascunho → aberta → enviada/descartada) |
| `contact_history` | histórico de estágios, contatos, notas e eventos do lead |
| `follow_ups` | lembretes |
| `automation_settings` | configuração única da automação |
| `integrations` | provedores e credenciais **cifradas** (AES-256-GCM) |
| `api_usage` | cada chamada externa com custo estimado |
| `system_logs` | logs operacionais e auditoria |
| `suppression_list` | contatos que não devem ser abordados |
