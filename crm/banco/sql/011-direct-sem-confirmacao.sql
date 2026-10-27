-- Início de atendimento e consentimento são fatos diferentes. O Direct passa a
-- atender a primeira mensagem do cliente, sem criar um aceite que não ocorreu.
alter table crm.conversa_instagram add column iniciada_em timestamptz;
update crm.conversa_instagram set iniciada_em=consentimento_em where consentimento_em is not null;

-- Mantém avisos já enviados no histórico; só cancela os ainda pendentes.
update crm.mensagem_instagram set estado='cancelada'
where estado='pendente' and (chave like 'aviso:%' or chave like 'consentimento:%');
