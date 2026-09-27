# Shift CRM

O quadro dos projetos de cliente da Shift, em `crm.shiftsys.com.br`. Os agentes
(Claude Code e Codex) atualizam o quadro pelo MCP enquanto trabalham: leem o
contexto ao começar, registram o que fizeram ao terminar e **propõem** mudança
de etapa. Quem aceita é o Bruno, na tela **Hoje**.

- **Etapas:** Descoberta → Desenho → Construção → Validação com o cliente → Entregue → Acompanhamento
- **Tipos:** Transformação AI first · Site · Software
- **Stack:** Next.js 16 · PostgreSQL (`pg`, SQL à mão) · MCP SDK v2 · Tailwind 4
- Decisões e contexto de negócio: `Cerebro/Projetos/Shift CRM/Shift CRM.md`

## Rodar na máquina

Sem Docker e sem Postgres instalado: o banco local é o PGlite (Postgres real
compilado para WebAssembly), servido numa porta.

```bash
npm ci
cp .env.exemplo .env.local        # e ajuste — ver os comentários do arquivo
npm run banco:local               # terminal 1, deixe rodando (porta 54330)
npm run dev                       # terminal 2 → http://localhost:3000
```

No `.env.local` de desenvolvimento use `BANCO_PAPEL=shift_crm_app` e
`BANCO_MAX_CONEXOES=1`. O hash da senha sai de `npm run configurar-login`.

```bash
npm test          # 32 testes, com Postgres de verdade (PGlite) e o papel restrito
npm run lint
npm run typecheck
```

## Deploy no Easypanel

1. **Repositório** privado `github.com/Bruno-I-A/shift-crm`, com este código.
2. **DNS:** registro `crm.shiftsys.com.br` apontando para a VPS.
3. **Easypanel → novo serviço App**, fonte GitHub, build pelo `Dockerfile`, porta
   `3000`, domínio `crm.shiftsys.com.br` com HTTPS.
4. **Ambiente do serviço** — na sua máquina, `npm run configurar-login` gera
   `ADMIN_SENHA_HASH` e `SESSAO_SEGREDO`. Cole as duas, mais:
   `ADMIN_EMAIL` e `APP_URL=https://crm.shiftsys.com.br`.
5. **Implante.** Sem banco o app sobe mesmo assim; `/api/saude` lista o que falta.
6. **Banco:** no Console do serviço, rode `node scripts/configurar-banco.mjs`.
   Ele pede a URL de administrador do Postgres (a do serviço Postgres no
   Easypanel), cria os papéis `shift_crm_owner` e `shift_crm_app`, o banco
   `shift_crm`, aplica as migrações e imprime `DATABASE_URL` e
   `DATABASE_URL_MIGRACAO` **uma vez**. Cole as duas no Ambiente e reimplante.
7. **Confira** `https://crm.shiftsys.com.br/api/saude` → `"ok": true`.
8. **Agentes:** entre, abra **Agentes**, gere uma chave para `claude` e outra
   para `codex` e siga os dois passos que a tela mostra.
9. **Regra dos agentes:** instale `docs/regra-dos-agentes.md` no `CLAUDE.md`
   global e no `AGENTS.md` do Codex, para eles usarem o CRM sem ser lembrados.

A partir daí, toda subida do contêiner roda as migrações pendentes antes do
servidor (`docker-entrypoint.sh`). Se uma falhar, o contêiner não sobe.

## MCP

`POST https://crm.shiftsys.com.br/api/mcp`, com `Authorization: Bearer <chave>`.
Sem estado entre requisições. Atende o protocolo 2026-07-28 e, para clientes de
2025, o modo sem sessão do SDK.

| Ferramenta | O que faz |
|---|---|
| `projeto_atual` | Acha o projeto pelo `git remote` e já devolve o contexto |
| `listar_projetos` | Projetos ativos com etapa e tarefas abertas |
| `contexto_do_projeto` | Etapa, tarefas abertas, últimas sessões, proposta pendente, nota do Cerebro |
| `registrar_sessao` | Diário: o que foi feito e o que falta |
| `criar_tarefa` / `concluir_tarefa` | Lista de pendências do projeto |
| `propor_etapa` | Pede mudança de etapa; só vale quando o Bruno aceita |

O agente não cria nem edita projeto, não muda etapa direto e não mexe em chave.

## Regras que não se quebram

- **O app conecta como `shift_crm_app`.** Ele confere isso no banco e se recusa a
  operar como superusuário ou como dono do schema. Com o papel certo,
  `crm.evento` e `crm.sessao` são só de escrita — nem o app apaga histórico.
- **Migração nova é arquivo novo** em `banco/sql/NNN-nome.sql`. Arquivo já
  aplicado não se edita: o `migrar.mjs` avisa, e o banco não muda.
- **Regra mora em `src/lib/crm.ts`.** Tela e MCP chamam as mesmas funções; o
  agente não ganha caminho próprio.
- **Chave e senha só em hash.** A chave do MCP aparece uma vez na tela.
