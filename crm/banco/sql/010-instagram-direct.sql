-- Direct da própria Shift. IGSID não é telefone nem identifica um lead de WhatsApp.
alter table crm.conta_instagram add column direct_assinado boolean not null default false;

create table crm.conversa_instagram (
  id uuid primary key default gen_random_uuid(),
  conta_id text not null,
  contato_id text not null check (contato_id ~ '^\d{1,30}$'),
  consentimento_em timestamptz,
  modo text not null default 'agente' check (modo in ('agente','humano')),
  memoria jsonb not null default '{}',
  revisao bigint not null default 0,
  processada bigint not null default 0,
  ultima_recebida timestamptz not null,
  proxima_execucao timestamptz,
  reserva uuid,
  reserva_ate timestamptz,
  erro text,
  aviso_em timestamptz,
  atualizada_em timestamptz not null default now(),
  unique(conta_id, contato_id)
);
create index conversa_instagram_fila on crm.conversa_instagram(proxima_execucao);
create table crm.recibo_instagram (
  meta_id text primary key,
  criada_em timestamptz not null default now()
);
grant select, insert on crm.recibo_instagram to shift_crm_app;

create table crm.mensagem_instagram (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references crm.conversa_instagram(id),
  meta_id text unique,
  chave text unique,
  autor text not null check (autor in ('cliente','agente','humano')),
  texto text not null check (length(texto) between 1 and 12000),
  estado text not null check (estado in ('recebida','pendente','enviada','incerto','cancelada')),
  revisao bigint not null,
  criada_em timestamptz not null default now()
);
create index mensagem_instagram_historico on crm.mensagem_instagram(conversa_id, criada_em, id);

create table crm.uso_ia_instagram (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid references crm.conversa_instagram(id),
  modelo text not null,
  entrada integer not null check(entrada >= 0),
  saida integer not null check(saida >= 0),
  cache_leitura integer not null check(cache_leitura >= 0),
  cache_criacao integer not null check(cache_criacao >= 0),
  custo_estimado_usd numeric,
  criada_em timestamptz not null default now()
);
grant select, insert, update on crm.conversa_instagram to shift_crm_app;
create index uso_ia_instagram_contato on crm.uso_ia_instagram(conversa_id, criada_em);
grant select, insert on crm.mensagem_instagram, crm.uso_ia_instagram to shift_crm_app;
grant update(meta_id, estado) on crm.mensagem_instagram to shift_crm_app;

-- Retenção limitada; a aplicação não recebe DELETE livre nem altera o texto.
create function crm.limpar_direct_instagram() returns void language plpgsql security definer
set search_path = pg_catalog, crm as $$
begin
  delete from crm.recibo_instagram where criada_em < now() - interval '90 days';
  delete from crm.mensagem_instagram where criada_em < now() - interval '90 days';
  delete from crm.uso_ia_instagram where criada_em < now() - interval '90 days';
  delete from crm.uso_ia_instagram where conversa_id in
    (select id from crm.conversa_instagram where atualizada_em < now() - interval '90 days');
  delete from crm.conversa_instagram where atualizada_em < now() - interval '90 days'
    and not exists(select 1 from crm.mensagem_instagram m where m.conversa_id = conversa_instagram.id);
end $$;
revoke all on function crm.limpar_direct_instagram() from public;
grant execute on function crm.limpar_direct_instagram() to shift_crm_app;
