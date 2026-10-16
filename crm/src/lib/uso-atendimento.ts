import 'server-only';
import * as z from 'zod';
import type { Consulta } from './consulta';

const esquema = z.object({ modelo: z.string().regex(/^[a-zA-Z0-9_.:-]{1,100}$/),
  inputTokens: z.number().int().nonnegative().max(10_000_000), outputTokens: z.number().int().nonnegative().max(10_000_000),
  cacheReadTokens: z.number().int().nonnegative().max(10_000_000), cacheCreationTokens: z.number().int().nonnegative().max(10_000_000),
});

/** Preços padrão por milhão; cache de escrita de 5 min. Não é a fatura da Anthropic. */
export function estimarCustoAtendimento(uso: z.infer<typeof esquema>): number | null {
  // O limiar do Haiku 5.5 conta toda a entrada, incluindo os tokens de cache.
  const entradaTotal = uso.inputTokens + uso.cacheReadTokens + uso.cacheCreationTokens;
  const valores = uso.modelo === 'claude-haiku-5-5' ? (entradaTotal > 100_000 ? [0.5, 2.5] : [0.1, 0.5])
    : uso.modelo.startsWith('claude-haiku-4-5') ? [1, 5]
    : uso.modelo.startsWith('claude-sonnet-4-6') ? [3, 15] : null;
  if (!valores) return null;
  return (uso.inputTokens * valores[0] + uso.outputTokens * valores[1]
    + uso.cacheReadTokens * valores[0] * 0.1 + uso.cacheCreationTokens * valores[0] * 1.25) / 1_000_000;
}

export async function registrarUsoAtendimento(tx: Consulta, leadId: string, bruto: z.infer<typeof esquema>): Promise<void> {
  const id = z.uuid().parse(leadId);
  const uso = esquema.parse(bruto);
  await tx.query(`insert into crm.uso_ia_whatsapp
    (lead_id, modelo, entrada, saida, cache_leitura, cache_criacao, custo_estimado_usd)
    values ($1,$2,$3,$4,$5,$6,$7)`, [id, uso.modelo, uso.inputTokens, uso.outputTokens, uso.cacheReadTokens, uso.cacheCreationTokens, estimarCustoAtendimento(uso)]);
}

export async function resumirUsoAtendimento(tx: Consulta, dias = 7) {
  const janela = z.number().int().min(1).max(90).parse(dias);
  await tx.query('select crm.limpar_uso_ia_whatsapp()');
  const { rows } = await tx.query<{ modelo: string; chamadas: number; entrada: string; saida: string; cacheLeitura: string; cacheCriacao: string; custoEstimadoUsd: string | null }>(
    `select modelo, count(*)::int as chamadas, sum(entrada)::text as entrada, sum(saida)::text as saida,
     sum(cache_leitura)::text as "cacheLeitura", sum(cache_criacao)::text as "cacheCriacao",
     sum(custo_estimado_usd)::text as "custoEstimadoUsd"
     from crm.uso_ia_whatsapp where criado_em > now() - ($1 * interval '1 day') group by modelo order by modelo`, [janela]);
  return { dias: janela, aviso: 'Estimativa de tokens da API, não inclui taxas/impostos e não reconstrói gastos anteriores a esta atualização.', modelos: rows };
}
