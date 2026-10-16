-- Só referências ao histórico autorizado; nenhuma cópia adicional do texto.
-- Uma linha por contato permite juntar webhooks e recuperar trabalho após reinício.
create table crm.fila_whatsapp (
  lead_id uuid primary key references crm.atendimento_whatsapp(lead_id),
  mensagens text[] not null default '{}',
  versao integer not null default 1,
  disponivel_em timestamptz not null default (now() + interval '7 seconds'),
  reserva uuid,
  reserva_ate timestamptz,
  tentativas integer not null default 0,
  check (cardinality(mensagens) > 0),
  check ((reserva is null) = (reserva_ate is null))
);
create index fila_whatsapp_disponivel on crm.fila_whatsapp (disponivel_em);
-- A fila é operacional e descartável; o histórico continua sem DELETE para o app.
grant select, insert, update, delete on crm.fila_whatsapp to shift_crm_app;
