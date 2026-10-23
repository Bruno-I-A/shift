-- =============================================================================
-- Publicação no Instagram da Shift.
--
-- Uma conta só, a da Shift. A permissão que a Meta devolve no login vale 60
-- dias e é renovada pelo agendador; fica cifrada pela aplicação (a chave sai
-- do SESSAO_SEGREDO), para que uma cópia do banco não publique por ninguém.
--
-- As publicações são uma fila. O agendador (`processamento-instagram.ts`)
-- pega o que venceu, cria o contêiner na Meta, espera o vídeo processar e
-- publica. Os arquivos ficam no volume (`PASTA_MIDIA`), não no banco: aqui vai
-- só o nome, e a chave do link que a Meta usa para buscá-los.
-- =============================================================================

create table crm.conta_instagram (
  -- Uma linha no máximo: conectar de novo substitui a anterior.
  unica boolean primary key default true check (unica),
  usuario_id text not null check (usuario_id ~ '^\d{1,30}$'),
  nome_usuario text not null check (length(nome_usuario) between 1 and 100),
  token_cifrado text not null check (length(token_cifrado) between 1 and 4000),
  token_expira_em timestamptz not null,
  token_renovado_em timestamptz not null default now(),
  conectada_em timestamptz not null default now()
);
grant select, insert, update, delete on crm.conta_instagram to shift_crm_app;

create type crm.tipo_publicacao as enum ('reel', 'carrossel', 'foto');

-- O agente propõe (`aguardando_aprovacao`), o Bruno aprova (`agendada`).
-- `preparando` é o intervalo entre criar o contêiner na Meta e publicar.
create type crm.estado_publicacao as enum (
  'aguardando_aprovacao',
  'agendada',
  'preparando',
  'publicada',
  'falhou',
  'cancelada'
);

create table crm.publicacao (
  id uuid primary key default gen_random_uuid(),
  tipo crm.tipo_publicacao not null,
  legenda text not null default '' check (length(legenda) <= 2200),
  -- Só para Reel: aparece também no feed, além da aba de Reels.
  mostrar_no_feed boolean not null default true,
  agendada_para timestamptz not null,
  estado crm.estado_publicacao not null,
  criada_por text not null check (length(criada_por) between 1 and 100),
  criada_em timestamptz not null default now(),
  aprovada_em timestamptz,

  -- Andamento na Meta. `filhos` são os contêineres dos itens do carrossel;
  -- `conteiner_id`, o que vai ser publicado.
  filhos text[] not null default '{}',
  conteiner_id text check (conteiner_id is null or conteiner_id ~ '^\d{1,40}$'),
  preparando_desde timestamptz,
  proxima_verificacao timestamptz,
  tentativas integer not null default 0 check (tentativas >= 0),

  -- Reserva do agendador: quem está trabalhando nesta linha, e até quando.
  -- Vencida, outra passagem pode retomar.
  reserva uuid,
  reserva_ate timestamptz,

  midia_id text check (midia_id is null or midia_id ~ '^\d{1,40}$'),
  link text check (link is null or link ~ '^https://'),
  publicada_em timestamptz,
  erro text check (erro is null or length(erro) <= 1000),
  atualizada_em timestamptz not null default now(),

  check ((reserva is null) = (reserva_ate is null)),
  check ((estado = 'publicada') = (publicada_em is not null))
);
create index publicacao_por_estado on crm.publicacao (estado, agendada_para);

create table crm.midia_publicacao (
  id uuid primary key default gen_random_uuid(),
  publicacao_id uuid not null references crm.publicacao (id),
  -- `item`: o vídeo do Reel, a foto, ou cada item do carrossel, em ordem.
  -- `capa`: a capa do Reel, opcional.
  papel text not null check (papel in ('item', 'capa')),
  ordem smallint not null check (ordem between 0 and 19),
  arquivo text not null unique check (arquivo ~ '^[0-9a-f-]{36}\.(jpg|mp4|mov)$'),
  tipo_mime text not null check (tipo_mime in ('image/jpeg', 'video/mp4', 'video/quicktime')),
  bytes bigint not null check (bytes > 0),
  largura integer check (largura is null or largura > 0),
  altura integer check (altura is null or altura > 0),
  -- O link que a Meta usa para buscar o arquivo: /api/instagram/midia/<chave>.
  -- 256 bits de acaso; só responde enquanto a publicação está na fila.
  chave text not null unique check (chave ~ '^[A-Za-z0-9_-]{43}$'),
  apagada_em timestamptz,
  unique (publicacao_id, papel, ordem)
);

grant select, insert, update on crm.publicacao to shift_crm_app;
grant select, insert, update on crm.midia_publicacao to shift_crm_app;
