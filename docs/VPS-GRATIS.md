# Colocar no ar grátis — Oracle Cloud Always Free

A Oracle oferece para sempre uma máquina ARM de **2 núcleos e 12 GB de RAM** sem custo ("Always Free" — reduzido de 4 núcleos/24 GB em 15/06/2026; confira o limite atual na página da Oracle). Sobra recurso para o VoteMais Leads inteiro (e até para o Ollama). Total: ~20 minutos.

> A conta pede um cartão apenas para verificação de identidade. Recursos marcados *Always Free* não geram cobrança; não faça upgrade para "Pay As You Go" se não quiser risco de cobrança.

## 1. Criar a conta

1. Acesse <https://www.oracle.com/cloud/free/> → **Start for free**.
2. **Home region**: escolha **Brazil East (São Paulo)** ou **Brazil Southeast (Vinhedo)** — não dá para trocar depois.
3. Conclua a verificação (e-mail, telefone, cartão).

## 2. Criar a máquina

1. Menu ☰ → **Compute → Instances → Create instance**.
2. **Name**: `votemais-leads`.
3. **Image**: *Change image* → **Ubuntu** → **Canonical Ubuntu 24.04**.
4. **Shape**: *Change shape* → **Ampere** → **VM.Standard.A1.Flex** → **2 OCPUs** e **12 GB** de memória (use o máximo que aparecer com o selo *Always Free-eligible*).
5. **Networking**: deixe criar a rede padrão e **Assign a public IPv4 address**.
6. **SSH keys**: **Generate a key pair for me** → baixe a chave privada (`.key`).
7. **Create**. Anote o **Public IP address**.

> "Out of capacity"? A demanda por ARM grátis é alta. Tente outro *Availability Domain*, tente de novo mais tarde, ou tente com 1 OCPU / 6 GB (também grátis e suficiente sem o Ollama).

## 3. Liberar as portas 80 e 443

1. Na página da instância → **Primary VNIC → Subnet** → **Security Lists** → *Default Security List*.
2. **Add Ingress Rules** (duas regras):
   - Source CIDR `0.0.0.0/0`, IP Protocol **TCP**, Destination Port **80**
   - Source CIDR `0.0.0.0/0`, IP Protocol **TCP**, Destination Port **443**

(O firewall interno do Ubuntu da Oracle é liberado automaticamente pelo instalador.)

## 4. Instalar com um comando

Conecte na máquina — pelo navegador (ícone **Cloud Shell** no topo do console) ou pelo terminal:

```bash
chmod 600 ~/Downloads/ssh-key-*.key
ssh -i ~/Downloads/ssh-key-*.key ubuntu@SEU_IP
```

Rode (troque o e-mail):

```bash
curl -fsSL https://raw.githubusercontent.com/BAZZUKA-ROOT/votemais-leads/main/deploy/install.sh | sudo bash -s -- --email voce@votemais.online
```

Em ~10 minutos ele instala Docker, baixa o projeto, gera todas as senhas, sobe banco, filas, busca (SearXNG), workers, painel e proxy, ativa o modo gratuito e **dispara a primeira rodada de pesquisa**. No final mostra o endereço, o login e a senha.

Com IA local gratuita (Ollama; cabe nos 12 GB, mas deixa as análises mais lentas):

```bash
curl -fsSL https://raw.githubusercontent.com/BAZZUKA-ROOT/votemais-leads/main/deploy/install.sh | sudo bash -s -- --email voce@votemais.online --ollama
```

## 5. Domínio e HTTPS (leads.votemais.online)

1. No painel DNS do domínio `votemais.online`, crie um registro **A**: nome `leads` → valor `SEU_IP`.
2. Aguarde propagar (`ping leads.votemais.online` deve mostrar o IP).
3. Na máquina: `sudo bash /opt/votemais-leads/deploy/install.sh --domain leads.votemais.online`

O certificado HTTPS é emitido automaticamente. Senhas e dados são mantidos.

## Dia a dia

| Tarefa | Comando (na máquina) |
| --- | --- |
| Atualizar para a versão mais nova | `sudo bash /opt/votemais-leads/deploy/install.sh` |
| Ver status | `cd /opt/votemais-leads && sudo docker compose ps` |
| Ver logs | `sudo docker compose logs -f worker api` |
| Backup manual | `sudo ./deploy/backup/backup.sh` (automático todo dia às 03:40) |
| Token da skill `/harvey` | `sudo grep VML_API_TOKEN /opt/votemais-leads/.env` |

## Se algo der errado

- **Página não abre**: confira as regras de entrada 80/443 (passo 3) e `sudo docker compose ps`.
- **Pesquisas sem resultados**: em *Integrações*, clique **Testar** no SearXNG. Alguns buscadores limitam IPs de datacenter; se acontecer, adicione Brave/Serper/Tavily (têm cotas gratuitas) como fallback.
- **Esqueci a senha**: `cd /opt/votemais-leads && sudo docker compose exec api node dist/cli/reset-password.js voce@votemais.online NovaSenhaForte123` (mínimo 12 caracteres, com maiúscula, minúscula e número).
