-- O cliente inicia o atendimento no WhatsApp sem um aceite intermediário.
-- Aceites reais anteriores e os do diagnóstico do site continuam preservados.
alter table crm.lead alter column consentimento_em drop not null;
alter table crm.lead add constraint lead_consentimento_por_origem
  check (origem = 'whatsapp' or consentimento_em is not null);

-- Eram apenas recibos de avisos, sem mensagem do cliente nem aceite explícito.
delete from crm.aviso_whatsapp;
