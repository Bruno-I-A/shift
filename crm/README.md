# Shift CRM

O quadro dos projetos de cliente e dos leads da Shift, em `crm.shiftsys.com.br`.
Mora em `crm/` do repositório `Bruno-I-A/shift`, ao lado do site (`site/`); o
passo a passo de subir os dois está no README da raiz. Os agentes
(Claude Code e Codex) atualizam o quadro pelo MCP enquanto trabalham: leem o
contexto ao começar, registram o que fizeram ao terminar e **propõem** mudança
de etapa. Quem aceita é o Bruno, na tela **Hoje**.

- **Etapas:** Descoberta → Desenho → Construção → Validação com o cliente → Entregue → Acompanhamento
- **Tipos:** Transformação AI first · Site · Software
- **Funil de leads:** Novo → Qualificado → Diagnóstico → Proposta → Negociação → Ganho · Perdido
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
npm test          # testes com Postgres de verdade (PGlite) e o papel restrito
npm run lint
npm run typecheck
```

## Leads do site

`POST /api/leads` recebe o diagnóstico público do site. O diagnóstico manda
o corpo como `text/plain` (JSON dentro) para não disparar preflight. Travas:
origem (`ORIGENS_SITE`, padrão `shiftsys.com.br` e `www`), formato e
consentimento (`lerEnvioDoSite`), e limite de 5 envios por IP por hora e 100 no
total. O IP entra no banco só como HMAC, para contar. O mesmo WhatsApp com
lead em aberto atualiza o lead em vez de criar outro.

## Atendimento no WhatsApp

O CRM recebe `MESSAGES_UPSERT` da **Evolution API** (conexão WhatsApp Web não
oficial) em `POST /api/whatsapp/webhook`. A rota exige o header
`x-shift-webhook-token`, confere a instância e ignora grupos, mensagens enviadas
pela própria Shift, mensagens antigas e conteúdo que não seja texto. O serviço inicia **desligado**:
`WHATSAPP_ATIVO=sim` é necessário para atender.

O primeiro contato recebe um aviso de privacidade. Só depois de responder
`SIM`, `ACEITO` ou `AUTORIZO` o CRM cria ou associa um lead. A cada pergunta,
busca trechos de `conhecimento/shift.md` (cópia versionada de
`../site/llms-full.txt`) e envia apenas esses trechos e a mensagem mascarada
para a Responses API da OpenAI. A IA responde e extrai nome, empresa, setor,
dor e prazo quando foram informados. Nome + dor + empresa ou setor levam o
lead à etapa **Qualificado**. Sem base para responder ou em falha da IA, o
atendimento passa para uma pessoa. O botão **Assumir atendimento** no lead
pausa o agente; **Reativar agente** devolve o atendimento automático.

O CRM guarda o resumo e os dados de qualificação, sem transcrição das mensagens
recebidas. O ID da mensagem impede que um webhook repetido avance o funil. Um
envio sem confirmação aparece no lead para conferência manual; não é repetido
automaticamente, pois uma falha de rede pode acontecer depois da entrega ao
WhatsApp.

### Ativação com o número público

1. Suba uma instância **Evolution API** persistente na VPS, com Postgres e
   Redis próprios conforme a documentação do projeto. Use a imagem
   `evoapicloud/evolution-api:v2.3.7` (versão estável fixada para este início),
   mantenha a API acessível ao CRM pela rede interna e preserve os volumes da
   instância. Não use a tag `latest`.
2. Crie uma instância WhatsApp Web na Evolution e faça o pareamento por QR com
   o número público da Shift. Esse passo depende do aparelho/conta do Bruno.
3. Configure o webhook da instância para
   `https://crm.shiftsys.com.br/api/whatsapp/webhook`, evento
   `MESSAGES_UPSERT`, `webhook_by_events=false`, com o header personalizado
   `x-shift-webhook-token` e um segredo aleatório. Desative o envio de histórico
   (`MESSAGES_SET`). Confira na [documentação de webhooks da Evolution](https://github.com/evolution-foundation/docs-evolution/blob/main/v2/pt/configuration/webhooks.mdx).
4. No Ambiente do CRM, configure `EVOLUTION_URL`, `EVOLUTION_API_KEY`,
   `EVOLUTION_INSTANCIA`, `WHATSAPP_WEBHOOK_SEGREDO`, `OPENAI_API_KEY` e
   `OPENAI_MODEL` conforme `.env.exemplo`. Reimplante o CRM e confirme
   `/api/saude`.
5. Em uma janela de teste, ative `WHATSAPP_ATIVO=sim` e faça uma conversa real
   de outro número: aviso → `SIM` → pergunta sobre a Shift → qualificação no
   painel → **Assumir atendimento**. Se algo falhar, retire a variável para
   parar o agente e continue o atendimento manualmente.

O conector está isolado em `src/lib/whatsapp.ts` para a futura troca pela API
oficial da Meta. A Evolution não é um produto oficial do WhatsApp; o uso no
número público exige acompanhar a conexão e a situação da conta. Para atualizar
a base quando o site mudar: copie `site/llms-full.txt` para
`crm/conhecimento/shift.md`, revise e reimplante o CRM.

## Deploy

Ver o README da raiz do repositório: o CRM é o serviço com build path `/crm`,
porta 3000. Toda subida do contêiner roda as migrações pendentes antes do
servidor (`docker-entrypoint.sh`); se uma falhar, o contêiner não sobe.

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
