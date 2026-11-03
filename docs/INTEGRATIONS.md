# Integrações e credenciais

Todas as integrações estão implementadas. O que falta é **você fornecer as credenciais** na tela **Integrações** (as chaves são cifradas com AES-256-GCM no backend, nunca retornam ao navegador — apenas `••••1234`). Ao salvar com a integração ativa, o sistema executa um teste real e mostra o status: *Pendente*, *Configurada*, *Conectada* ou *Erro*.

Sem provedor de pesquisa, o planejador registra "nenhum provedor configurado" e não executa. Se você desativar todos os modos de análise (inclusive o modo regras), os resultados ficam em **Aguardando IA** (nenhum lead é criado sem análise) e podem ser reprocessados depois em **Pesquisas → Reprocessar**.

## Mínimo para operar (grátis)

1. **SearXNG** (self-hosted) como provedor de pesquisa.
2. **Modo regras** (já ativo) — ou **Ollama** para IA local gratuita. Veja [FREE.md](FREE.md).

Anthropic e as APIs de busca pagas são opcionais. Prioridade de análise: Anthropic → Ollama → regras.

## Provedores de pesquisa

A ordem de uso é definida em **Automações → Ordem dos provedores**. Se o primeiro falhar (erro 5xx/429/rede), o próximo é usado. Cada chamada é registrada em **Consumo e custos** com o preço configurado (US$ por 1.000 consultas).

### SearXNG (self-hosted, custo zero)

- Suba com `docker compose --profile searxng up -d searxng` (já incluso; acessível só pela rede interna).
- Defina `SEARXNG_SECRET` no `.env` (`openssl rand -hex 32`).
- Em Integrações: **URL base** = `http://searxng:8080` (Docker) ou `http://127.0.0.1:8080` (host).
- `deploy/searxng/settings.yml` habilita o formato JSON, exigido pela API.
- Opcional: restrinja os engines (campo "Engines", ex.: `brave,duckduckgo,mojeek`). Você é responsável por respeitar os termos de cada mecanismo consultado pelo SearXNG; para uso comercial intenso, prefira as APIs oficiais abaixo.

### Brave Search API

- Crie a chave em <https://api-dashboard.search.brave.com/> (plano "Data for Search" ou equivalente).
- Credencial: **Subscription Token** (`X-Subscription-Token`).

### Serper.dev

- Chave em <https://serper.dev/api-key>. Credencial: **API Key**.

### Tavily

- Chave em <https://app.tavily.com/>. Credencial: **API Key** (`tvly-...`).

### Google Programmable Search (Custom Search JSON API)

- **Atenção:** o Google encerrou novos cadastros nessa API e anunciou sua descontinuação. Use apenas se já possui acesso.
- Credenciais: **API Key** (Google Cloud) e **Search Engine ID (`cx`)** de um mecanismo configurado para "Pesquisar na Web inteira".

### Instagram

Não há integração com a API do Instagram. O sistema usa apenas **resultados públicos de busca** (`site:instagram.com ...`) dos provedores acima: título, trecho e o @ do perfil presente na URL. A plataforma não é acessada nem raspada.

> A Bing Web Search API foi descontinuada pela Microsoft em 2025 e por isso não é oferecida.

## Inteligência artificial — Anthropic Claude

- Chave em <https://platform.claude.com/> → API Keys. Credencial: **API Key** (`sk-ant-...`).
- Modelos por função (extração, classificação, mensagens) são configuráveis. Padrão: `claude-opus-5-5` com esforço `low`.
- Custo de referência (US$ por 1M tokens, entrada/saída): Opus 5.5 4/20 · Sonnet 5.5 2/10 · **Haiku 5.5 0,10/0,50**. Para reduzir custo em volume, use Haiku 5.5 para extração e mensagens; o consumo real aparece em **Consumo e custos** (custo por lead qualificado).
- As requisições usam saída estruturada (JSON validado por Zod) e o fallback de recusa do próprio servidor (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`). Recusas são registradas e não geram dados.
- O teste de conexão consulta o modelo configurado (`models.retrieve`).

## IA local gratuita — Ollama

- Sem credencial. URL (`http://ollama:11434` no compose com `--profile ollama`) e modelo (`qwen2.5:7b` recomendado; `llama3.1:8b` alternativa).
- Baixe o modelo antes: `docker compose exec ollama ollama pull qwen2.5:7b`. O botão **Testar** verifica se o modelo está disponível.
- Usa saída estruturada (JSON Schema) e a mesma validação factual. Consumo registrado com custo zero.

## Modo regras (sem IA)

- Ativo por padrão, sem configuração. Detalhes e limitações em [FREE.md](FREE.md).

## Enriquecimento — BrasilAPI (CNPJ)

- Sem credencial; ativa por padrão. Quando a página do evento publica um CNPJ, consulta razão social / nome fantasia na base pública da Receita Federal.
- Desative em Integrações se não quiser chamadas externas adicionais.

## Automação — n8n (opcional)

- Crie no n8n um workflow com nó **Webhook (POST)**; copie a URL de produção.
- Em Integrações: **URL do webhook** e, opcionalmente, **Token** (enviado no header `X-VML-Token` — valide-o no n8n).
- Eventos enviados: `lead.qualified` (leadId, evento, cidade, UF, score) e `followups.due` (lista de follow-ups vencidos). Use para avisos no Telegram/e-mail, planilhas etc.
- O n8n **não** envia mensagens a leads — essa regra é do produto.

## Serviços do sistema

PostgreSQL, Redis e workers aparecem no topo da página Integrações com status em tempo real (configurados por variável de ambiente, não pela tela).
