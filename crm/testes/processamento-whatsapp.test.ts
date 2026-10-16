import { afterEach, describe, expect, it, vi } from 'vitest';

import { emTransacao } from '@/lib/banco';
import { analisarAtendimento, ErroChamadaAtendimento } from '@/lib/ia-atendimento';
import * as leads from '@/lib/leads';
import { processarFilaWhatsApp } from '@/lib/processamento-whatsapp';
import { bancoDeTeste } from './banco-de-teste';

vi.mock('@/lib/banco', () => ({ emTransacao: vi.fn() }));
vi.mock('@/lib/whatsapp', async importar => ({
  ...await importar<typeof import('@/lib/whatsapp')>(), iniciarDigitandoMeta: vi.fn(async () => vi.fn()),
}));
vi.mock('@/lib/ia-atendimento', async importar => ({
  ...await importar<typeof import('@/lib/ia-atendimento')>(), analisarAtendimento: vi.fn(),
}));

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

const analise = {
  resposta: 'Entendi. O que mais precisa mudar na agenda?', nome: 'Bruno', empresa: '',
  segmento: '', dor: '', prazo: '', resumo: 'Precisa melhorar a agenda.', passarParaHumano: false,
};

async function preparar() {
  const { tx } = await bancoDeTeste();
  vi.mocked(emTransacao).mockImplementation(async executar => {
    await tx.query('begin');
    try {
      const resultado = await executar(tx);
      await tx.query('commit');
      return resultado;
    } catch (erro) {
      await tx.query('rollback');
      throw erro;
    }
  });
  vi.stubEnv('WHATSAPP_ATIVO', 'sim');
  vi.stubEnv('DATABASE_URL', 'postgres://teste');
  vi.stubEnv('WHATSAPP_META_PHONE_NUMBER_ID', '123');
  vi.stubEnv('WHATSAPP_META_ACCESS_TOKEN', 'meta-teste');
  vi.stubEnv('WHATSAPP_META_GRAPH_VERSION', 'v24.0');
  const atendimento = await leads.autorizarAtendimentoWhatsApp(tx, '5554999991234');
  await leads.enfileirarMensagemWhatsApp(tx, atendimento, { id: 'A', texto: 'Quero organizar' });
  await leads.enfileirarMensagemWhatsApp(tx, atendimento, { id: 'B', texto: 'A agenda da clínica' });
  await tx.query("update crm.fila_whatsapp set disponivel_em = now() - interval '1 second'");
  vi.mocked(analisarAtendimento).mockResolvedValue(analise);
  return { tx, atendimento };
}

describe('worker do WhatsApp', () => {
  it.each([false, true])('confirma cada caixa separadamente sem repetir a primeira; falha na segunda=%s', async (falharSegunda) => {
    const { tx, atendimento } = await preparar();
    vi.mocked(analisarAtendimento).mockResolvedValue({ ...analise, resposta: 'Podemos organizar os tratamentos no site.\n\nQual tratamento é prioridade para a clínica?' });
    let chamadas = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      chamadas++;
      if (chamadas === 2) {
        expect((await leads.listarMensagensWhatsApp(tx, atendimento.leadId)).filter(m => m.autor === 'agente').map(m => m.estado)).toEqual(['enviado', 'pendente']);
        if (falharSegunda) throw new Error('confirmação incerta');
      }
      return Response.json({ messages: [{ id: chamadas === 1 ? 'META.PRIMEIRA' : 'META.SEGUNDA' }] });
    }));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await processarFilaWhatsApp();
      const mensagens = (await leads.listarMensagensWhatsApp(tx, atendimento.leadId)).filter(m => m.autor === 'agente');
      expect(mensagens.map(m => m.texto)).toEqual(['Podemos organizar os tratamentos no site.', 'Qual tratamento é prioridade para a clínica?']);
      expect(mensagens.map(m => m.estado)).toEqual(['enviado', falharSegunda ? 'erro' : 'enviado']);
      expect((await tx.query<{ meta_id: string }>("select meta_id from crm.conversa_whatsapp where id = 's:B'")).rows[0].meta_id).toBe('META.PRIMEIRA');
      expect((await tx.query<{ estado: string }>("select estado from crm.mensagem_whatsapp where id = 'B'")).rows[0].estado).toBe(falharSegunda ? 'erro' : 'enviado');
      await processarFilaWhatsApp();
      expect(chamadas).toBe(2);
      expect(analisarAtendimento).toHaveBeenCalledOnce();
    } finally { log.mockRestore(); }
  });
  it('preserva o diagnóstico seguro no log e encaminha a falha sem repetir a IA', async () => {
    const { tx, atendimento } = await preparar();
    const diagnostico = 'tipo=dns; modelo=claude-haiku-5-5; tentativa=1; fase=conexao; duracao_ms=12';
    vi.mocked(analisarAtendimento).mockRejectedValueOnce(new ErroChamadaAtendimento(diagnostico));
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ messages: [{ id: 'wamid.CONTINGENCIA' }] })));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await processarFilaWhatsApp();
      expect(log).toHaveBeenCalledWith(`[whatsapp] IA indisponível: ${diagnostico}`);
      expect((await leads.buscarAtendimentoWhatsApp(tx, atendimento.whatsapp))?.modo).toBe('humano');
      expect(analisarAtendimento).toHaveBeenCalledOnce();
      expect((await tx.query('select * from crm.fila_whatsapp')).rows).toHaveLength(0);
    } finally { log.mockRestore(); }
  });
  it('faz uma análise para o lote, confirma intenção antes do HTTP e não repete o envio', async () => {
    const { tx, atendimento } = await preparar();
    const fetch = vi.fn(async () => {
      // Segunda transação pode falhar sem recriar o trabalho já consumido.
      expect((await tx.query('select * from crm.fila_whatsapp')).rows).toHaveLength(0);
      expect((await leads.listarMensagensWhatsApp(tx, atendimento.leadId)).at(-1)?.estado).toBe('pendente');
      return Response.json({ messages: [{ id: 'wamid.TESTE' }] });
    });
    vi.stubGlobal('fetch', fetch);
    await processarFilaWhatsApp();
    expect(analisarAtendimento).toHaveBeenCalledTimes(1);
    expect(vi.mocked(analisarAtendimento).mock.calls[0][0]).toBe('Quero organizar\nA agenda da clínica');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await leads.listarMensagensWhatsApp(tx, atendimento.leadId)).at(-1)?.estado).toBe('enviado');
    await processarFilaWhatsApp();
    expect(analisarAtendimento).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('erro HTTP após a intenção não recoloca a resposta na fila nem cobra uma nova análise', async () => {
    const { tx, atendimento } = await preparar();
    const fetch = vi.fn(async () => { throw new Error('timeout depois de a Meta aceitar'); });
    vi.stubGlobal('fetch', fetch);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await processarFilaWhatsApp();
      expect((await leads.buscarAtendimentoWhatsApp(tx, atendimento.whatsapp))?.modo).toBe('humano');
      expect((await leads.listarMensagensWhatsApp(tx, atendimento.leadId)).at(-1)?.estado).toBe('erro');
      expect((await tx.query('select * from crm.fila_whatsapp')).rows).toHaveLength(0);
      await processarFilaWhatsApp();
      expect(analisarAtendimento).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally { log.mockRestore(); }
  });

  it('nova entrada durante a IA descarta a resposta velha antes de enviar e preserva o lote', async () => {
    const { tx, atendimento } = await preparar();
    vi.mocked(analisarAtendimento).mockImplementationOnce(async () => {
      await leads.enfileirarMensagemWhatsApp(tx, atendimento, { id: 'C', texto: 'Na verdade quero um site' });
      return analise;
    });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await processarFilaWhatsApp();
    expect(fetch).not.toHaveBeenCalled();
    expect((await tx.query<{ mensagens: string[] }>('select mensagens from crm.fila_whatsapp')).rows[0].mensagens).toEqual(['e:A', 'e:B', 'e:C']);
    expect((await tx.query('select * from crm.mensagem_whatsapp')).rows).toHaveLength(0);
  });
});
