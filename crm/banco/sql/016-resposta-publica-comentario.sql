-- =============================================================================
-- Resposta pública ao comentário ("Enviado na sua DM, confere lá!").
--
-- Opcional por campanha, até 3 textos que o CRM alterna: o mesmo texto
-- repetido em sequência é o padrão que o Instagram trata como spam.
-- Só sai depois da DM confirmada, para ninguém procurar uma DM que não chegou.
-- A falha da resposta pública fica separada e não muda o estado da DM.
-- =============================================================================

alter table crm.campanha_instagram
  add column respostas_publicas text[] not null default '{}'
    check (cardinality(respostas_publicas) <= 3);

alter table crm.resposta_comentario_instagram
  add column resposta_publica text
    check (resposta_publica is null or length(resposta_publica) between 1 and 300),
  -- pendente → enviando → enviada | falhou; `enviando` vencido vira `incerta`,
  -- porque a Meta pode ter publicado antes da queda: não repetir.
  add column resposta_publica_estado text
    check (resposta_publica_estado in ('pendente','enviando','enviada','falhou','incerta')),
  add column resposta_publica_id text,
  add column resposta_publica_erro text check (resposta_publica_erro is null or length(resposta_publica_erro) <= 500),
  add column resposta_publica_em timestamptz,
  add check ((resposta_publica is null) = (resposta_publica_estado is null));

create index resposta_publica_fila on crm.resposta_comentario_instagram (resposta_publica_em)
  where resposta_publica_estado in ('pendente','enviando');

grant update (resposta_publica, resposta_publica_estado, resposta_publica_id, resposta_publica_erro, resposta_publica_em)
  on crm.resposta_comentario_instagram to shift_crm_app;
