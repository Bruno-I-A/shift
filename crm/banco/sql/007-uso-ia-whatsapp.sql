-- Uso técnico, sem prompts, respostas, telefone ou chave de API.
create table crm.uso_ia_whatsapp (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references crm.lead(id),
  modelo text not null check (length(modelo) between 1 and 100),
  entrada integer not null check (entrada >= 0),
  saida integer not null check (saida >= 0),
  cache_leitura integer not null check (cache_leitura >= 0),
  cache_criacao integer not null check (cache_criacao >= 0),
  custo_estimado_usd numeric(14,8),
  criado_em timestamptz not null default now()
);
create index uso_ia_whatsapp_criado on crm.uso_ia_whatsapp (criado_em);
grant select, insert on crm.uso_ia_whatsapp to shift_crm_app;

create function crm.limpar_uso_ia_whatsapp() returns void language sql
security definer set search_path = pg_catalog, crm as $$
  delete from crm.uso_ia_whatsapp where criado_em < now() - interval '90 days';
$$;
revoke all on function crm.limpar_uso_ia_whatsapp() from public;
grant execute on function crm.limpar_uso_ia_whatsapp() to shift_crm_app;
