# Atendimento no Instagram da Shift

Primeiro piloto: a conta profissional da própria Shift, conectada pelo Instagram
Login. A publicação de vídeos continua usando a mesma conta. O Direct reaproveita
a IA e a base `conhecimento/shift.md`, com memória própria por conta + IGSID.
Não associa pessoas a leads do WhatsApp pelo nome e não inventa telefones.

## Ativar após implantar

1. No Easypanel, mantenha as variáveis do Instagram e da Anthropic existentes.
   Acrescente `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` com um segredo aleatório próprio
   e `INSTAGRAM_DIRECT_ATIVO=sim`. Reimplante. A migração 010 roda no boot.
2. No app da Meta usado pelo Instagram, configure o webhook do objeto Instagram:
   URL `https://crm.shiftsys.com.br/api/instagram/webhook`; token de verificação
   igual a `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`. Assine `messages`; se o painel
   oferecer `message_echoes`, assine também para acompanhar respostas externas.
   A assinatura HTTP usa `INSTAGRAM_APP_SECRET` por padrão. Se o app que assina
   o webhook usar outra chave, configure-a em `INSTAGRAM_WEBHOOK_APP_SECRET`.
3. Autorize `instagram_business_manage_messages` no app e reconecte a conta em
   **Instagram → Abrir conversas do Direct → Reconectar Instagram**. Marcar
   permissão no painel da Meta não acrescenta o escopo a um token antigo.
4. Clique **Conectar Direct**. Só uma confirmação da Meta marca a assinatura.
   Isso assina também a conta via `/{ig-user-id}/subscribed_apps`.
5. Nas configurações de mensagens do Instagram, permita acesso a mensagens
   pelas ferramentas conectadas, caso a opção apareça. Em desenvolvimento,
   teste com as contas/funções autorizadas pela Meta; acesso ao público depende
   do modo do app e das aprovações exigidas pela Meta.
6. De outro perfil, envie uma DM. O primeiro contato recebe o aviso de IA e
   privacidade; responda SIM. Mande duas mensagens seguidas sobre um projeto.
   Confira a resposta única ao turno e o contexto na caixa `/instagram/direct`.
7. Assuma a conversa no painel e envie uma resposta; depois teste uma resposta
   pelo aplicativo do Instagram. O eco externo deve pausar a IA. Só devolva
   ao agente quando terminar; ele responde à próxima mensagem, sem reprocessar
   mensagens antigas. Confira no piloto se o app entrega os ecos esperados.

## Comportamento e limites

- Aguarda 10 segundos de silêncio para agrupar o turno; não paga outra chamada
  para encurtar respostas. Memória, histórico limitado e RAG são os mesmos da IA
  do WhatsApp, com identificação do canal Instagram no prompt.
- Registra texto do cliente e usa a IA só após consentimento. Antes dele guarda
  recibos de entrega, identificação do contato, horário e o aviso da Shift;
  o texto da mensagem inicial não é armazenado. Retenção de 90 dias.
- Anexos não são baixados nem abertos: indicados no painel e passam para humano.
- Janela conservadora de 24 horas desde a mensagem do cliente, inclusive para
  envio manual pelo CRM. Não faz prospecção por DM nem usa HUMAN_AGENT para IA.
- Nome, empresa e qualificação ficam no contexto do contato do Direct; ainda
  não há conversão automática para o funil de leads que exige telefone.
- Em falha da IA, a conversa fica humana com aviso interno no painel. Nunca
  entra em um ciclo de tentativas pagas; máximo 30 chamadas por contato/hora.
  Uso e custo estimado são registrados separadamente em `crm.uso_ia_instagram`.
- A fila e intenções de envio sobrevivem ao reinício. Timeout ou queda durante
  envio deixam o resultado incerto e pausam o agente; confira no Instagram antes
  de responder novamente. Não há repetição automática de envio incerto.
- A caixa mostra as novas mensagens recebidas após a conexão, sem importar
  conversas antigas. A Meta precisa entregar os eventos à URL configurada.

Referência da Meta: https://www.postman.com/meta/instagram/folder/1z5vxzu/instagram-api-with-instagram-login
