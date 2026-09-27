-- =============================================================================
-- Estrutura do CRM.
--
-- Roda como `shift_crm_owner`, pelo `scripts/migrar.mjs`, na subida do
-- contêiner. A aplicação conecta como `shift_crm_app`, que só recebe o que está
-- no fim deste arquivo: nenhum poder sobre estrutura, e nenhum UPDATE/DELETE
-- nas tabelas que são histórico.
-- =============================================================================

create schema if not exists crm;

-- A trilha única de etapas, escolhida pelo Bruno em 25/09/2026 para servir a
-- transformação AI first, site e software. A ordem do enum é a ordem da trilha.
create type crm.etapa as enum (
  'descoberta',
  'desenho',
  'construcao',
  'validacao',
  'entregue',
  'acompanhamento'
);

create type crm.tipo_projeto as enum ('ai_first', 'site', 'software');

create table crm.cliente (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) between 1 and 200),
  criado_em timestamptz not null default now()
);
create unique index cliente_nome_unico on crm.cliente (lower(nome));

create table crm.projeto (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  nome text not null check (length(btrim(nome)) between 1 and 200),
  cliente_id uuid references crm.cliente (id),
  tipo crm.tipo_projeto not null,
  etapa crm.etapa not null default 'descoberta',
  etapa_desde timestamptz not null default now(),
  -- Normalizado por `normalizarRepositorio`: "github.com/dono/nome", minúsculo.
  -- É por ele que o agente descobre em que projeto está trabalhando.
  repositorio text check (repositorio is null or repositorio ~ '^[a-z0-9.-]+/[^/\s]+/[^/\s]+$'),
  url_producao text check (url_producao is null or url_producao ~ '^https?://'),
  url_previa text check (url_previa is null or url_previa ~ '^https?://'),
  stack text check (stack is null or length(stack) <= 300),
  -- Caminho relativo à raiz do Cerebro. O MCP roda na VPS e não enxerga o
  -- vault; ele devolve o caminho e quem lê a nota é o agente, na máquina.
  nota_cerebro text check (nota_cerebro is null or length(nota_cerebro) <= 300),
  arquivado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index projeto_repositorio_unico on crm.projeto (repositorio)
  where repositorio is not null;

create table crm.tarefa (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references crm.projeto (id),
  titulo text not null check (length(btrim(titulo)) between 1 and 300),
  criada_por text not null,
  criada_em timestamptz not null default now(),
  concluida_por text,
  concluida_em timestamptz,
  check ((concluida_em is null) = (concluida_por is null))
);
create index tarefa_abertas on crm.tarefa (projeto_id) where concluida_em is null;

-- O diário dos agentes. Histórico: a aplicação insere e lê, nunca altera.
create table crm.sessao (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references crm.projeto (id),
  agente text not null,
  resumo text not null check (length(btrim(resumo)) between 1 and 4000),
  proximos_passos text check (proximos_passos is null or length(proximos_passos) <= 4000),
  criada_em timestamptz not null default now()
);
create index sessao_por_projeto on crm.sessao (projeto_id, criada_em desc);

-- O agente propõe, o Bruno decide. Uma proposta pendente por projeto: a nova
-- substitui a anterior em vez de empilhar pedidos contraditórios.
create table crm.proposta_etapa (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references crm.projeto (id),
  de crm.etapa not null,
  para crm.etapa not null check (para <> de),
  motivo text not null check (length(btrim(motivo)) between 1 and 2000),
  proposta_por text not null,
  criada_em timestamptz not null default now(),
  decisao text check (decisao in ('aceita', 'recusada', 'substituida')),
  decidida_em timestamptz,
  check ((decisao is null) = (decidida_em is null))
);
create unique index proposta_uma_pendente on crm.proposta_etapa (projeto_id)
  where decisao is null;

-- Tudo que mudou, por quem. Append-only, garantido pelas permissões abaixo.
create table crm.evento (
  id bigint generated always as identity primary key,
  projeto_id uuid references crm.projeto (id),
  ator text not null,
  tipo text not null,
  dados jsonb not null default '{}',
  criado_em timestamptz not null default now()
);
create index evento_por_projeto on crm.evento (projeto_id, criado_em desc);

-- Chaves do MCP. Guarda o hash, nunca a chave: ela aparece uma vez na tela e
-- morre ali. `token_final` são os últimos caracteres, só para reconhecer.
create table crm.agente (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (nome ~ '^[a-z0-9-]{2,30}$'),
  token_hash text not null unique,
  token_final text not null,
  criado_em timestamptz not null default now(),
  ultimo_uso_em timestamptz,
  revogado_em timestamptz
);

-- Falhas de login, para o limitador. No banco e não em memória: memória zera a
-- cada reimplantação e o limite viraria sugestão.
create table crm.tentativa_entrada (
  ip text not null,
  criada_em timestamptz not null default now()
);
create index tentativa_recente on crm.tentativa_entrada (criada_em);

-- -----------------------------------------------------------------------------
-- Permissões do papel da aplicação.
-- -----------------------------------------------------------------------------
grant usage on schema crm to shift_crm_app;
grant usage on type crm.etapa, crm.tipo_projeto to shift_crm_app;

-- Sem DELETE em lugar nenhum dos dados: projeto se arquiva, tarefa se conclui.
grant select, insert, update on crm.cliente, crm.projeto, crm.tarefa, crm.proposta_etapa, crm.agente
  to shift_crm_app;

-- Histórico: sem UPDATE e sem DELETE.
grant select, insert on crm.sessao, crm.evento to shift_crm_app;

-- A limpeza das tentativas antigas é o único DELETE da aplicação.
grant select, insert, delete on crm.tentativa_entrada to shift_crm_app;
