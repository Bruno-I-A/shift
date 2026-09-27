/**
 * Leads que chegam do diagnóstico do site.
 *
 * A entrada é pública: qualquer um pode mandar um POST para /api/leads. Por
 * isso tudo que vem de lá passa por `lerEnvioDoSite` (formato, tamanho e
 * consentimento) e por `registrarEnvio` (limite por IP e teto geral) antes de
 * virar linha no banco.
 */
import * as z from "zod";

import type { Consulta } from "./consulta";
import type { Ator } from "./crm";
import { ErroDeDominio } from "./dominio";
import type { EtapaLead } from "./dominio";

export interface Lead {
  id: string;
  nome: string;
  empresa: string | null;
  whatsapp: string;
  segmento: string | null;
  dor: string | null;
  respostas: Record<string, string>;
  nivel: string | null;
  oferta: string | null;
  processo: string | null;
  origem: string;
  etapa: EtapaLead;
  etapaDesde: Date;
  consentimentoEm: Date;
  criadoEm: Date;
  atualizadoEm: Date;
}

const COLUNAS_LEAD = `
  l.id, l.nome, l.empresa, l.whatsapp, l.segmento, l.dor, l.respostas, l.nivel, l.oferta,
  l.processo, l.origem, l.etapa::text as etapa, l.etapa_desde as "etapaDesde",
  l.consentimento_em as "consentimentoEm", l.criado_em as "criadoEm", l.atualizado_em as "atualizadoEm"`;

const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

/** O que `site/diagnostico.html` manda em `sendLead`. Mudou lá, muda aqui. */
const esquemaEnvio = z.object({
  nome: z.string().trim().min(1, "Falta o nome.").max(200),
  empresa: opcional(200),
  whatsapp: z
    .string()
    .trim()
    .max(40)
    .refine((v) => v.replace(/\D/g, "").length >= 10, "WhatsApp precisa ter DDD e número."),
  respostas: z
    .record(z.string().max(40), z.string().max(200))
    .refine((r) => Object.keys(r).length <= 12, "Respostas demais.")
    .default({}),
  nivelCalculado: opcional(200),
  ofertaRecomendada: opcional(200),
  processoSugerido: opcional(500),
  consentimento: z.object({ autorizado: z.literal(true, { error: "Sem consentimento, nada é gravado." }) }),
  origem: z.string().trim().min(1).max(60).default("site"),
});

export interface DadosLead {
  nome: string;
  empresa: string | null;
  whatsapp: string;
  respostas: Record<string, string>;
  nivel: string | null;
  oferta: string | null;
  processo: string | null;
  origem: string;
}

/** Valida o corpo do POST. Qualquer desvio vira `ErroDeDominio` com a razão. */
export function lerEnvioDoSite(corpo: unknown): DadosLead {
  const resultado = esquemaEnvio.safeParse(corpo);
  if (!resultado.success) {
    throw new ErroDeDominio(resultado.error.issues[0]?.message ?? "Envio inválido.");
  }
  const d = resultado.data;
  return {
    nome: d.nome,
    empresa: d.empresa,
    // Só os dígitos: é o que permite reconhecer a mesma pessoa mandando de novo,
    // e o que o link do WhatsApp precisa.
    whatsapp: d.whatsapp.replace(/\D/g, ""),
    respostas: Object.fromEntries(Object.entries(d.respostas).filter(([, v]) => v.trim())),
    nivel: d.nivelCalculado,
    oferta: d.ofertaRecomendada,
    processo: d.processoSugerido,
    origem: d.origem,
  };
}

export const MAX_ENVIOS_POR_IP_HORA = 5;
export const MAX_ENVIOS_TOTAL_HORA = 100;

/**
 * Conta e registra um envio. Devolve `false` quando o limite estourou — e aí
 * nada é registrado, para quem insiste não empurrar a janela para a frente.
 */
export async function registrarEnvio(tx: Consulta, chave: string): Promise<boolean> {
  const { rows } = await tx.query<{ daChave: number; total: number }>(
    `select count(*) filter (where chave = $1)::int as "daChave", count(*)::int as total
       from crm.envio_publico where criado_em > now() - interval '1 hour'`,
    [chave],
  );
  if (rows[0].daChave >= MAX_ENVIOS_POR_IP_HORA || rows[0].total >= MAX_ENVIOS_TOTAL_HORA) return false;
  await tx.query("insert into crm.envio_publico (chave) values ($1)", [chave]);
  await tx.query("delete from crm.envio_publico where criado_em < now() - interval '1 day'");
  return true;
}

async function registrarEventoDoLead(
  tx: Consulta,
  leadId: string,
  ator: Ator,
  tipo: string,
  dados: Record<string, unknown> = {},
) {
  await tx.query(
    "insert into crm.evento (lead_id, ator, tipo, dados) values ($1, $2, $3, $4::jsonb)",
    [leadId, ator, tipo, JSON.stringify(dados)],
  );
}

/**
 * Grava o lead. Se o mesmo WhatsApp já é um lead em aberto, atualiza as
 * respostas em vez de criar outro: quem refaz o diagnóstico não vira duas
 * pessoas no funil.
 */
export async function receberLead(tx: Consulta, dados: DadosLead): Promise<{ id: string; novo: boolean }> {
  const { rows: existentes } = await tx.query<{ id: string }>(
    `select id from crm.lead
      where whatsapp = $1 and etapa not in ('ganho', 'perdido')
      order by criado_em desc limit 1`,
    [dados.whatsapp],
  );
  const segmento = dados.respostas.segmento ?? null;
  const dor = dados.respostas.dor ?? null;

  if (existentes[0]) {
    const id = existentes[0].id;
    await tx.query(
      `update crm.lead
          set nome = $2, empresa = $3, segmento = $4, dor = $5, respostas = $6::jsonb, nivel = $7,
              oferta = $8, processo = $9, consentimento_em = now(), atualizado_em = now()
        where id = $1`,
      [id, dados.nome, dados.empresa, segmento, dor, JSON.stringify(dados.respostas), dados.nivel, dados.oferta, dados.processo],
    );
    await registrarEventoDoLead(tx, id, "site", "lead_refez_diagnostico", { origem: dados.origem });
    return { id, novo: false };
  }

  const { rows } = await tx.query<{ id: string }>(
    `insert into crm.lead
       (nome, empresa, whatsapp, segmento, dor, respostas, nivel, oferta, processo, origem, consentimento_em)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, now())
     returning id`,
    [dados.nome, dados.empresa, dados.whatsapp, segmento, dor, JSON.stringify(dados.respostas), dados.nivel, dados.oferta, dados.processo, dados.origem],
  );
  await registrarEventoDoLead(tx, rows[0].id, "site", "lead_recebido", { origem: dados.origem });
  return { id: rows[0].id, novo: true };
}

export async function listarLeads(tx: Consulta, etapa?: EtapaLead): Promise<Lead[]> {
  const { rows } = await tx.query<Lead>(
    `select ${COLUNAS_LEAD} from crm.lead l
      where $1::text is null or l.etapa = $1::crm.etapa_lead
      order by l.atualizado_em desc
      limit 200`,
    [etapa ?? null],
  );
  return rows;
}

export async function contarLeadsPorEtapa(tx: Consulta): Promise<Record<string, number>> {
  const { rows } = await tx.query<{ etapa: string; n: number }>(
    "select etapa::text as etapa, count(*)::int as n from crm.lead group by etapa",
  );
  return Object.fromEntries(rows.map((r) => [r.etapa, r.n]));
}

export async function mudarEtapaDoLead(tx: Consulta, id: string, para: EtapaLead, ator: Ator): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ErroDeDominio("Lead inválido.");
  const { rows } = await tx.query<{ de: string }>(
    `update crm.lead l set etapa = $2::crm.etapa_lead, etapa_desde = now(), atualizado_em = now()
       from (select id, etapa from crm.lead where id = $1 for update) antes
      where l.id = antes.id and antes.etapa <> $2::crm.etapa_lead
      returning antes.etapa::text as de`,
    [id, para],
  );
  if (rows[0]) await registrarEventoDoLead(tx, id, ator, "lead_etapa_mudou", { de: rows[0].de, para });
}
