-- =============================================================================
-- Os três projetos com que o CRM começa, escolhidos pelo Bruno em 25/09/2026.
--
-- Etapa, stack e repositório vêm das notas do Cerebro naquela data. Clientes e
-- links de produção que as notas não confirmam ficam vazios, para o Bruno
-- preencher: dado inventado num CRM é pior que campo em branco.
-- =============================================================================

insert into crm.cliente (nome) values ('Beto Galina')
on conflict do nothing;

insert into crm.projeto (slug, nome, cliente_id, tipo, etapa, repositorio, stack, nota_cerebro)
values
  (
    'beto-galina',
    'Beto Galina',
    (select id from crm.cliente where lower(nome) = 'beto galina'),
    'site',
    'construcao',
    'github.com/bruno-i-a/beto-galina',
    'Next.js 16 · PostgreSQL com RLS · better-auth',
    'Projetos/Beto Galina/Beto Galina.md'
  ),
  (
    'reforma-tributaria',
    'Reforma Tributária',
    null,
    'software',
    'construcao',
    'github.com/bruno-i-a/reforma-tributaria',
    'Next.js · NestJS · PostgreSQL com pgvector · Redis · BullMQ',
    'Projetos/Reforma Tributária/Reforma Tributária.md'
  ),
  (
    'guilda',
    'Guilda',
    null,
    'software',
    'construcao',
    'github.com/bruno-i-a/guilda',
    'Next.js 15 · Drizzle · better-auth · RLS',
    'Projetos/Guilda/Guilda.md'
  )
on conflict (slug) do nothing;

insert into crm.evento (projeto_id, ator, tipo, dados)
select id, 'sistema', 'projeto_criado', jsonb_build_object('origem', 'carga inicial')
  from crm.projeto
 where slug in ('beto-galina', 'reforma-tributaria', 'guilda')
   and not exists (select 1 from crm.evento e where e.projeto_id = crm.projeto.id);
