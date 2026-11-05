# Harvey — agente de vendas integrado

O [Harvey](https://github.com/ethanplusai/harvey) (Ethan Rogers, licença MIT) é um agente de vendas autônomo que roda pela assinatura do Claude Code. Ele está incorporado ao VoteMais Leads de duas formas:

| | O que é | Custo |
| --- | --- | --- |
| **Skill `/harvey`** (`.claude/skills/harvey/`) | Agente de prospecção e vendas dentro do Claude Code, com os manuais do Harvey adaptados para concursos/eventos no Brasil e WhatsApp. Conversa com o VoteMais Leads pela API. | assinatura do Claude que você já tem |
| **Harvey original** (`tools/harvey/`) | Código completo do Harvey (via `git subtree`), opcional, para prospecção por e-mail. Configuração da VoteMais em `tools/harvey-votemais/`. | assinatura + caixa de e-mail |

## Configurar a skill

1. Gere um token: `openssl rand -hex 32`.
2. No servidor, coloque em `.env`: `VML_API_TOKEN=<token>` e reinicie a API (`docker compose up -d api`).
3. No computador onde roda o Claude Code:
   ```bash
   export VML_URL=https://leads.votemais.online   # ou http://localhost:3000
   export VML_API_TOKEN=<token>
   cd votemais-leads && claude
   ```
4. No Claude Code:

| Comando | O que faz |
| --- | --- |
| `/harvey prospectar Rainha do Rodeio GO` | pesquisa na web, confere as páginas e envia as boas para o pipeline (extração, validação, deduplicação e pontuação são feitas pelo sistema) |
| `/harvey enriquecer <lead>` | procura fontes públicas com WhatsApp/Instagram/organizador faltantes e agrega ao lead |
| `/harvey abordar <lead>` | escreve 2 variações de mensagem de WhatsApp e salva como rascunho |
| `/harvey objecao <lead> "texto do cliente"` | responde objeções com LAARC e sugere próximo estágio/follow-up |
| `/harvey revisar` | lista as 10 ações comerciais mais importantes do dia |

Nada é enviado automaticamente: as mensagens ficam como rascunho em **Mensagens** e você abre o WhatsApp pelo painel.

## API usada pela skill

Autenticação: `Authorization: Bearer $VML_API_TOKEN` (sem cookie, portanto sem CSRF). O token age como o administrador ativo mais antigo; trate-o como uma senha.

- `POST /api/search/urls` — `{ "source": "harvey", "categoryId": 12, "state": "GO", "urls": ["https://…" | { "url", "title", "snippet" }], "leadId": "<opcional: agrega ao lead>" }` → `{ jobId, results: [{ url, status: queued|duplicate|invalid, resultId }] }`
- `POST /api/leads/:id/messages` — `{ "content": "…", "kind": "initial"|"followup", "author": "harvey" }` salva como rascunho após validar (sem placeholders, sem afirmar votação não confirmada, tamanho).

## O que foi adaptado do Harvey

| Harvey | VoteMais |
| --- | --- |
| `prospecting_tactics.md`, `signal_playbook.md` | `references/prospeccao.md` — dorks e gatilhos para concursos, rodeios, festas e premiações |
| `lead_qualification.md`, `account_navigation.md` | `references/qualificacao.md` — BANT adaptado para eventos |
| `email_frameworks.md`, `sales_methodology.md` | `references/mensagens-whatsapp.md` — frameworks para WhatsApp em pt-BR |
| `objection_handling.md` | `references/objecoes.md` — LAARC com respostas para organizadores |
| `offer_strategy.md` | `references/oferta-fechamento.md` |
| regras éticas | `references/etica-lgpd.md` — LGPD e envio sempre manual |

## Atualizar o Harvey original

```bash
git subtree pull --prefix tools/harvey https://github.com/ethanplusai/harvey main --squash
```
