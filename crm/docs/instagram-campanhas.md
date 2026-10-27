# Comentário com palavra-chave → DM → agente

Primeiro piloto na própria Shift, pelo mesmo Instagram Login e webhook usados
no Direct. Não implementa mensagem a novo seguidor.

## Configurar após reimplantar

1. Reimplante o CRM. A migração 013 entra no boot, sem novas variáveis. O
   processamento usa `INSTAGRAM_DIRECT_ATIVO=sim`, já configurado para o agente.
2. No app da Meta usado pelo Instagram, habilite a permissão
   `instagram_business_manage_comments`. No webhook do objeto Instagram, assine
   `comments`, mantendo `messages` e os demais campos do atendimento.
3. No CRM, abra **Instagram → Comentários para DM → Autorizar comentários**.
   Reconecte o perfil da Shift e conceda a permissão acrescentada. Depois
   clique em **Conectar comentários**. A conta é assinada para `messages,comments`;
   reconectar o Direct depois disso também preserva a assinatura de comentários.
4. Clique **Carregar publicações recentes**, escolha um post/Reel entre as 50
   publicações mais recentes da conta e preencha nome, palavras, DM e contexto.
   O contexto é interno: descreve a oferta para o agente continuar com coerência.
5. **Salvar como pausada**. Confira a publicação e o texto exato da mensagem
   no cartão. Clique **Ativar** quando estiver pronto para enviar DMs reais.
6. De outro perfil, comente a palavra escolhida. Confira o envio no painel e
   a chegada no Direct. Responda à DM: só então o atendimento pode continuar
   pelo agente. Faça o teste também com um perfil que não seja administrador
   nem testador do app, para validar o acesso a clientes reais.

Permissões, publicação do app e acesso a comentários públicos dependem do que
a Meta liberar para esse app. Se exigir análise/acesso avançado, concluir essa
etapa antes de anunciar a automação para o público. O teste com uma conta com
função no app não prova que os eventos de clientes comuns estão liberados.

## Regras da primeira versão

- Uma campanha por publicação, com até 10 palavras/frases separadas por vírgula.
  Compara palavras inteiras, ignora caixa/acentos e evita negações diretas como
  “não quero”. Sem IA para classificar comentários ou enviar a primeira DM.
- Só aceita publicação da conta conectada. Não importa comentários antigos;
  processa eventos novos e confere texto e data do comentário na Meta antes de
  enviar. Prazo de até 7 dias, aplicável a comentários de posts/Reels; Live não
  está incluída. A primeira resposta usa `recipient.comment_id`, não o envio
  livre para o perfil.
- Uma DM aceita/pendente/incerta por pessoa na campanha durante a retenção de
  90 dias. Também deduplica o ID do comentário e as reentregas do webhook.
- Pausar/editar invalida envios ainda não iniciados. Conversas assumidas pela
  equipe não recebem essa DM automática. Um envio já em andamento pode terminar
  antes de a pausa ser confirmada; o painel aguarda essa transação.
- O comentário e a DM enviada não iniciam a janela de 24 horas do Direct.
  O CRM aguarda uma mensagem do cliente. A publicação, a oferta e o comentário
  ficam no contexto do agente; o histórico mostra a DM enviada. Se a pessoa
  citar uma DM de campanha anterior, o contexto daquela oferta é retomado,
  mesmo que ela tenha recebido outra campanha depois.
- Texto de comentário/mensagem de origem é preservado. A conferência do texto
  atualizado tem campo separado. O papel da aplicação não pode reescrever ou
  excluir esse histórico; limpeza limitada aos registros com mais de 90 dias.
- Limite conservador interno de 100 intenções de envio por conta/hora. O excedente
  aguarda uma hora e a data do comentário é conferida de novo antes de enviar.
- Falha de consulta anterior ao envio admite até 3 tentativas. HTTP 4xx confirmado
  no envio mostra **Falha confirmada**, com opção de tentar novamente após corrigir
  as permissões. Timeout, HTTP 5xx, resposta inválida ou queda durante o envio ficam
  **sem confirmação**: confira no Instagram; não há repetição automática nem botão
  de reenvio para esses casos. A fila e a intenção persistidas sobrevivem ao reinício.
- Se o destinatário retornado pela Meta divergir do identificador do evento,
  o CRM aponta o caso para conferência, sem continuar por uma identidade incerta.

Referência da Meta: https://developers.facebook.com/docs/instagram-platform/private-replies/
