-- =============================================================================
-- Leads: quem fez o diagnóstico no site e autorizou o contato.
--
-- O funil é o que o Bruno escolheu em 25/09/2026. O lead só existe com
-- consentimento registrado: o site não envia nada sem a caixa marcada, e a API
-- recusa o que chega sem ela.
-- =============================================================================

create type crm.etapa_lead as enum (
  'novo',
  'qualificado',
  'diagnostico',
  'proposta',
  'negociacao',
  'ganho',
  'perdido'
);

create table crm.lead (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) between 1 and 200),
  empresa text check (empresa is null or length(empresa) <= 200),
  whatsapp text not null check (length(btrim(whatsapp)) between 8 and 40),
  -- Os dois campos que o Bruno quer ver sem abrir o lead, já em texto legível.
  segmento text check (segmento is null or length(segmento) <= 120),
  dor text check (dor is null or length(dor) <= 200),
  -- Todas as respostas do quiz, como chegaram. Legíveis para a tela.
  respostas jsonb not null default '{}',
  nivel text check (nivel is null or length(nivel) <= 200),
  oferta text check (oferta is null or length(oferta) <= 200),
  processo text check (processo is null or length(processo) <= 500),
  origem text not null check (length(origem) <= 60),
  etapa crm.etapa_lead not null default 'novo',
  etapa_desde timestamptz not null default now(),
  consentimento_em timestamptz not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index lead_por_etapa on crm.lead (etapa, criado_em desc);

-- O histórico passa a registrar também o que acontece com leads.
alter table crm.evento add column lead_id uuid references crm.lead (id);
create index evento_por_lead on crm.evento (lead_id, criado_em desc) where lead_id is not null;

-- Envios à API pública, para o limitador. Guarda um resumo do IP (hash), não o
-- IP: serve para contar, e não há por que manter o endereço de ninguém.
create table crm.envio_publico (
  chave text not null,
  criado_em timestamptz not null default now()
);
create index envio_publico_recente on crm.envio_publico (criado_em);

grant usage on type crm.etapa_lead to shift_crm_app;
grant select, insert, update on crm.lead to shift_crm_app;
grant select, insert, delete on crm.envio_publico to shift_crm_app;
