import { describe, expect, it, vi } from 'vitest';

import * as leads from '@/lib/leads';
import { bancoDeTeste } from './banco-de-teste';

const analise = {
  resposta: 'Bruno, vocês já usam algum sistema para as agendas?', nome: 'Bruno',
  empresa: 'Clínica', segmento: 'Odontologia', dor: 'Organizar agendamentos', prazo: '',
  resumo: 'Bruno quer organizar agendamentos da clínica.', passarParaHumano: false,
};

describe('fila durável do atendimento WhatsApp', () => {
  it('confirma a primeira caixa e permite tomada humana antes da segunda', async () => {
    const { tx } = await bancoDeTeste();
    const a = await leads.iniciarAtendimentoWhatsApp(tx, '5554999991234');
    await leads.enfileirarMensagemWhatsApp(tx, a, { id: 'CAIXAS', texto: 'Quero um site' });
    await tx.query("update crm.fila_whatsapp set disponivel_em = now() - interval '1 second'");
    const lote = (await leads.reservarLoteWhatsApp(tx))!;
    const envio = await leads.concluirLoteWhatsApp(tx, lote, { ...analise, resposta: 'Podemos planejar o site juntos.\n\nQual é a prioridade do projeto?' });
    expect(typeof envio).not.toBe('string');
    if (typeof envio === 'string') return;
    const enviar = vi.fn(async () => 'META.CAIXA1');
    expect(await leads.enviarLotePreparadoWhatsApp(tx, lote, envio, enviar, 0)).toBe(true);
    await leads.mudarModoAtendimentoWhatsApp(tx, a.leadId, 'humano');
    expect(await leads.enviarLotePreparadoWhatsApp(tx, lote, envio, enviar, 1)).toBe(false);
    expect(enviar).toHaveBeenCalledOnce();
    expect((await leads.listarMensagensWhatsApp(tx, a.leadId)).filter(m => m.autor === 'agente').map(m => m.estado)).toEqual(['enviado', 'erro']);
  });
  it('espera silêncio, junta mensagens na ordem recebida e não cobra duplicatas de webhook', async () => {
    const { tx } = await bancoDeTeste();
    // Fixa now() na transação para simular a pausa sem sleep ou flutuação do relógio.
    await tx.query('begin');
    const a = await leads.iniciarAtendimentoWhatsApp(tx, '5554999991234');
    await leads.registrarRespostaWhatsApp(tx, a, 'ABERTURA', { ...analise, resposta: 'Como posso ajudar?' });
    await leads.marcarEnvioWhatsApp(tx, 'ABERTURA', true);
    const instante = new Date();
    expect(await leads.enfileirarMensagemWhatsApp(tx, a, { id: 'ZZ', texto: 'Sou Bruno', recebidoEm: instante })).toBe(true);
    // Nos chats reais houve complementos nove segundos depois: ainda é um turno.
    await tx.query("update crm.fila_whatsapp set disponivel_em = disponivel_em - interval '9 seconds'");
    expect(await leads.reservarLoteWhatsApp(tx)).toBeNull();
    expect(await leads.enfileirarMensagemWhatsApp(tx, a, { id: 'AA', texto: 'Tenho uma clínica', recebidoEm: instante })).toBe(true);
    await tx.query("update crm.fila_whatsapp set disponivel_em = disponivel_em - interval '9 seconds'");
    expect(await leads.reservarLoteWhatsApp(tx)).toBeNull();
    expect(await leads.enfileirarMensagemWhatsApp(tx, a, { id: 'AA', texto: 'Tenho uma clínica', recebidoEm: instante })).toBe(false);
    expect((await tx.query('select versao from crm.fila_whatsapp')).rows).toEqual([{ versao: 2 }]);
    await tx.query("update crm.fila_whatsapp set disponivel_em = now() - interval '1 second'");
    const lote = (await leads.reservarLoteWhatsApp(tx))!;
    expect(lote.texto).toBe('Sou Bruno\nTenho uma clínica');
    expect(lote.atendimento.historico).toEqual([{ autor: 'agente', texto: 'Como posso ajudar?' }]);
    expect(await leads.reservarLoteWhatsApp(tx)).toBeNull();
    const enviar = vi.fn(async () => 'META1');
    const envio = await leads.concluirLoteWhatsApp(tx, lote, analise);
    expect(envio).toMatchObject({ id: 'AA', texto: analise.resposta });
    expect(enviar).not.toHaveBeenCalled();
    if (typeof envio !== 'string') await leads.enviarLotePreparadoWhatsApp(tx, lote, envio, enviar);
    expect(await leads.concluirLoteWhatsApp(tx, lote, analise)).toBe('cancelado');
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(await leads.enfileirarMensagemWhatsApp(tx, a, { id: 'AA', texto: 'Tenho uma clínica' })).toBe(false);
    expect((await tx.query('select * from crm.fila_whatsapp')).rows).toHaveLength(0);
    await tx.query('commit');
  });

  it('descarta análise obsoleta e reagrupa quando chega texto durante a IA', async () => {
    const { tx } = await bancoDeTeste();
    const a = await leads.iniciarAtendimentoWhatsApp(tx, '5554999991234');
    await leads.enfileirarMensagemWhatsApp(tx, a, { id: 'A', texto: 'Quero um site' });
    await tx.query("update crm.fila_whatsapp set disponivel_em = now() - interval '1 second'");
    const antigo = (await leads.reservarLoteWhatsApp(tx))!;
    await leads.enfileirarMensagemWhatsApp(tx, a, { id: 'B', texto: 'Na verdade é um sistema interno' });
    const enviar = vi.fn(async () => 'META1');
    expect(await leads.concluirLoteWhatsApp(tx, antigo, analise)).toBe('reagrupar');
    expect(enviar).not.toHaveBeenCalled();
    expect((await leads.buscarAtendimentoWhatsApp(tx, a.whatsapp))?.nome).toBe('');
    expect(await leads.reservarLoteWhatsApp(tx)).toBeNull();
    await tx.query("update crm.fila_whatsapp set disponivel_em = now() - interval '1 second'");
    const atual = (await leads.reservarLoteWhatsApp(tx))!;
    expect(atual.texto).toBe('Quero um site\nNa verdade é um sistema interno');
    expect(atual.atendimento.historico).toEqual([]);
    const envio = await leads.concluirLoteWhatsApp(tx, atual, analise);
    if (typeof envio !== 'string') await leads.enviarLotePreparadoWhatsApp(tx, atual, envio, enviar);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('recupera reserva vencida após reinício e invalida o processo antigo', async () => {
    const { tx } = await bancoDeTeste();
    const a = await leads.iniciarAtendimentoWhatsApp(tx, '5554999991234');
    await leads.enfileirarMensagemWhatsApp(tx, a, { id: 'RECUPERAR', texto: 'Continuamos?' });
    await tx.query("update crm.fila_whatsapp set disponivel_em = now() - interval '1 second'");
    const antigo = (await leads.reservarLoteWhatsApp(tx))!;
    await tx.query("update crm.fila_whatsapp set reserva_ate = now() - interval '1 second'");
    const recuperado = (await leads.reservarLoteWhatsApp(tx))!;
    expect(recuperado.ids).toEqual(antigo.ids);
    expect(recuperado.reserva).not.toBe(antigo.reserva);
    const enviar = vi.fn(async () => 'META1');
    expect(await leads.concluirLoteWhatsApp(tx, antigo, analise)).toBe('cancelado');
    expect(enviar).not.toHaveBeenCalled();
    const envio = await leads.concluirLoteWhatsApp(tx, recuperado, analise);
    expect(envio).toMatchObject({ id: 'RECUPERAR' });
    if (typeof envio !== 'string') await leads.enviarLotePreparadoWhatsApp(tx, recuperado, envio, enviar);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('assumir atendimento cancela pendentes e resposta da IA em andamento', async () => {
    const { tx } = await bancoDeTeste();
    const a = await leads.iniciarAtendimentoWhatsApp(tx, '5554999991234');
    await leads.enfileirarMensagemWhatsApp(tx, a, { id: 'ASSUMIR', texto: 'Preciso de ajuda' });
    await tx.query("update crm.fila_whatsapp set disponivel_em = now() - interval '1 second'");
    const lote = (await leads.reservarLoteWhatsApp(tx))!;
    await leads.mudarModoAtendimentoWhatsApp(tx, a.leadId, 'humano');
    await leads.mudarModoAtendimentoWhatsApp(tx, a.leadId, 'agente');
    const enviar = vi.fn(async () => 'META1');
    expect(await leads.concluirLoteWhatsApp(tx, lote, analise)).toBe('cancelado');
    expect(enviar).not.toHaveBeenCalled();
    expect(await leads.reservarLoteWhatsApp(tx)).toBeNull();
    await leads.mudarModoAtendimentoWhatsApp(tx, a.leadId, 'humano');
    expect(await leads.enfileirarMensagemWhatsApp(tx, a, { id: 'HUMANO', texto: 'Obrigado' })).toBe(false);
    expect((await leads.listarMensagensWhatsApp(tx, a.leadId)).at(-1)?.texto).toBe('Obrigado');
  });

  it('divide um lote excepcionalmente longo sem perder texto e limita recuperação operacional', async () => {
    const { tx } = await bancoDeTeste();
    const a = await leads.iniciarAtendimentoWhatsApp(tx, '5554999991234');
    for (let i = 0; i < 4; i++) await leads.enfileirarMensagemWhatsApp(tx, a, { id: `LONGA${i}`, texto: 'a'.repeat(4000) });
    await tx.query("update crm.fila_whatsapp set disponivel_em = now() - interval '1 second'");
    const lote = (await leads.reservarLoteWhatsApp(tx))!;
    expect(lote.texto.length).toBeLessThanOrEqual(12_000);
    const enviar = vi.fn(async () => 'META1');
    const envio = await leads.concluirLoteWhatsApp(tx, lote, analise);
    if (typeof envio !== 'string') await leads.enviarLotePreparadoWhatsApp(tx, lote, envio, enviar);
    const proximo = (await leads.reservarLoteWhatsApp(tx))!;
    expect([...lote.ids, ...proximo.ids]).toHaveLength(4);
    expect(proximo.atendimento.historico?.filter(m => m.autor === 'cliente').map(m => m.texto)).toHaveLength(lote.ids.length);
    await tx.query('update crm.fila_whatsapp set tentativas = 3');
    await leads.liberarLoteWhatsApp(tx, proximo);
    expect((await leads.buscarAtendimentoWhatsApp(tx, a.whatsapp))?.modo).toBe('humano');
    expect((await tx.query('select * from crm.fila_whatsapp')).rows).toHaveLength(0);
  });

  it('fecha pendências e reabre o número mesmo quando sobrou uma fila de atendimento encerrado', async () => {
    const { tx } = await bancoDeTeste();
    const anterior = await leads.iniciarAtendimentoWhatsApp(tx, '5554999991234');
    await leads.enfileirarMensagemWhatsApp(tx, anterior, { id: 'ANTERIOR', texto: 'Um site' });
    await leads.mudarEtapaDoLead(tx, anterior.leadId, 'ganho', 'bruno');
    expect((await tx.query('select * from crm.fila_whatsapp')).rows).toHaveLength(0);
    expect(await leads.enfileirarMensagemWhatsApp(tx, anterior, { id: 'ATRASADA', texto: 'Outra mensagem' })).toBe(false);
    // Simula resíduo operacional anterior à correção: a FK não pode bloquear a reabertura.
    await tx.query('insert into crm.fila_whatsapp (lead_id, mensagens) values ($1, $2)', [anterior.leadId, ['e:ANTERIOR']]);
    const atual = await leads.iniciarAtendimentoWhatsApp(tx, anterior.whatsapp);
    expect(atual.leadId).not.toBe(anterior.leadId);
    expect(atual.etapa).toBe('novo');
    expect((await tx.query('select * from crm.fila_whatsapp')).rows).toHaveLength(0);
  });

  it('não reserva trabalho fora das 24 horas nem envia análise que atravessou o limite', async () => {
    const { db, tx } = await bancoDeTeste();
    const a = await leads.iniciarAtendimentoWhatsApp(tx, '5554999991234');
    await leads.enfileirarMensagemWhatsApp(tx, a, { id: 'EXPIRADA', texto: 'Olá', recebidoEm: new Date(Date.now() - 86_401_000) });
    await tx.query("update crm.fila_whatsapp set disponivel_em = now() - interval '1 second'");
    expect(await leads.reservarLoteWhatsApp(tx)).toBeNull();
    expect((await tx.query('select * from crm.fila_whatsapp')).rows).toHaveLength(0);
    await leads.enfileirarMensagemWhatsApp(tx, a, { id: 'NAJANELA', texto: 'Agora pode' });
    await tx.query("update crm.fila_whatsapp set disponivel_em = now() - interval '1 second'");
    const lote = (await leads.reservarLoteWhatsApp(tx))!;
    await db.exec("reset role; update crm.conversa_whatsapp set criado_em = now() - interval '25 hours' where autor = 'cliente'; set role shift_crm_app");
    expect(await leads.concluirLoteWhatsApp(tx, lote, analise)).toBe('cancelado');
    expect((await tx.query('select * from crm.mensagem_whatsapp')).rows).toHaveLength(0);
  });

  it('intenção durável não volta à fila após reinício; tomada humana ainda cancela o envio preparado', async () => {
    const { tx } = await bancoDeTeste();
    const a = await leads.iniciarAtendimentoWhatsApp(tx, '5554999991234');
    await leads.enfileirarMensagemWhatsApp(tx, a, { id: 'INTENCAO', texto: 'Meu projeto' });
    await tx.query("update crm.fila_whatsapp set disponivel_em = now() - interval '1 second'");
    const lote = (await leads.reservarLoteWhatsApp(tx))!;
    const envio = await leads.concluirLoteWhatsApp(tx, lote, analise);
    expect(typeof envio).toBe('object');
    expect(await leads.reservarLoteWhatsApp(tx)).toBeNull();
    expect((await leads.listarMensagensWhatsApp(tx, a.leadId)).find(m => m.id === 's:INTENCAO')?.estado).toBe('pendente');
    await leads.mudarModoAtendimentoWhatsApp(tx, a.leadId, 'humano');
    const enviar = vi.fn(async () => 'META1');
    if (typeof envio !== 'string') await leads.enviarLotePreparadoWhatsApp(tx, lote, envio, enviar);
    expect(enviar).not.toHaveBeenCalled();
    expect((await leads.listarMensagensWhatsApp(tx, a.leadId)).find(m => m.id === 's:INTENCAO')?.estado).toBe('erro');
  });

  it('resposta humana invalida também a contingência que já preparou passagem para humano', async () => {
    const { tx } = await bancoDeTeste();
    const a = await leads.iniciarAtendimentoWhatsApp(tx, '5554999991234');
    await leads.enfileirarMensagemWhatsApp(tx, a, { id: 'FALLBACK', texto: 'Está funcionando?' });
    await tx.query("update crm.fila_whatsapp set disponivel_em = now() - interval '1 second'");
    const lote = (await leads.reservarLoteWhatsApp(tx))!;
    const envio = await leads.concluirLoteWhatsApp(tx, lote, { ...analise, passarParaHumano: true });
    expect((await leads.buscarAtendimentoWhatsApp(tx, a.whatsapp))?.modo).toBe('humano');
    await leads.prepararRespostaHumanaWhatsApp(tx, a.leadId, '3f8bdd48-3022-4a80-a18e-660f811047cc', 'Eu já te ajudo.');
    const enviar = vi.fn(async () => 'META1');
    if (typeof envio !== 'string') await leads.enviarLotePreparadoWhatsApp(tx, lote, envio, enviar);
    expect(enviar).not.toHaveBeenCalled();
  });

  it('limita reservas vencidas sucessivas mesmo sem passagem por liberar após um crash', async () => {
    const { tx } = await bancoDeTeste();
    const a = await leads.iniciarAtendimentoWhatsApp(tx, '5554999991234');
    await leads.enfileirarMensagemWhatsApp(tx, a, { id: 'REINICIO', texto: 'Oi' });
    await tx.query("update crm.fila_whatsapp set disponivel_em = now() - interval '1 second'");
    for (let i = 0; i < 3; i++) {
      expect(await leads.reservarLoteWhatsApp(tx)).not.toBeNull();
      await tx.query("update crm.fila_whatsapp set reserva_ate = now() - interval '1 second'");
    }
    expect(await leads.reservarLoteWhatsApp(tx)).toBeNull();
    expect((await leads.buscarAtendimentoWhatsApp(tx, a.whatsapp))?.modo).toBe('humano');
    expect((await tx.query('select * from crm.fila_whatsapp')).rows).toHaveLength(0);
  });
});
