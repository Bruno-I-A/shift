# Shift

Tudo da Shift Systems que roda na VPS, num repositório só:

| Pasta | O que é | Endereço |
|---|---|---|
| `site/` | Site institucional, estático (HTML + Tailwind), servido por nginx | `shiftsys.com.br` |
| `crm/` | CRM interno (Next.js + PostgreSQL + MCP) | `crm.shiftsys.com.br` |

São dois serviços separados no Easypanel, a partir deste mesmo repositório:
um deploy ou um bug do CRM não derruba o site. O que liga os dois é o
diagnóstico do site, que manda o lead (com consentimento) para
`crm.shiftsys.com.br/api/leads`.

Cada pasta tem o próprio README. Detalhes e decisões: notas `Projetos/Shift
Systems` e `Projetos/Shift CRM` do Cerebro.

## Subir na VPS

A ordem importa: o CRM primeiro, porque o site passa a enviar leads para ele.

### 1. CRM — `crm.shiftsys.com.br`

1. **DNS:** registro `crm` apontando para o IP da VPS.
2. **Easypanel → serviço App**, fonte GitHub `Bruno-I-A/shift`, branch `vps`,
   **build path `/crm`**, build por Dockerfile. Porta **3000**. Domínio
   `crm.shiftsys.com.br` com HTTPS.
3. **Ambiente**, gerado na sua máquina com `cd crm && npm run configurar-login`:
   `ADMIN_EMAIL`, `ADMIN_SENHA_HASH`, `SESSAO_SEGREDO`, e mais
   `APP_URL=https://crm.shiftsys.com.br`.
4. **Implantar.** Sem banco ele sobe mesmo assim; `/api/saude` lista o que falta.
5. **Banco:** Console do serviço → `node scripts/configurar-banco.mjs`. Ele pede
   a URL de administrador do Postgres (a do serviço Postgres no Easypanel), cria
   os papéis e o banco `shift_crm`, aplica as migrações e mostra
   `DATABASE_URL` e `DATABASE_URL_MIGRACAO` uma vez. Cole as duas no Ambiente e
   reimplante.
6. **Conferir:** `https://crm.shiftsys.com.br/api/saude` → `"ok": true`, e entrar.

### 2. Site — primeiro num endereço de teste

1. **DNS:** um registro de teste, por exemplo `novo` → IP da VPS.
2. **Easypanel → outro serviço App**, mesmo repositório e branch, **build path
   `/site`**, Dockerfile. Porta **8080**. Domínio `novo.shiftsys.com.br`.
3. **Conferir** em `novo.shiftsys.com.br`: as páginas, o 404, e um diagnóstico
   completo com o consentimento marcado — o lead tem que aparecer em Leads no CRM.
   (Enquanto o site está no endereço de teste, o CRM só aceita envio vindo de
   `shiftsys.com.br`; ponha `ORIGENS_SITE=https://shiftsys.com.br,https://www.shiftsys.com.br,https://novo.shiftsys.com.br`
   no Ambiente do CRM para testar, e tire depois.)

### 3. Virada do domínio

1. No Easypanel, acrescente `shiftsys.com.br` e `www.shiftsys.com.br` ao
   serviço do site (o `www` é redirecionado para o domínio sem `www` pelo nginx).
2. No DNS, aponte `shiftsys.com.br` e `www` para a VPS (hoje apontam para a Vercel).
3. **Deixe o projeto da Vercel ligado alguns dias.** Se algo der errado, voltar
   o DNS para a Vercel restaura o site de antes.
4. Quando estiver estável: desligar o projeto na Vercel, arquivar o repositório
   `Bruno-I-A/shift-crm` (o código dele vive aqui agora) e levar a branch `vps`
   para `main`.

## Rollback

- **Site ou CRM quebrou depois de um deploy:** no Easypanel, reimplantar o
  commit anterior do serviço.
- **Migração do CRM falhou:** o contêiner não sobe e o anterior continua no ar;
  o log do serviço diz qual arquivo e em que posição.
- **Site fora na VPS:** voltar o DNS para a Vercel (enquanto ela estiver ligada).
