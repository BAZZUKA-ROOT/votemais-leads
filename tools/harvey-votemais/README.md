# Harvey para a VoteMais

Configuração para rodar o [Harvey](../harvey) (agente de vendas autônomo, MIT) como canal **de e-mail** da VoteMais. O fluxo principal da VoteMais é o WhatsApp via VoteMais Leads + skill `/harvey`; use o Harvey standalone só se quiser prospectar também por e-mail.

```bash
cd tools/harvey
python3 -m venv .venv && source .venv/bin/activate && pip install -e .
cp ../harvey-votemais/harvey.local.yaml.example harvey.local.yaml
cp ../harvey-votemais/product_knowledge.md skills/product_knowledge.md
cp .env.example .env     # mailbox (Gmail/SMTP) e verificador de e-mail
claude login             # Harvey usa a sua assinatura do Claude, sem API
harvey signals --confirm free
harvey dashboard         # revisão; nada sai sem aprovação no Outbox
```

Observações:
- O Harvey original foi escrito para o mercado dos EUA (prompts em inglês, regras CAN-SPAM). O `product_knowledge.md` pede respostas em português, mas revise os rascunhos no Outbox antes de aprovar.
- Mantenha `require_approval: true`: na VoteMais nenhuma mensagem sai sem revisão humana.
- `harvey export` gera um CSV de contatos verificados; envie as URLs dos sites ao VoteMais Leads com `/harvey prospectar` ou pela API `POST /api/search/urls`.
- Atualizar o Harvey: `git subtree pull --prefix tools/harvey https://github.com/ethanplusai/harvey main --squash`.
