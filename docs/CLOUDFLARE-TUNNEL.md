# Rodar no seu computador e publicar com Cloudflare (grátis)

Sem VPS, sem CNPJ, sem abrir portas no roteador. O sistema roda no seu PC e o **Cloudflare Tunnel** publica em `https://leads.votemais.online` com HTTPS.

> Limite: as pesquisas automáticas só rodam com o computador ligado e conectado. Se ele desligar, o sistema retoma as pesquisas interrompidas quando voltar.

## Requisitos

- Conta Cloudflare (grátis) com o domínio **votemais.online** adicionado (os servidores DNS do domínio apontando para o Cloudflare).
- Computador com 8 GB de RAM ou mais (16 GB se quiser IA local com `--ollama`).
- **Windows**: WSL com Ubuntu. **Linux**: Ubuntu/Debian. **Mac**: veja o fim deste guia.

## 1. Criar o túnel no Cloudflare

1. <https://one.dash.cloudflare.com> → **Networks → Tunnels → Create a tunnel** → **Cloudflared** → nome `votemais-leads`.
2. Na tela de instalação, escolha **Docker** e **copie só o token** (o texto longo depois de `--token`). Não precisa rodar o comando mostrado.
3. **Next** → **Public hostname**:
   - Subdomain `leads`, Domain `votemais.online`
   - Service: Type **HTTP**, URL **`caddy:80`**
4. **Save tunnel**.

## 2. Preparar o computador

**Windows** — abra o PowerShell como administrador:

```powershell
wsl --install -d Ubuntu-24.04
```

Reinicie, abra o app **Ubuntu**, crie usuário e senha. Os próximos comandos são dentro do Ubuntu.

**Linux** — use o terminal normalmente.

## 3. Instalar (um comando)

```bash
curl -fsSL https://raw.githubusercontent.com/BAZZUKA-ROOT/votemais-leads/main/deploy/install.sh \
  | sudo bash -s -- --email SEU_EMAIL --domain leads.votemais.online --cloudflare-token COLE_O_TOKEN
```

Em ~10–15 minutos aparecem o endereço, o login e a senha. Acesse **https://leads.votemais.online**.

## 4. Manter rodando

- **Windows/WSL**: o WSL desliga quando não há janela aberta. Para manter ligado, deixe a janela do Ubuntu aberta (minimizada) ou configure o Ubuntu para iniciar com o Windows. Evite que o PC entre em suspensão (Configurações → Energia → Suspender: Nunca, quando conectado).
- **Linux**: os contêineres reiniciam sozinhos com o computador.

## Comandos úteis (no Ubuntu)

| Tarefa | Comando |
| --- | --- |
| Status | `cd /opt/votemais-leads && sudo docker compose ps` |
| Atualizar | `sudo bash /opt/votemais-leads/deploy/install.sh` |
| Logs do túnel | `sudo docker compose logs -f cloudflared` |
| Redefinir senha | `sudo docker compose exec api node dist/cli/reset-password.js EMAIL NovaSenhaForte123` |

## Mac

Instale o Docker Desktop, depois no Terminal:

```bash
git clone https://github.com/BAZZUKA-ROOT/votemais-leads.git && cd votemais-leads
cp .env.example .env   # preencha conforme docs/SETUP.md e acrescente CLOUDFLARE_TUNNEL_TOKEN=... e COMPOSE_PROFILES=searxng,cloudflare
docker compose up -d --build
```

## Por que não rodar tudo dentro do Cloudflare?

O plano grátis do Cloudflare (Workers) não executa servidor Node contínuo, PostgreSQL, Redis, filas nem contêineres. Cloudflare Containers exige o plano pago (Workers Paid). O túnel é a parte do Cloudflare que é grátis e resolve a publicação.
