alter table crm.atendimento_whatsapp add column revisao integer not null default 0;

create table crm.conversa_whatsapp (
  id text primary key check (length(id) between 1 and 220),
  lead_id uuid not null references crm.lead(id),
  autor text not null check (autor in ('cliente', 'agente', 'humano')),
  texto text not null check (length(texto) between 1 and 4000),
  tipo text not null default 'text',
  criado_em timestamptz not null default now(),
  meta_id text unique,
  estado text not null default 'pendente' check (estado in ('recebido', 'pendente', 'enviado', 'erro'))
);
create index conversa_whatsapp_lead on crm.conversa_whatsapp (lead_id, criado_em desc, id);
create index conversa_whatsapp_retencao on crm.conversa_whatsapp (criado_em);
create index mensagem_whatsapp_retencao on crm.mensagem_whatsapp (criado_em);

-- Os corpos são imutáveis; apenas o resultado do envio pode mudar.
grant select, insert on crm.conversa_whatsapp to shift_crm_app;
grant update (meta_id, estado) on crm.conversa_whatsapp to shift_crm_app;

-- Eventos podem chegar antes da confirmação HTTP de envio e fora de ordem.
create table crm.status_whatsapp (
  meta_id text not null check (length(meta_id) between 1 and 200),
  estado text not null check (estado in ('sent', 'delivered', 'read', 'failed')),
  ocorrido_em timestamptz not null,
  primary key (meta_id, estado)
);
grant select, insert on crm.status_whatsapp to shift_crm_app;
create index status_whatsapp_retencao on crm.status_whatsapp (ocorrido_em);

insert into crm.conversa_whatsapp (id, lead_id, autor, texto, criado_em, estado)
select 's:' || id, lead_id, 'agente', resposta, criado_em, estado
from crm.mensagem_whatsapp where criado_em > now() - interval '90 days';

-- Limpeza limitada à retenção; o app não recebe DELETE livre sobre o histórico.
create function crm.limpar_historico_whatsapp() returns void language sql
security definer set search_path = pg_catalog, crm as $$
  delete from crm.conversa_whatsapp where criado_em < now() - interval '90 days';
  delete from crm.status_whatsapp where ocorrido_em < now() - interval '90 days';
  delete from crm.mensagem_whatsapp where criado_em < now() - interval '90 days';
$$;
revoke all on function crm.limpar_historico_whatsapp() from public;
grant execute on function crm.limpar_historico_whatsapp() to shift_crm_app;
