# Segurança e LGPD

## Autenticação e sessão

- Senhas com **Argon2id** (19 MiB, t=2). Política: mínimo 12 caracteres com maiúsculas, minúsculas e números.
- Bloqueio de conta por 15 min após 8 tentativas inválidas; tempo de resposta equalizado para usuários inexistentes.
- Sessão: token aleatório de 256 bits em cookie `httpOnly`, `SameSite=Lax`, `Secure` em produção. No banco fica apenas o **hash SHA-256** do token. Expiração deslizante (`SESSION_TTL_HOURS`). Troca de senha encerra todas as sessões.
- Perfis: `admin` (integrações, usuários, exclusões LGPD) e `operator`.

## Proteções da API

- **CSRF**: toda requisição mutável exige `X-CSRF-Token` igual ao token da sessão (double submit) + verificação de `Origin` em produção.
- **Rate limit** (Redis): 600 req/min por IP; login 10 tentativas/15 min.
- **Validação** de toda entrada com Zod (`strict` onde aplicável); erros 400 padronizados.
- **SQL Injection**: consultas parametrizadas via Drizzle; buscas `ILIKE` com escape de curingas.
- **XSS**: React escapa saída; URLs exibidas/abertas são restritas a `http(s)`; CSP restritiva no Next e na API; `X-Frame-Options: DENY`.
- **SSRF** no crawler: bloqueio de IPs privados/loopback/link-local (inclusive após redirects), limite de 2,5 MB e 15 s, `robots.txt` respeitado, intervalo mínimo por domínio.
- **CSV injection**: células iniciadas por `= + - @` são prefixadas.
- Headers de segurança via Helmet; erros internos não vazam detalhes ao cliente.

## Credenciais

- Chaves de APIs externas cifradas com **AES-256-GCM** (`APP_ENCRYPTION_KEY`), nunca retornadas ao frontend (somente máscara), nunca registradas em log (redação automática de campos `key/secret/token/password`).
- Segredos de infraestrutura apenas em `.env` (fora do Git).

## Auditoria

`system_logs` com nível `audit`: logins (sucesso/falha), alterações de configurações e integrações, exportações CSV, exclusões, supressões, criação de usuários. Logs de auditoria não são removidos pela retenção automática.

## LGPD

- **Finalidade e minimização**: coleta somente dados **comerciais publicados voluntariamente** em fontes públicas (sites de eventos, prefeituras, portais, resultados públicos de busca). Não usa bases vazadas, login em plataformas, scraping do Instagram ou acesso não autorizado.
- **Rastreabilidade**: cada contato e campo relevante guarda URL e trecho da fonte.
- **Base legal sugerida**: legítimo interesse (art. 7º, IX) para prospecção B2B de organizadores de eventos — documente seu teste de balanceamento.
- **Oposição/eliminação**: **Configurações → Privacidade e LGPD**
  - *Lista de supressão* (telefone, e-mail, Instagram, domínio): bloqueia novas coletas e abordagens.
  - *Exclusão de dados pessoais*: remove o contato de toda a base e o suprime.
  - *Excluir lead*: apaga evento, contatos, fontes, análises, mensagens e histórico (opção de suprimir).
- **Retenção**: leads descartados/sem uso e resultados irrelevantes são removidos automaticamente após os prazos definidos em Automações (padrão 365 dias para leads, 90 para resultados, 90 para logs operacionais).
- **Sem disparo automático**: nenhuma mensagem é enviada pelo sistema; toda abordagem é manual.
