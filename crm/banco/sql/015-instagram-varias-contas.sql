-- =============================================================================
-- Mais de uma conta de Instagram.
--
-- A principal é a da Shift: publica pela fila e tem o agente no Direct. As
-- outras (o perfil de fundador do Bruno) só têm campanhas de comentário → DM:
-- o CRM manda a primeira mensagem e quem continua é o dono, pelo app.
-- Conectar outra principal continua substituindo a anterior.
-- =============================================================================

alter table crm.conta_instagram add column principal boolean not null default false;
update crm.conta_instagram set principal = true;

alter table crm.conta_instagram drop constraint conta_instagram_pkey;
alter table crm.conta_instagram drop column unica;
alter table crm.conta_instagram add primary key (usuario_id);
create unique index conta_instagram_uma_principal on crm.conta_instagram (principal) where principal;
