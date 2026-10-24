-- =============================================================================
-- Exclusão de lead: o pedido do titular (política de privacidade, seção 09) e
-- o recomeço de um teste do zero. Apaga o lead e tudo o que o atendimento
-- guardou dele; a próxima mensagem do mesmo número volta a pedir autorização.
--
-- O app continua sem DELETE livre sobre o histórico: a exclusão só acontece
-- por esta função, que apaga um lead inteiro de uma vez. O uso de IA fica, sem
-- o lead, para a conta de custo não mudar.
-- =============================================================================

alter table crm.uso_ia_whatsapp alter column lead_id drop not null;

create function crm.excluir_lead(alvo uuid) returns boolean language plpgsql
security definer set search_path = pg_catalog, crm as $$
declare
  numero text;
begin
  select whatsapp into numero from crm.lead where id = alvo;
  if not found then
    return false;
  end if;
  -- Mesma ordem de travas do atendimento (número, atendimento, fila, lead):
  -- uma resposta da IA em andamento vê o atendimento sumir e se cancela.
  perform pg_advisory_xact_lock(hashtext(numero));
  perform 1 from crm.atendimento_whatsapp where lead_id = alvo for update;
  perform 1 from crm.lead where id = alvo for update;

  delete from crm.fila_whatsapp where lead_id = alvo;
  delete from crm.status_whatsapp where meta_id in (
    select meta_id from crm.conversa_whatsapp where lead_id = alvo and meta_id is not null);
  delete from crm.conversa_whatsapp where lead_id = alvo;
  delete from crm.mensagem_whatsapp where lead_id = alvo;
  delete from crm.atendimento_whatsapp where lead_id = alvo;
  update crm.uso_ia_whatsapp set lead_id = null where lead_id = alvo;
  delete from crm.evento where lead_id = alvo;
  delete from crm.lead where id = alvo;
  return true;
end $$;

revoke all on function crm.excluir_lead(uuid) from public;
grant execute on function crm.excluir_lead(uuid) to shift_crm_app;
