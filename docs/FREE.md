# Operação 100% gratuita

O sistema funciona sem nenhum serviço pago. Custos zero por uso:

| Função | Opção gratuita | Observação |
| --- | --- | --- |
| Pesquisa | **SearXNG** (self-hosted, incluso no compose) | metabuscador open-source na sua máquina |
| Análise e mensagens | **Modo regras** (ativo por padrão) | extração/classificação/mensagens por regras, sem IA |
| Análise e mensagens (melhor qualidade) | **Ollama** (IA local open-source) | precisa de ~8 GB de RAM livres para `qwen2.5:7b` |
| Enriquecimento | **BrasilAPI** (CNPJ) | ativa por padrão |
| Hospedagem | seu computador com Docker, ou VPS que você já tenha | veja abaixo |
| Repositório | GitHub (repositório privado gratuito) | |

Prioridade automática do motor de análise: **Anthropic → Ollama → regras**. Basta ativar/desativar em **Integrações**; o indicador de status no topo do painel mostra qual está em uso.

## Passo a passo (sem gastar)

```bash
cp .env.example .env     # preencha APP_ENCRYPTION_KEY, POSTGRES_PASSWORD, SEARXNG_SECRET, ADMIN_*
docker compose --profile searxng up -d
```

No painel → **Integrações** → **SearXNG**: URL `http://searxng:8080`, ative e salve. Pronto: o modo regras já está ativo e as rodadas agendadas começam a gerar leads.

### Opcional: IA local (Ollama)

```bash
docker compose --profile searxng --profile ollama up -d
docker compose exec ollama ollama pull qwen2.5:7b
```

**Integrações → Ollama**: URL `http://ollama:11434`, modelo `qwen2.5:7b`, ative e clique **Testar**. Com o Ollama ativo, as análises passam a usar o modelo local (mesmos prompts e a mesma validação anti-alucinação). Em CPU, cada análise leva de segundos a ~1 minuto — reduza "Pesquisas simultâneas" para 1–2 em Automações.

Ollama sem Docker (Windows/macOS/Linux): instale em <https://ollama.com>, rode `ollama pull qwen2.5:7b` e use a URL `http://host.docker.internal:11434` (Docker Desktop) ou `http://127.0.0.1:11434`.

## Rodando no seu computador

Com Docker Desktop instalado, o mesmo `docker compose` funciona localmente. Para usar sem domínio/HTTPS, acesse via `http://localhost` alterando `deploy/caddy/Caddyfile` para:

```
:80 {
	@api path /api/*
	handle @api {
		reverse_proxy api:4000
	}
	handle {
		reverse_proxy web:3000
	}
}
```

e no `.env`: `APP_URL=http://localhost` e `COOKIE_SECURE=false`. As automações só rodam enquanto o computador estiver ligado.

## O que muda no modo regras

- O nome do evento vem do JSON-LD, do título da página ou do resultado de busca; organizador de padrões como "Realização: …" / "X realiza o concurso".
- Cidade/UF por padrões "Cidade - UF" ou nome do estado; data por `dd/mm/aaaa`, "15 de maio de 2027" ou ISO.
- Fatos (concurso, candidatas, inscrições, votação popular) por palavras-chave com o trecho literal como evidência.
- Pontuação 0–100 por critérios objetivos (concurso, votação, evento futuro, organizador, WhatsApp, recorrência) — a justificativa lista exatamente o que pesou.
- Mensagens a partir de 4 modelos de primeira abordagem e 2 de follow-up, personalizados com evento e cidade; você pode editar antes de abrir o WhatsApp.
- Cancelamento de evento **não** é inferido no modo regras (exige IA para confirmar com evidência).

Menos preciso que uma IA para nomes de organizadores e páginas confusas, mas **nunca inventa dados**: tudo passa pela mesma validação factual. Quando quiser mais qualidade, ative o Ollama (grátis) ou a Anthropic (pago).
