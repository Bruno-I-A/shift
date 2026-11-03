-- =============================================================================
-- Números de WhatsApp de outras empresas conectados pelo app da Shift
-- (Embedded Signup, Tech Provider). Começa como teste de coexistência: o
-- número continua no app WhatsApp Business e também passa a responder pela
-- Cloud API.
--
-- O número e a conta são do cliente; aqui fica só a permissão (cifrada) e o
-- que é preciso para operar. Dos avisos da Meta guardamos a contagem por tipo,
-- nunca o conteúdo: as mensagens são dos clientes do cliente.
-- =============================================================================

create table crm.conexao_whatsapp (
  id uuid primary key default gen_random_uuid(),
  waba_id text not null check (waba_id ~ '^\d{1,30}$'),
  phone_number_id text not null unique check (phone_number_id ~ '^\d{1,30}$'),
  business_id text check (business_id is null or business_id ~ '^\d{1,30}$'),
  numero_exibicao text check (numero_exibicao is null or length(numero_exibicao) <= 40),
  nome_verificado text check (nome_verificado is null or length(nome_verificado) <= 200),
  coexistencia boolean not null,
  token_cifrado text not null check (length(token_cifrado) between 1 and 4000),
  conectada_em timestamptz not null default now(),
  sinc_contatos_id text check (sinc_contatos_id is null or length(sinc_contatos_id) <= 200),
  sinc_contatos_em timestamptz,
  sinc_historico_id text check (sinc_historico_id is null or length(sinc_historico_id) <= 200),
  sinc_historico_em timestamptz,
  eventos jsonb not null default '{}',
  ultimo_evento_em timestamptz
);

grant select, insert, update on crm.conexao_whatsapp to shift_crm_app;
