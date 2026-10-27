import { describe, expect, it } from 'vitest';
import * as leads from '@/lib/leads';
import { registrarUsoAtendimento } from '@/lib/uso-atendimento';
import { bancoDeTeste } from './banco-de-teste';

describe('exclusão de lead', () => {
  it('apaga o lead com todo o histórico e o mesmo número recomeça do zero', async () => {
    const { tx } = await bancoDeTeste();
    const a = await leads.iniciarAtendimentoWhatsApp(tx, '5554999991234');
    const outro = await leads.iniciarAtendimentoWhatsApp(tx, '5554988884321');
    await leads.enfileirarMensagemWhatsApp(tx, a, { id: 'ENTRADA', texto: 'Oi, tenho uma clínica.' });
    const pedidoId = '78b8e61d-289e-45e9-90b7-b4c82077c8f7';
    await leads.prepararRespostaHumanaWhatsApp(tx, a.leadId, pedidoId, 'Vou te ajudar.');
    await leads.confirmarMensagemWhatsApp(tx, `h:${pedidoId}`, 'META1');
    await leads.registrarStatusWhatsApp(tx, { id: 'META1', estado: 'read', ocorridoEm: new Date() });
    await registrarUsoAtendimento(tx, a.leadId, {
      modelo: 'claude-haiku-5-5', inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0,
    });

    await leads.excluirLeadComHistorico(tx, a.leadId, 'bruno');

    expect(await leads.buscarAtendimentoWhatsApp(tx, a.whatsapp)).toBeNull();
    expect(await leads.listarMensagensWhatsApp(tx, a.leadId)).toEqual([]);
    expect((await leads.listarLeads(tx)).map(l => l.id)).toEqual([outro.leadId]);
    const { rows: restos } = await tx.query<{ n: number }>(`select (
      (select count(*) from crm.fila_whatsapp) + (select count(*) from crm.status_whatsapp)
      + (select count(*) from crm.mensagem_whatsapp) + (select count(*) from crm.evento where lead_id = $1))::int as n`, [a.leadId]);
    expect(restos[0].n).toBe(0);
    // O custo da IA continua na conta, sem apontar para ninguém.
    expect((await tx.query('select lead_id from crm.uso_ia_whatsapp')).rows).toEqual([{ lead_id: null }]);
    expect((await tx.query("select ator, lead_id, dados from crm.evento where tipo = 'lead_excluido'")).rows)
      .toEqual([{ ator: 'bruno', lead_id: null, dados: {} }]);

    const novo = await leads.iniciarAtendimentoWhatsApp(tx, a.whatsapp);
    expect(novo.leadId).not.toBe(a.leadId);
    expect(novo).toMatchObject({ modo: 'agente', resumo: '', ultimaResposta: '' });
    expect(await leads.listarMensagensWhatsApp(tx, novo.leadId)).toEqual([]);
  });

  it('avisa quando o lead já não existe e não abre DELETE livre ao app', async () => {
    const { tx } = await bancoDeTeste();
    const a = await leads.iniciarAtendimentoWhatsApp(tx, '5554999991234');
    await leads.excluirLeadComHistorico(tx, a.leadId, 'bruno');
    await expect(leads.excluirLeadComHistorico(tx, a.leadId, 'bruno')).rejects.toThrow(/não encontrado/);
    await expect(leads.excluirLeadComHistorico(tx, 'x', 'bruno')).rejects.toThrow(/inválido/);
    await expect(tx.query('delete from crm.lead')).rejects.toThrow(/permission denied/);
    await expect(tx.query('delete from crm.conversa_whatsapp')).rejects.toThrow(/permission denied/);
  });
});
