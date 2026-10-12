-- Atendimento iniciado pelo contato no WhatsApp, após autorização para guardar dados.
-- Mensagens recebidas não são armazenadas: ficam só a resposta e o estado de envio.
-- Antes do consentimento, só um HMAC do telefone e a data do aviso ficam no banco.
create table crm.aviso_whatsapp (
  chave text primary key check (length(chave) = 64),
  mensagem_id text not null check (length(mensagem_id) between 1 and 200),
  enviado_em timestamptz not null default now()
);

create table crm.atendimento_whatsapp (
  lead_id uuid primary key references crm.lead(id),
  whatsapp text not null unique,
  modo text not null default 'agente' check (modo in ('agente', 'humano')),
  resumo text not null default '' check (length(resumo) <= 1000),
  atualizado_em timestamptz not null default now()
);

create table crm.mensagem_whatsapp (
  id text primary key check (length(id) between 1 and 200),
  lead_id uuid not null references crm.lead(id),
  resposta text not null check (length(resposta) between 1 and 4000),
  estado text not null default 'pendente' check (estado in ('pendente', 'enviado', 'erro')),
  criado_em timestamptz not null default now(),
  enviado_em timestamptz
);
create index mensagem_whatsapp_pendente on crm.mensagem_whatsapp (criado_em desc)
  where estado <> 'enviado';

grant select, insert, update on crm.atendimento_whatsapp to shift_crm_app;
grant select, insert, update on crm.mensagem_whatsapp to shift_crm_app;
grant select, insert, update, delete on crm.aviso_whatsapp to shift_crm_app;
