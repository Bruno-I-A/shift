/**
 * Leads que chegam do diagnóstico do site ou do atendimento no WhatsApp.
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
import type { AnaliseAtendimento } from "./ia-atendimento";
import { mascararDados } from "./dados-sensiveis";

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
  modoWhatsApp: "agente" | "humano" | null;
  resumoWhatsApp: string | null;
  enviosPendentes: number;
}

const COLUNAS_LEAD = `
  l.id, l.nome, l.empresa, l.whatsapp, l.segmento, l.dor, l.respostas, l.nivel, l.oferta,
  l.processo, l.origem, l.etapa::text as etapa, l.etapa_desde as "etapaDesde",
  l.consentimento_em as "consentimentoEm", l.criado_em as "criadoEm", l.atualizado_em as "atualizadoEm",
  aw.modo as "modoWhatsApp", aw.resumo as "resumoWhatsApp",
  coalesce(pendentes.n, 0)::int as "enviosPendentes"`;

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
      left join crm.atendimento_whatsapp aw on aw.lead_id = l.id
      left join lateral (select count(*)::int as n from crm.mensagem_whatsapp mw
        where mw.lead_id = l.id and mw.estado <> 'enviado') pendentes on true
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

export interface AtendimentoWhatsApp {
  leadId: string;
  whatsapp: string;
  modo: "agente" | "humano";
  resumo: string;
  etapa: EtapaLead;
}

export async function buscarAvisoWhatsApp(tx: Consulta, chave: string): Promise<{ mensagemId: string; enviadoEm: Date } | null> {
  const { rows } = await tx.query<{ mensagemId: string; enviadoEm: Date }>(
    `select mensagem_id as "mensagemId", enviado_em as "enviadoEm"
      from crm.aviso_whatsapp where chave = $1`, [chave],
  );
  return rows[0] ?? null;
}

export async function registrarAvisoWhatsApp(tx: Consulta, chave: string, mensagemId: string): Promise<void> {
  await tx.query(
    `insert into crm.aviso_whatsapp (chave, mensagem_id) values ($1, $2)
      on conflict (chave) do update set mensagem_id = excluded.mensagem_id, enviado_em = now()`,
    [chave, mensagemId],
  );
  await tx.query("delete from crm.aviso_whatsapp where enviado_em < now() - interval '1 day'");
}

export async function apagarAvisoWhatsApp(tx: Consulta, chave: string): Promise<void> {
  await tx.query("delete from crm.aviso_whatsapp where chave = $1", [chave]);
}

export async function buscarAtendimentoWhatsApp(tx: Consulta, whatsapp: string): Promise<AtendimentoWhatsApp | null> {
  const { rows } = await tx.query<AtendimentoWhatsApp>(
    `select aw.lead_id as "leadId", aw.whatsapp, aw.modo, aw.resumo,
            l.etapa::text as etapa
       from crm.atendimento_whatsapp aw join crm.lead l on l.id = aw.lead_id
      where aw.whatsapp = $1`, [whatsapp],
  );
  return rows[0] ?? null;
}

/** O primeiro registro acontece só depois da resposta afirmativa ao aviso de privacidade. */
export async function autorizarAtendimentoWhatsApp(tx: Consulta, whatsapp: string): Promise<AtendimentoWhatsApp> {
  if (!/^\d{10,15}$/.test(whatsapp)) throw new ErroDeDominio("WhatsApp inválido.");
  await tx.query("select pg_advisory_xact_lock(hashtext($1))", [whatsapp]);
  const anterior = await buscarAtendimentoWhatsApp(tx, whatsapp);
  if (anterior && !["ganho", "perdido"].includes(anterior.etapa)) return anterior;
  const { rows: existentes } = await tx.query<{ id: string; etapa: EtapaLead }>(
    `select id, etapa::text as etapa from crm.lead where whatsapp = $1 and etapa not in ('ganho', 'perdido')
      order by criado_em desc limit 1`, [whatsapp],
  );
  let leadId = existentes[0]?.id;
  const etapa = existentes[0]?.etapa ?? "novo";
  if (!leadId) {
    const { rows } = await tx.query<{ id: string }>(
      `insert into crm.lead (nome, whatsapp, origem, consentimento_em)
       values ('Contato WhatsApp', $1, 'whatsapp', now()) returning id`, [whatsapp],
    );
    leadId = rows[0].id;
    await registrarEventoDoLead(tx, leadId, "sistema", "lead_recebido", { origem: "whatsapp" });
  }
  await tx.query(
    `insert into crm.atendimento_whatsapp (lead_id, whatsapp) values ($1, $2)
      on conflict (whatsapp) do update set lead_id = excluded.lead_id,
        modo = 'agente', resumo = '', atualizado_em = now()`, [leadId, whatsapp],
  );
  await registrarEventoDoLead(tx, leadId, "sistema", "whatsapp_autorizado");
  return { leadId, whatsapp, modo: "agente", resumo: "", etapa };
}

/** Id da mensagem de origem impede que o webhook repetido avance o funil duas vezes. */
export async function registrarRespostaWhatsApp(
  tx: Consulta, atendimento: AtendimentoWhatsApp, idMensagem: string,
  analise: AnaliseAtendimento,
): Promise<boolean> {
  const { rows } = await tx.query<{ id: string }>(
    `insert into crm.mensagem_whatsapp (id, lead_id, resposta)
     values ($1, $2, $3) on conflict (id) do nothing returning id`,
    [idMensagem, atendimento.leadId, analise.resposta],
  );
  if (!rows[0]) return false;

  const nome = analise.nome.trim() || null;
  const empresa = analise.empresa.trim() || null;
  const segmento = analise.segmento.trim() || null;
  const dor = analise.dor.trim() || null;
  const prazo = analise.prazo.trim() || null;
  await tx.query(
    `update crm.lead set
       nome = case when $2::text is not null and nome = 'Contato WhatsApp' then $2 else nome end,
       empresa = coalesce(empresa, $3), segmento = coalesce(segmento, $4), dor = coalesce(dor, $5),
       respostas = case when $6::text is null then respostas else jsonb_set(respostas, '{prazo}', to_jsonb($6::text)) end,
       atualizado_em = now()
     where id = $1`, [atendimento.leadId, nome, empresa, segmento, dor, prazo],
  );
  await tx.query(
    `update crm.lead set etapa = 'qualificado', etapa_desde = now()
      where id = $1 and etapa = 'novo' and nome <> 'Contato WhatsApp'
        and dor is not null and (empresa is not null or segmento is not null)`,
    [atendimento.leadId],
  );
  await tx.query(
    `update crm.atendimento_whatsapp set resumo = $2, modo = case when $3 then 'humano' else modo end,
      atualizado_em = now() where lead_id = $1`,
    [atendimento.leadId, mascararDados(analise.resumo), analise.passarParaHumano],
  );
  if (analise.passarParaHumano) await registrarEventoDoLead(tx, atendimento.leadId, "sistema", "whatsapp_passou_para_humano");
  return true;
}

export async function marcarEnvioWhatsApp(tx: Consulta, idMensagem: string, enviado: boolean): Promise<void> {
  await tx.query(
    `update crm.mensagem_whatsapp set estado = $2, enviado_em = case when $2 = 'enviado' then now() else null end
      where id = $1`, [idMensagem, enviado ? "enviado" : "erro"],
  );
}

export async function mudarModoAtendimentoWhatsApp(tx: Consulta, leadId: string, modo: "agente" | "humano"): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(leadId)) throw new ErroDeDominio("Lead inválido.");
  const { rows } = await tx.query<{ leadId: string }>(
    `update crm.atendimento_whatsapp set modo = $2, atualizado_em = now()
      where lead_id = $1 and modo <> $2 returning lead_id as "leadId"`, [leadId, modo],
  );
  if (rows[0]) await registrarEventoDoLead(tx, leadId, "bruno", "whatsapp_modo_mudou", { modo });
}

/** Uma resposta manual pelo aparelho pausa o agente; eco da própria API não pausa. */
export async function pausarSeRespostaHumana(tx: Consulta, whatsapp: string, texto: string): Promise<boolean> {
  const atendimento = await buscarAtendimentoWhatsApp(tx, whatsapp);
  if (!atendimento || atendimento.modo === "humano") return false;
  const { rows } = await tx.query<{ bot: boolean }>(
    `select exists(select 1 from crm.mensagem_whatsapp
      where lead_id = $1 and resposta = $2 and criado_em > now() - interval '10 minutes') as bot`,
    [atendimento.leadId, texto],
  );
  if (rows[0]?.bot) return false;
  await tx.query("update crm.atendimento_whatsapp set modo = 'humano', atualizado_em = now() where lead_id = $1", [atendimento.leadId]);
  await registrarEventoDoLead(tx, atendimento.leadId, "sistema", "whatsapp_resposta_manual");
  return true;
}
