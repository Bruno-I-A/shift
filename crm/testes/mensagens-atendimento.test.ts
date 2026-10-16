import { afterEach, describe, expect, it, vi } from 'vitest';
import { separarRespostaAtendimento } from '@/lib/mensagens-atendimento';
import { iniciarDigitandoMeta } from '@/lib/whatsapp';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('mensagens curtas e indicador oficial', () => {
  it('separa explicação e pergunta sem apagar conteúdo nem dividir palavras', () => {
    const texto = `${'A clínica quer apresentar os tratamentos com clareza. '.repeat(9)}\n\nO paciente precisa conseguir agendar pelo site?`;
    const partes = separarRespostaAtendimento(texto);
    expect(partes.length).toBeGreaterThan(2);
    expect(partes.every(p => p.length <= 320)).toBe(true);
    expect(partes.join(' ')).toBe(texto.replace(/\s+/g, ' ').trim());
    expect(partes.at(-1)).toBe('O paciente precisa conseguir agendar pelo site?');
  });

  it('renova digitando enquanto prepara a resposta e para ao concluir', async () => {
    vi.useFakeTimers();
    vi.stubEnv('WHATSAPP_META_ACCESS_TOKEN', 'teste');
    vi.stubEnv('WHATSAPP_META_PHONE_NUMBER_ID', '123');
    vi.stubEnv('WHATSAPP_META_GRAPH_VERSION', 'v24.0');
    const envio = vi.fn(async (_url: string, opcoes: RequestInit) => {
      expect(JSON.parse(String(opcoes.body))).toEqual({ messaging_product: 'whatsapp', status: 'read', message_id: 'wamid.ENTRADA', typing_indicator: { type: 'text' } });
      return Response.json({ success: true });
    });
    vi.stubGlobal('fetch', envio);
    const parar = await iniciarDigitandoMeta('wamid.ENTRADA');
    try {
      expect(envio).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(20_000);
      expect(envio).toHaveBeenCalledTimes(2);
    } finally { parar(); }
    await vi.advanceTimersByTimeAsync(40_000);
    expect(envio).toHaveBeenCalledTimes(2);
  });

  it('não derruba a conversa se a Meta recusar o indicador', async () => {
    vi.stubEnv('WHATSAPP_META_ACCESS_TOKEN', 'teste');
    vi.stubEnv('WHATSAPP_META_PHONE_NUMBER_ID', '123');
    vi.stubEnv('WHATSAPP_META_GRAPH_VERSION', 'v24.0');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 400 })));
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try { (await iniciarDigitandoMeta('wamid.ENTRADA'))(); }
    finally { log.mockRestore(); }
  });
});
