import { describe, expect, it, vi } from 'vitest';
import * as leads from '@/lib/leads';
import { lerStatusMeta } from '@/lib/whatsapp';
import { bancoDeTeste } from './banco-de-teste';

const analise = { resposta: 'Como posso ajudar?', nome: '', empresa: '', segmento: '', dor: '', prazo: '', resumo: '', passarParaHumano: false };

describe('caixa de entrada WhatsApp', () => {
  it('guarda recebidas em modo humano, não duplica e separa os contatos', async () => {
    const { tx } = await bancoDeTeste();
    const a = await leads.iniciarAtendimentoWhatsApp(tx, '5554999991234');
    const b = await leads.iniciarAtendimentoWhatsApp(tx, '5554988884321');
    await leads.mudarModoAtendimentoWhatsApp(tx, a.leadId, 'humano');
    const mensagem = { id: 'ENTRADA1', texto: 'Tenho uma clínica.' };
    await leads.registrarMensagemRecebidaWhatsApp(tx, a.leadId, mensagem);
    await leads.registrarMensagemRecebidaWhatsApp(tx, a.leadId, mensagem);
    expect(await leads.listarMensagensWhatsApp(tx, a.leadId)).toMatchObject([{ autor: 'cliente', texto: mensagem.texto, estado: 'recebido' }]);
    expect(await leads.listarMensagensWhatsApp(tx, b.leadId)).toEqual([]);
    expect((await leads.listarConversasWhatsApp(tx)).find(c => c.leadId === a.leadId)).toMatchObject({ modo: 'humano', ultimaMensagem: mensagem.texto });
  });

  it('pausa a IA ao preparar resposta humana, preserva o corpo e impede reenvio da mesma tentativa', async () => {
    const { tx } = await bancoDeTeste();
    const a = await leads.iniciarAtendimentoWhatsApp(tx, '5554999991234');
    await leads.registrarMensagemRecebidaWhatsApp(tx, a.leadId, { id: 'ENTRADA', texto: 'Oi!' });
    const pedidoId = '78b8e61d-289e-45e9-90b7-b4c82077c8f7';
    expect(await leads.prepararRespostaHumanaWhatsApp(tx, a.leadId, pedidoId, 'Vou te ajudar.')).toBe(a.whatsapp);
    expect(await leads.prepararRespostaHumanaWhatsApp(tx, a.leadId, pedidoId, 'Outro texto')).toBeNull();
    expect(await leads.buscarAtendimentoWhatsApp(tx, a.whatsapp)).toMatchObject({ modo: 'humano' });
    await leads.confirmarMensagemWhatsApp(tx, `h:${pedidoId}`, 'META1');
    expect(await leads.buscarAtendimentoWhatsApp(tx, a.whatsapp)).toMatchObject({ ultimaResposta: 'Vou te ajudar.' });
    expect(await leads.listarMensagensWhatsApp(tx, a.leadId)).toHaveLength(2);
    await expect(tx.query("update crm.conversa_whatsapp set texto = 'alterado'")).rejects.toThrow(/permission denied/);
    await expect(tx.query('delete from crm.conversa_whatsapp')).rejects.toThrow(/permission denied/);
    await expect(tx.query('delete from crm.status_whatsapp')).rejects.toThrow(/permission denied/);
  });

  it('recusa resposta fora da janela no servidor e permite após nova mensagem', async () => {
    const { tx } = await bancoDeTeste();
    const a = await leads.iniciarAtendimentoWhatsApp(tx, '5554999991234');
    await leads.registrarMensagemRecebidaWhatsApp(tx, a.leadId, { id: 'ANTIGA', texto: 'Oi', recebidoEm: new Date(Date.now() - 25 * 3600_000) });
    const pedido = '78b8e61d-289e-45e9-90b7-b4c82077c8f7';
    await expect(leads.prepararRespostaHumanaWhatsApp(tx, a.leadId, pedido, 'Oi')).rejects.toThrow(/24 horas/);
    expect(await leads.listarMensagensWhatsApp(tx, a.leadId)).toHaveLength(1);
    await leads.registrarMensagemRecebidaWhatsApp(tx, a.leadId, { id: 'NOVA', texto: 'Voltei' });
    expect(await leads.prepararRespostaHumanaWhatsApp(tx, a.leadId, pedido, 'Olá!')).toBe(a.whatsapp);
  });

  it('a tomada humana cancela a resposta de IA que estava sendo preparada, mesmo após devolver ao agente', async () => {
    const { tx } = await bancoDeTeste();
    const contexto = await leads.iniciarAtendimentoWhatsApp(tx, '5554999991234');
    const enviar = vi.fn(async () => 'META');
    await leads.mudarModoAtendimentoWhatsApp(tx, contexto.leadId, 'humano');
    await leads.mudarModoAtendimentoWhatsApp(tx, contexto.leadId, 'agente');
    await leads.responderComAgenteWhatsApp(tx, contexto, 'IAANTIGA', analise, enviar);
    expect(enviar).not.toHaveBeenCalled();
    expect(await leads.listarMensagensWhatsApp(tx, contexto.leadId)).toEqual([]);
    const atual = (await leads.buscarAtendimentoWhatsApp(tx, contexto.whatsapp))!;
    await leads.responderComAgenteWhatsApp(tx, atual, 'IANOVA', analise, enviar);
    await leads.responderComAgenteWhatsApp(tx, atual, 'IANOVA', analise, enviar);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('status antecipado e fora de ordem não faz a mensagem lida voltar para enviada', async () => {
    const { tx } = await bancoDeTeste();
    const a = await leads.iniciarAtendimentoWhatsApp(tx, '5554999991234');
    await leads.registrarRespostaWhatsApp(tx, a, 'IA1', analise);
    for (const estado of ['read', 'delivered', 'sent', 'read']) {
      await leads.registrarStatusWhatsApp(tx, { id: 'META1', estado, ocorridoEm: new Date() });
    }
    await leads.confirmarMensagemWhatsApp(tx, 's:IA1', 'META1');
    expect((await leads.listarMensagensWhatsApp(tx, a.leadId))[0].estado).toBe('lido');
    const corpo = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: {
      metadata: { phone_number_id: '123' }, statuses: [{ id: 'META1', status: 'read', timestamp: Math.floor(Date.now() / 1000) }],
    } }] }] };
    expect(lerStatusMeta(corpo, '123')).toMatchObject([{ id: 'META1', estado: 'read' }]);
    expect(lerStatusMeta(corpo, 'outro')).toEqual([]);
  });

  it('limpa só os registros com mais de 90 dias e pagina mensagens com a mesma data', async () => {
    const { tx } = await bancoDeTeste();
    const a = await leads.iniciarAtendimentoWhatsApp(tx, '5554999991234');
    await leads.registrarMensagemRecebidaWhatsApp(tx, a.leadId, { id: 'VELHA', texto: 'Antiga', recebidoEm: new Date(Date.now() - 91 * 86400_000) });
    const agora = new Date();
    for (let i = 0; i < 105; i++) {
      await leads.registrarMensagemRecebidaWhatsApp(tx, a.leadId, { id: String(i).padStart(3, '0'), texto: 'Mensagem', recebidoEm: agora });
    }
    const pagina = await leads.listarMensagensWhatsApp(tx, a.leadId);
    expect(pagina).toHaveLength(100);
    const anteriores = await leads.listarMensagensWhatsApp(tx, a.leadId, pagina[0].id);
    expect(anteriores).toHaveLength(5);
    expect(new Set([...pagina, ...anteriores].map(m => m.id)).size).toBe(105);
  });
});
