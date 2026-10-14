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

O CRM usa a **Cloud API oficial da Meta** em `POST /api/whatsapp/webhook`. A
Meta valida o endereço por `GET` com o token de verificação e assina cada
evento por `X-Hub-Signature-256` com o App Secret. A rota confere a assinatura,
aceita mensagens recentes destinadas ao ID do número público e os eventos de
entrega/leitura. Anexos aparecem como indicação do tipo, sem download do arquivo.
O serviço inicia **desligado**: `WHATSAPP_ATIVO=sim` é necessário para a IA atender;
o recebimento de conversas autorizadas e o envio manual continuam funcionando.

O primeiro contato recebe um aviso de privacidade. Só depois de responder
`SIM`, `ACEITO` ou `AUTORIZO` o CRM cria ou associa um lead. A cada pergunta,
busca trechos de `conhecimento/shift.md` (cópia versionada de
`../site/llms-full.txt`) e envia apenas esses trechos e a mensagem mascarada
para a Messages API da Anthropic. O Claude responde e extrai nome, empresa, setor,
dor e prazo quando foram informados. Nome + dor + empresa ou setor levam o
lead à etapa **Qualificado**. Sem base para responder ou em falha da IA, o
atendimento passa para uma pessoa. O botão **Assumir atendimento** no lead
pausa o agente; **Reativar agente** devolve o atendimento automático.

O CRM guarda o resumo, os dados de qualificação e o histórico de mensagens
das conversas autorizadas por até 90 dias. Cada chamada ao Claude recebe nome,
empresa, segmento, necessidade, prazo, resumo acumulado e a última resposta
enviada pela Shift (agente ou humano), sem enviar a transcrição inteira. Isso permite
entender respostas curtas e continuar a conversa usando o que o contato já contou,
mesmo após reiniciar o CRM. Novos fatos e correções explícitas atualizam o lead;
campos vazios preservam o cadastro. Documentos, e-mail e telefone são mascarados
antes da chamada ao modelo.

### Caixa de entrada

Abra **WhatsApp** no menu do CRM (`/whatsapp`). A tela atualiza a cada quatro
segundos enquanto estiver visível; busca por nome, empresa ou número, filtra
atendimentos humanos e carrega as mensagens anteriores sob demanda.

- **Assumir conversa** pausa a IA. **Enviar** também assume automaticamente.
- **Devolver ao agente** faz a IA responder à próxima mensagem do cliente.
- Respostas livres só são enviadas dentro das 24 horas da última mensagem
  recebida, com a mesma validação no servidor. Templates fora da janela não
  estão incluídos nesta versão.
- O histórico diferencia cliente, agente e humano, e acompanha confirmação,
  entrega, leitura e falha. Envios sem confirmação não são repetidos automaticamente.
- Novas recebidas aparecem mesmo em modo humano ou com a IA desligada.
  Mensagens anteriores ao deploy não podem ser recuperadas; as respostas antigas
  do agente são aproveitadas pela migração.
- Anexos são identificados pelo tipo e pela legenda, sem guardar ou abrir o
  arquivo. A IA encaminha esse atendimento para humano.
- A retenção de 90 dias é aplicada pelo banco ao receber mensagens e ao abrir
  a caixa. Corpos não podem ser alterados nem apagados pelo papel da aplicação;
  somente os estados de envio podem mudar. A limpeza tem permissão limitada aos
  registros expirados.

A migração `005-caixa-whatsapp.sql` roda automaticamente no deploy, com as
variáveis existentes. Não há nova chave ou variável para o painel.

O agente usa o primeiro nome quando adequado, responde com frases curtas e faz
no máximo uma pergunta por vez. Não repete a apresentação nem pede informações
já conhecidas. O resumo guarda apenas o contexto útil ao atendimento comercial.

O esclarecimento tem até 280 caracteres; uma única pergunta é acrescentada pelo
CRM conforme os dados que faltam. Uma resposta extensa do modelo é reescrita antes
do envio, sem descartar a qualificação já extraída. Para sites, a descoberta cobre
objetivo, cidade, site atual e materiais; para IA e sistemas, processo, ferramentas
e equipe. Prazo, participação na decisão, faixa de investimento (opcional) e
preferência de contato complementam o contexto. Todos ficam em **Detalhes do lead**.
Respostas como "ainda não sei" ou "prefiro não informar" são registradas para
evitar insistência. Um lead de site também pode ser qualificado pelo objetivo.

Ao terminar a descoberta, o agente pergunta se pode encaminhar o resumo à equipe.
O pedido direto de atendimento humano continua disponível a qualquer momento.
Um agradecimento não confirma o encaminhamento, e o agente não promete agendamento
ou prazo de retorno de um especialista.

As ferramentas do Claude usam `strict: true`. O app normaliza metadados opcionais
nulos ou ausentes e limita os campos ao tamanho aceito no CRM. Uma resposta
truncada ou sem o esclarecimento obrigatório tem uma tentativa extra antes do
retorno de contingência. Se isso falhar, o log informa apenas o motivo de parada
e nomes de campos do contrato, sem valores ou conteúdo da conversa.

O ID da mensagem impede que um webhook repetido avance o funil. Um
envio sem confirmação aparece no lead para conferência manual; não é repetido
automaticamente, pois uma falha de rede pode acontecer depois da entrega ao
WhatsApp.

### Ativação com o número público

1. Em **Meta for Developers**, abra o app aprovado da Shift, adicione o produto
   WhatsApp e associe o número público. Copie o **Phone Number ID**, crie um
   token permanente para o usuário de sistema e anote a versão da Graph API
   exibida no painel. Não use o token temporário do início rápido em produção.
2. Em **WhatsApp > Configuração**, informe
   `https://crm.shiftsys.com.br/api/whatsapp/webhook` como Callback URL e crie
   um `WHATSAPP_META_VERIFY_TOKEN` aleatório. A Meta chama o endpoint por GET;
   depois assine o campo `messages` para o app. O `WHATSAPP_META_APP_SECRET`
   fica em **Configurações > Básico** do app e autentica os POSTs recebidos. A
   verificação do callback funciona com o agente desligado.
3. No Ambiente do CRM, configure `WHATSAPP_META_PHONE_NUMBER_ID`,
   `WHATSAPP_META_ACCESS_TOKEN`, `WHATSAPP_META_GRAPH_VERSION`,
   `WHATSAPP_META_VERIFY_TOKEN`, `WHATSAPP_META_APP_SECRET`,
   `ANTHROPIC_API_KEY` e `ANTHROPIC_MODEL`, conforme `.env.exemplo`. Reimplante o
   CRM e confira `/api/saude`.
4. Em uma janela de teste, ative `WHATSAPP_ATIVO=sim` e faça uma conversa real
   de outro número: aviso → `SIM` → pergunta sobre a Shift → qualificação no
   painel → **Assumir atendimento**. Se algo falhar, retire a variável para
   parar o agente e continue o atendimento manualmente.

Para atualizar a base quando o site mudar: copie `site/llms-full.txt` para
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
