<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Shift CRM

Leia o `README.md` e a nota `Projetos/Shift CRM/Shift CRM.md` do Cerebro antes de mexer.

- Nomes, comentários e textos da tela em português, como o resto do código.
- Regra de negócio só em `src/lib/crm.ts` (projetos) e `src/lib/leads.ts`
  (leads). A tela (`src/app/acoes.ts`), o MCP (`src/mcp/servidor.ts`) e a API
  pública (`src/app/api/leads`) chamam as mesmas funções.
- O formato que o site manda em `/api/leads` é o de `sendLead` em
  `../site/diagnostico.html`. Mudou de um lado, muda do outro no mesmo commit.
- Toda Server Action começa com `await exigirSessao()` e valida a entrada com zod.
- Mudança de banco é arquivo novo em `banco/sql/`. Nunca edite um já aplicado.
- Não exporte nada além de componentes de um arquivo `"use client"`: um objeto
  exportado dali chega ao servidor como referência vazia (foi o que apagou o
  estilo dos botões uma vez — por isso `componentes/estilos.ts` existe).
- Antes de dizer que terminou: `npm test`, `npm run lint`, `npm run typecheck`.
  O `rtk` engole a saída do vitest; use `rtk proxy npx vitest run`.
- Com a máquina sem memória livre, o PGlite morre com "Fatal process out of
  memory: Zone" ou "Commit wasm code space Allocation failed". Não é o teste:
  é falta de memória no Windows. Libere memória e rode de novo.
