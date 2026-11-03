# Auditoria final

Data: 03/11/2026. Verificação feita por: testes automatizados, typecheck, builds de produção, execução local da stack completa (API + workers + Next.js + PostgreSQL 16 + Redis 7) e navegação automatizada (Playwright) por todas as páginas em tema claro, escuro e mobile.

## Resultado

| Verificação | Status |
| --- | --- |
| `pnpm -r typecheck` (server + web) | ✅ sem erros |
| `pnpm --filter server test` — 10 arquivos, 70 testes | ✅ todos passando |
| `pnpm --filter web build` — 18 rotas | ✅ |
| Bundle de produção do server (`pnpm deploy`) + migrations + API em `NODE_ENV=production` | ✅ |
| 17 páginas do painel sem erros de console/página | ✅ |
| Fluxo WhatsApp (gera link `wa.me/55…?text=…`, abre em nova aba, registra histórico e estágio) | ✅ |
| Kanban (arrastar e soltar persiste estágio e histórico) | ✅ |
| `docker compose build` | ⚠️ não executado aqui (ambiente sem daemon Docker). Dockerfiles seguem o mesmo procedimento validado manualmente (`pnpm deploy --legacy --prod`, `next build` standalone) |
| Chamadas reais a Brave/Serper/Tavily/Google/Anthropic | ⚠️ não executadas (sem credenciais). Os conectores seguem as APIs oficiais; o botão **Testar** em Integrações faz a verificação real assim que a chave for informada |

## Requisitos × implementação

| # | Requisito | Onde |
| --- | --- | --- |
| 2 | Categorias padrão + cadastro de novas categorias/palavras-chave | seed (`server/src/db/seed-data.ts`, 32 categorias), página Categorias |
| 3 | Arquitetura de conectores plugáveis, múltiplas fontes, Instagram via busca pública | `server/src/search/connectors/*`, `registry.ts` |
| 3 | Pesquisa contextual/progressiva gerada pela IA | `followup_queries`/`enrichment_queries` → jobs `followup` com `context_event_id` e profundidade limitada |
| 3 | 26 UFs + DF, filtros por região/UF/cidade/categoria/datas/ano/tipo de organizador | `lib/regions.ts`, `services/leads.ts`, página Leads |
| 4 | Organizador, empresa, responsável, Instagram, site, WhatsApp, telefone, e-mail, cidade/UF com fonte por campo | `organizers.field_sources`, `events.field_sources`, `contacts.source_url/source_excerpt` |
| 4 | Não inventar dados; campo vazio = "não localizado" | `groundExtraction()` + UI |
| 5 | Score 0–100, potencial, justificativa, probabilidade de votação, fatos × hipóteses, qualidade dos dados | `ai/classification.ts`, `services/analysis.ts` |
| 6 | Mensagens personalizadas, variadas, sem genéricos, editáveis | `ai/messages.ts` (4 estilos, validação), composer |
| 7 | WhatsApp por link oficial, texto codificado, envio manual; atalhos Instagram/site/e-mail | `lib/whatsapp.ts`, `POST /api/leads/:id/open` |
| 8 | Dashboard com 12 indicadores e 6 gráficos, dados reais | `services/stats.ts`, página Dashboard |
| 9 | Tabela, filtros e todas as ações de leads, CSV | página Leads, `routes/leads.ts` |
| 10 | Kanban com 9 etapas, drag-and-drop, histórico, lembretes | página Pipeline, `contact_history`, `follow_ups` |
| 11 | Pesquisa diária com horários/dias, concorrência, limite diário, rotação, retomada, sem duplicados | `services/planner.ts`, `scheduler.ts`, `maintenance.ts` |
| 11 | Atualização automática: disponibilidade, contatos, cancelamentos, novas edições, recorrência, última verificação | `refreshEvents()` |
| 11 | Mensagens geradas após qualificação, regeneração, follow-up sugerido; nenhum envio automático | `analysis.ts`, `processDueFollowUps()` |
| 12 | Central de controle: execuções, andamento, falhas, resultados, aprovados, duplicados, tempo médio, consumo, custos; pausar/retomar/cancelar/reexecutar/logs/limites | página Automações, Pesquisas, Logs, Consumo |
| 13 | Chaves cifradas no backend, indicador de conexão, pendências explícitas | `services/integrations.ts`, página Integrações |
| 14–15 | Stack e entidades solicitadas, relacionamentos, constraints, índices | `server/src/db/schema.ts`, `server/drizzle/` |
| 16 | Segurança e LGPD | [SECURITY.md](SECURITY.md) |
| 18 | 17 páginas | `web/src/app/(app)/*`, `web/src/app/login` |
| 20 | Testes e documentação | `server/test/*`, `docs/*` |

## Limitações conhecidas e decisões

- **Sem IA configurada não há criação de leads**: por regra do projeto (não simular IA), resultados ficam "Aguardando IA" e podem ser reprocessados depois.
- **Conteúdo da página enviado à IA** é limitado a ~18 mil caracteres por página para controlar custo; páginas maiores têm o final ignorado.
- **Sites que exigem JavaScript** para exibir conteúdo são lidos apenas pelo HTML inicial (sem navegador headless), e o título/trecho do resultado de busca continua sendo usado.
- **Instagram**: somente dados presentes no resultado público de busca (perfil, título, trecho). Números publicados apenas dentro do Instagram não são coletados.
- **WhatsApp**: celulares encontrados sem menção a WhatsApp são exibidos como "não confirmado como WhatsApp"; o botão permite abrir mesmo assim, com aviso.
- **Google Custom Search** está em descontinuação pelo Google; **Bing Web Search API** foi descontinuada e não é oferecida.
- **SearXNG** usa a imagem `searxng/searxng:latest`; fixe uma tag após validar na sua VPS.
- Custos de provedores de pesquisa são estimativas com o preço configurado por 1.000 consultas; custos de IA usam a tabela oficial por modelo.
