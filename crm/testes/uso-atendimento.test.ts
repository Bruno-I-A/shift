import { describe, expect, it } from 'vitest';
import { estimarCustoAtendimento, registrarUsoAtendimento, resumirUsoAtendimento } from '@/lib/uso-atendimento';
import { iniciarAtendimentoWhatsApp } from '@/lib/leads';
import { bancoDeTeste } from './banco-de-teste';

describe('uso da IA sem conteúdo pessoal', () => {
  it('distingue leitura e escrita de cache e deixa modelo desconhecido sem preço inventado', () => {
    const uso = { modelo: 'claude-haiku-4-5-20251001', inputTokens: 1000, outputTokens: 100, cacheReadTokens: 1000, cacheCreationTokens: 1000 };
    expect(estimarCustoAtendimento(uso)).toBeCloseTo(0.00285);
    expect(estimarCustoAtendimento({ ...uso, modelo: 'desconhecido' })).toBeNull();
  });
  it('mede o Haiku 5.5 com sua tarifa e inclui cache no limiar de contexto longo', () => {
    const uso = { modelo: 'claude-haiku-5-5', inputTokens: 1000, outputTokens: 100, cacheReadTokens: 1000, cacheCreationTokens: 1000 };
    expect(estimarCustoAtendimento(uso)).toBeCloseTo(0.000285, 8);
    expect(estimarCustoAtendimento({ ...uso, inputTokens: 100_000, cacheReadTokens: 0, cacheCreationTokens: 0 })).toBeCloseTo(0.01005, 8);
    expect(estimarCustoAtendimento({ ...uso, inputTokens: 100_001, cacheReadTokens: 0, cacheCreationTokens: 0 })).toBeCloseTo(0.0502505, 8);
    expect(estimarCustoAtendimento({ ...uso, inputTokens: 1, cacheReadTokens: 100_000, cacheCreationTokens: 0 })).toBeCloseTo(0.0052505, 8);
  });
  it('registra chamadas e soma tokens com o papel restrito, sem poder alterar o histórico', async () => {
    const { tx } = await bancoDeTeste();
    const a = await iniciarAtendimentoWhatsApp(tx, '5554999991234');
    const uso = { modelo: 'claude-haiku-4-5-20251001', inputTokens: 1000, outputTokens: 100, cacheReadTokens: 0, cacheCreationTokens: 0 };
    await registrarUsoAtendimento(tx, a.leadId, uso);
    await registrarUsoAtendimento(tx, a.leadId, uso);
    expect((await resumirUsoAtendimento(tx)).modelos).toMatchObject([{ chamadas: 2, entrada: '2000', saida: '200' }]);
    await expect(tx.query('update crm.uso_ia_whatsapp set entrada = 0')).rejects.toThrow(/permission denied/);
    await expect(tx.query('delete from crm.uso_ia_whatsapp')).rejects.toThrow(/permission denied/);
    await expect(registrarUsoAtendimento(tx, a.leadId, { ...uso, outputTokens: -1 })).rejects.toThrow();
  });
});
