alter table crm.conta_instagram add column comentarios_assinados boolean not null default false;

create table crm.campanha_instagram (
  id uuid primary key default gen_random_uuid(),
  conta_id text not null,
  midia_id text not null check(midia_id ~ '^\d{1,30}$'),
  link text not null check(link ~ '^https://(www\.)?instagram\.com/'),
  nome text not null check(length(nome) between 1 and 100),
  palavras text[] not null check(cardinality(palavras) between 1 and 10),
  mensagem text not null check(length(mensagem) between 1 and 1000),
  contexto text not null default '' check(length(contexto)<=1000),
  ativa boolean not null default false,
  revisao integer not null default 0,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  unique(conta_id,midia_id)
);
create table crm.resposta_comentario_instagram (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references crm.campanha_instagram(id),
  conta_id text not null,
  comentario_id text not null check(comentario_id ~ '^\d{1,30}$'),
  contato_id text not null check(contato_id ~ '^\d{1,30}$'),
  nome_campanha text not null,
  link_publicacao text not null,
  texto text not null check(length(texto)<=2200),
  texto_verificado text check(texto_verificado is null or length(texto_verificado)<=2200),
  mensagem text not null check(length(mensagem) between 1 and 1000),
  contexto text not null,
  revisao integer not null,
  estado text not null default 'pendente' check(estado in ('pendente','preparando','enviada','falhou','incerta','cancelada')),
  reserva uuid,
  reserva_ate timestamptz,
  envio_iniciado_em timestamptz,
  tentativas integer not null default 0,
  disponivel_em timestamptz not null default now(),
  recebida_em timestamptz not null default now(),
  enviada_em timestamptz,
  meta_id text,
  erro text,
  unique(conta_id,comentario_id)
);
create unique index resposta_comentario_por_pessoa on crm.resposta_comentario_instagram(campanha_id,contato_id)
  where estado in ('pendente','preparando','enviada','incerta');
create index resposta_comentario_fila on crm.resposta_comentario_instagram(estado,disponivel_em);
create index resposta_comentario_recente on crm.resposta_comentario_instagram(conta_id,recebida_em desc);
create index resposta_comentario_limite on crm.resposta_comentario_instagram(conta_id,envio_iniciado_em);
grant select,insert,update on crm.campanha_instagram to shift_crm_app;
grant select,insert on crm.resposta_comentario_instagram to shift_crm_app;
grant update(estado,reserva,reserva_ate,envio_iniciado_em,tentativas,disponivel_em,enviada_em,meta_id,erro,texto_verificado)
  on crm.resposta_comentario_instagram to shift_crm_app;

create function crm.limpar_comentarios_instagram() returns void language plpgsql security definer
set search_path=pg_catalog,crm as $$ begin
  delete from crm.resposta_comentario_instagram where recebida_em<now()-interval '90 days';
end $$;
revoke all on function crm.limpar_comentarios_instagram() from public;
grant execute on function crm.limpar_comentarios_instagram() to shift_crm_app;
