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
import type { AnaliseAtendimento, ContextoAtendimento } from "./ia-atendimento";
import { mascararDados } from "./dados-sensiveis";
import { separarRespostaAtendimento } from './mensagens-atendimento';

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
  await tx.query('select lead_id from crm.atendimento_whatsapp where lead_id = $1 for update', [id]);
  const { rows } = await tx.query<{ de: string }>(
    `update crm.lead l set etapa = $2::crm.etapa_lead, etapa_desde = now(), atualizado_em = now()
       from (select id, etapa from crm.lead where id = $1 for update) antes
      where l.id = antes.id and antes.etapa <> $2::crm.etapa_lead
      returning antes.etapa::text as de`,
    [id, para],
  );
  if (['ganho', 'perdido'].includes(para)) await tx.query('delete from crm.fila_whatsapp where lead_id = $1', [id]);
  if (rows[0]) await registrarEventoDoLead(tx, id, ator, "lead_etapa_mudou", { de: rows[0].de, para });
}

export interface AtendimentoWhatsApp extends ContextoAtendimento {
  revisao: number;
  leadId: string;
  whatsapp: string;
  modo: "agente" | "humano";
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
    `select aw.lead_id as "leadId", aw.whatsapp, aw.modo, aw.resumo, aw.revisao,
            l.etapa::text as etapa,
            case when l.nome = 'Contato WhatsApp' then '' else l.nome end as nome,
            l.empresa, l.segmento, l.dor, l.respostas->>'prazo' as prazo,
            l.respostas as qualificacao,
            coalesce((select mw.texto from crm.conversa_whatsapp mw
              where mw.lead_id = l.id and mw.estado = 'enviado' and mw.autor <> 'cliente'
              order by mw.criado_em desc, mw.id desc limit 1), '') as "ultimaResposta"
       from crm.atendimento_whatsapp aw join crm.lead l on l.id = aw.lead_id
      where aw.whatsapp = $1`, [whatsapp],
  );
  return rows[0] ?? null;
}

/** O primeiro registro acontece só depois da resposta afirmativa ao aviso de privacidade. */
export async function autorizarAtendimentoWhatsApp(tx: Consulta, whatsapp: string): Promise<AtendimentoWhatsApp> {
  if (!/^\d{10,15}$/.test(whatsapp)) throw new ErroDeDominio("WhatsApp inválido.");
  await tx.query("select pg_advisory_xact_lock(hashtext($1))", [whatsapp]);
  // Mesma ordem do ingresso e da conclusão: atendimento, depois fila.
  await tx.query('select lead_id from crm.atendimento_whatsapp where whatsapp = $1 for update', [whatsapp]);
  const anterior = await buscarAtendimentoWhatsApp(tx, whatsapp);
  if (anterior && !["ganho", "perdido"].includes(anterior.etapa)) return anterior;
  const { rows: existentes } = await tx.query<{ id: string; etapa: EtapaLead }>(
    `select id, etapa::text as etapa from crm.lead where whatsapp = $1 and etapa not in ('ganho', 'perdido')
      order by criado_em desc limit 1`, [whatsapp],
  );
  let leadId = existentes[0]?.id;
  if (!leadId) {
    const { rows } = await tx.query<{ id: string }>(
      `insert into crm.lead (nome, whatsapp, origem, consentimento_em)
       values ('Contato WhatsApp', $1, 'whatsapp', now()) returning id`, [whatsapp],
    );
    leadId = rows[0].id;
    await registrarEventoDoLead(tx, leadId, "sistema", "lead_recebido", { origem: "whatsapp" });
  }
  if (anterior) await tx.query('delete from crm.fila_whatsapp where lead_id = $1', [anterior.leadId]);
  await tx.query(
    `insert into crm.atendimento_whatsapp (lead_id, whatsapp) values ($1, $2)
      on conflict (whatsapp) do update set lead_id = excluded.lead_id,
        modo = 'agente', resumo = '', atualizado_em = now()`, [leadId, whatsapp],
  );
  await registrarEventoDoLead(tx, leadId, "sistema", "whatsapp_autorizado");
  return (await buscarAtendimentoWhatsApp(tx, whatsapp))!;
}

/** Id da mensagem de origem impede que o webhook repetido avance o funil duas vezes. */
export async function registrarRespostaWhatsApp(
  tx: Consulta, atendimento: AtendimentoWhatsApp, idMensagem: string,
  analise: AnaliseAtendimento,
  partes = [analise.resposta],
): Promise<boolean> {
  const { rows } = await tx.query<{ id: string }>(
    `insert into crm.mensagem_whatsapp (id, lead_id, resposta)
     values ($1, $2, $3) on conflict (id) do nothing returning id`,
    [idMensagem, atendimento.leadId, analise.resposta],
  );
  if (!rows[0]) return false;
  for (const [indice, texto] of partes.entries()) {
    await tx.query(`insert into crm.conversa_whatsapp (id, lead_id, autor, texto, criado_em)
      values ($1, $2, 'agente', $3, now() + ($4 * interval '1 millisecond')) on conflict (id) do nothing`,
      [indice === 0 ? `s:${idMensagem}` : `s:${idMensagem}:p${String(indice).padStart(2, '0')}`, atendimento.leadId, texto, indice]);
  }

  const nome = analise.nome.trim() || null;
  const empresa = analise.empresa.trim() || null;
  const segmento = analise.segmento.trim() || null;
  const dor = analise.dor.trim() || null;
  const prazo = analise.prazo.trim() || null;
  const qualificacao = Object.fromEntries(Object.entries(analise.qualificacao ?? {})
    .filter(([, valor]) => valor.trim()).map(([campo, valor]) => [campo, mascararDados(valor.trim())]));
  await tx.query(
    `update crm.lead set
       nome = coalesce($2, nome),
       empresa = coalesce($3, empresa), segmento = coalesce($4, segmento), dor = coalesce($5, dor),
       respostas = (case when $6::text is null then respostas else jsonb_set(respostas, '{prazo}', to_jsonb($6::text)) end) || $7::jsonb,
       atualizado_em = now()
     where id = $1`, [atendimento.leadId, nome, empresa, segmento, dor, prazo, JSON.stringify(qualificacao)],
  );
  await tx.query(
    `update crm.lead set etapa = 'qualificado', etapa_desde = now()
      where id = $1 and etapa = 'novo' and nome <> 'Contato WhatsApp'
        and (dor is not null or (nullif(respostas->>'objetivo', '') is not null
          and respostas->>'objetivo' not in ('Ainda não definido', 'Prefere não informar', 'Não informado')))
        and (empresa is not null or segmento is not null)`,
    [atendimento.leadId],
  );
  await tx.query(
    `update crm.atendimento_whatsapp set resumo = case when $2::text = '' then resumo else $2 end,
      modo = case when $3 then 'humano' else modo end,
      atualizado_em = now() where lead_id = $1`,
    [atendimento.leadId, mascararDados(analise.resumo), analise.passarParaHumano],
  );
  if (analise.passarParaHumano) await registrarEventoDoLead(tx, atendimento.leadId, "sistema", "whatsapp_passou_para_humano");
  return true;
}

export async function marcarEnvioWhatsApp(tx: Consulta, idMensagem: string, enviado: boolean, partes: string[] = []): Promise<void> {
  if (!enviado && partes.length) await tx.query("update crm.conversa_whatsapp set estado = 'erro' where id = any($1::text[]) and estado = 'pendente'", [partes]);
  await tx.query(`update crm.conversa_whatsapp set estado = $2 where id = $1 and ($2 <> 'erro' or estado <> 'enviado')`,
    [`s:${idMensagem}`, enviado ? 'enviado' : 'erro']);
  await tx.query(
    `update crm.mensagem_whatsapp set estado = $2, enviado_em = case when $2 = 'enviado' then now() else null end
      where id = $1`, [idMensagem, enviado ? "enviado" : "erro"],
  );
}

export async function mudarModoAtendimentoWhatsApp(tx: Consulta, leadId: string, modo: "agente" | "humano"): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(leadId)) throw new ErroDeDominio("Lead inválido.");
  const { rows } = await tx.query<{ anterior: string }>(
    `with antes as (select lead_id, modo from crm.atendimento_whatsapp where lead_id = $1 for update)
      update crm.atendimento_whatsapp aw set modo = $2, revisao = revisao + 1, atualizado_em = now()
      from antes where aw.lead_id = antes.lead_id returning antes.modo as anterior`, [leadId, modo],
  );
  if (modo === 'humano') await tx.query('delete from crm.fila_whatsapp where lead_id = $1', [leadId]);
  if (rows[0] && rows[0].anterior !== modo) await registrarEventoDoLead(tx, leadId, "bruno", "whatsapp_modo_mudou", { modo });
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

export interface ConversaWhatsApp {
  leadId: string; nome: string; empresa: string | null; whatsapp: string;
  modo: 'agente' | 'humano'; resumo: string; ultimaMensagem: string | null;
  ultimaEm: Date | null; ultimaRecebidaEm: Date | null;
}

export interface MensagemConversa {
  id: string; autor: 'cliente' | 'agente' | 'humano'; texto: string; tipo: string;
  criadoEm: Date; estado: string;
}

/** Recebidas continuam disponíveis quando a IA está pausada; repetição não duplica. */
export async function registrarMensagemRecebidaWhatsApp(
  tx: Consulta, leadId: string, mensagem: { id: string; texto: string; tipo?: string; recebidoEm?: Date },
): Promise<boolean> {
  await tx.query('select crm.limpar_historico_whatsapp()');
  const { rows } = await tx.query(`insert into crm.conversa_whatsapp (id, lead_id, autor, texto, tipo, criado_em, estado)
    values ($1, $2, 'cliente', $3, $4, $5, 'recebido') on conflict (id) do nothing returning id`,
    [`e:${mensagem.id}`, leadId, mensagem.texto, mensagem.tipo ?? 'text', mensagem.recebidoEm ?? new Date()]);
  return rows.length > 0;
}

export async function listarConversasWhatsApp(tx: Consulta): Promise<ConversaWhatsApp[]> {
  await tx.query('select crm.limpar_historico_whatsapp()');
  const { rows } = await tx.query<ConversaWhatsApp>(`select aw.lead_id as "leadId", l.nome, l.empresa,
    aw.whatsapp, aw.modo, aw.resumo, ultima.texto as "ultimaMensagem", ultima.criado_em as "ultimaEm",
    (select max(criado_em) from crm.conversa_whatsapp where lead_id = aw.lead_id and autor = 'cliente') as "ultimaRecebidaEm"
    from crm.atendimento_whatsapp aw join crm.lead l on l.id = aw.lead_id
    left join lateral (select texto, criado_em from crm.conversa_whatsapp where lead_id = aw.lead_id
      order by criado_em desc, id desc limit 1) ultima on true
    order by coalesce(ultima.criado_em, aw.atualizado_em) desc limit 200`);
  return rows;
}

export async function listarMensagensWhatsApp(tx: Consulta, leadId: string, antesId?: string): Promise<MensagemConversa[]> {
  if (!z.uuid().safeParse(leadId).success) throw new ErroDeDominio('Conversa inválida.');
  const { rows } = await tx.query<MensagemConversa>(`select m.id, m.autor, m.texto, m.tipo, m.criado_em as "criadoEm",
    coalesce(s.estado, m.estado) as estado from crm.conversa_whatsapp m
    left join lateral (select case estado when 'read' then 'lido' when 'delivered' then 'entregue'
      when 'failed' then 'erro' else 'enviado' end as estado from crm.status_whatsapp
      where meta_id = m.meta_id order by
      case estado when 'read' then 4 when 'delivered' then 3 when 'failed' then 2 else 1 end desc limit 1) s on true
    where m.lead_id = $1 and ($2::text is null or (m.criado_em, m.id) <
      (select criado_em, id from crm.conversa_whatsapp where id = $2 and lead_id = $1))
    order by m.criado_em desc, m.id desc limit 100`, [leadId, antesId ?? null]);
  return rows.reverse();
}

export function janelaWhatsAppAberta(ultimaRecebidaEm: Date | null, agora = Date.now()): boolean {
  if (!ultimaRecebidaEm) return false;
  const idade = agora - new Date(ultimaRecebidaEm).getTime();
  return idade >= -60_000 && idade < 86_400_000;
}

/** Prepara uma única tentativa e pausa a IA antes de chamar a Meta. */
export async function prepararRespostaHumanaWhatsApp(tx: Consulta, leadId: string, pedidoId: string, texto: string): Promise<string | null> {
  const dados = z.object({ leadId: z.uuid(), pedidoId: z.uuid(), texto: z.string().trim().min(1).max(4000) }).parse({ leadId, pedidoId, texto });
  const { rows } = await tx.query<{ whatsapp: string; ultima: Date | null }>(`select aw.whatsapp,
    (select max(criado_em) from crm.conversa_whatsapp where lead_id = aw.lead_id and autor = 'cliente') as ultima
    from crm.atendimento_whatsapp aw where aw.lead_id = $1 for update`, [dados.leadId]);
  if (!rows[0]) throw new ErroDeDominio('Conversa não encontrada.');
  if (!janelaWhatsAppAberta(rows[0].ultima)) throw new ErroDeDominio('A janela de 24 horas encerrou. Aguarde uma nova mensagem do cliente para responder.');
  const inserida = await tx.query(`insert into crm.conversa_whatsapp (id, lead_id, autor, texto)
    values ($1, $2, 'humano', $3) on conflict (id) do nothing returning id`, [`h:${dados.pedidoId}`, dados.leadId, dados.texto]);
  if (!inserida.rows[0]) return null;
  await mudarModoAtendimentoWhatsApp(tx, dados.leadId, 'humano');
  return rows[0].whatsapp;
}

export async function confirmarMensagemWhatsApp(tx: Consulta, id: string, metaId: string | null): Promise<void> {
  await tx.query('update crm.conversa_whatsapp set meta_id = $2, estado = $3 where id = $1',
    [id, metaId, metaId ? 'enviado' : 'erro']);
}

export async function registrarStatusWhatsApp(tx: Consulta, status: { id: string; estado: string; ocorridoEm: Date }): Promise<void> {
  await tx.query(`insert into crm.status_whatsapp (meta_id, estado, ocorrido_em) values ($1, $2, $3)
    on conflict (meta_id, estado) do nothing`, [status.id, status.estado, status.ocorridoEm]);
}

/** Trava por conversa durante o envio: assumir no painel impede respostas de IA em andamento. */
export async function responderComAgenteWhatsApp(
  tx: Consulta, atendimento: AtendimentoWhatsApp, id: string, analise: AnaliseAtendimento,
  enviar: (whatsapp: string, texto: string) => Promise<string>,
): Promise<void> {
  const { rows } = await tx.query<{ modo: string; revisao: number }>(
    'select modo, revisao from crm.atendimento_whatsapp where lead_id = $1 for update', [atendimento.leadId]);
  if (!rows[0] || rows[0].modo !== 'agente' || rows[0].revisao !== atendimento.revisao) return;
  if (!await registrarRespostaWhatsApp(tx, atendimento, id, analise)) return;
  try {
    const metaId = await enviar(atendimento.whatsapp, analise.resposta);
    await confirmarMensagemWhatsApp(tx, `s:${id}`, metaId);
    await marcarEnvioWhatsApp(tx, id, true);
  } catch {
    await marcarEnvioWhatsApp(tx, id, false);
    console.error('[whatsapp] envio do agente falhou; confira a conversa no CRM.');
  }
}

/** Gravar e enfileirar são a mesma transação: ACK nunca depende da chamada de IA. */
export async function enfileirarMensagemWhatsApp(
  tx: Consulta, atendimento: AtendimentoWhatsApp,
  mensagem: { id: string; texto: string; tipo?: string; recebidoEm?: Date }, ativo = true,
): Promise<boolean> {
  // Ordem única para a tomada humana, ingresso e conclusão: atendimento, depois fila.
  const { rows } = await tx.query<{ modo: string; etapa: string }>(
    `select aw.modo, l.etapa::text as etapa from crm.atendimento_whatsapp aw
      join crm.lead l on l.id = aw.lead_id where aw.lead_id = $1 for update of aw`, [atendimento.leadId]);
  const nova = await registrarMensagemRecebidaWhatsApp(tx, atendimento.leadId, mensagem);
  if (!nova || !ativo || rows[0]?.modo !== 'agente' || ['ganho', 'perdido'].includes(rows[0].etapa)) return false;
  await tx.query(`insert into crm.fila_whatsapp (lead_id, mensagens) values ($1, array[$2]::text[])
    on conflict (lead_id) do update set
      mensagens = crm.fila_whatsapp.mensagens || excluded.mensagens,
      versao = crm.fila_whatsapp.versao + 1,
      disponivel_em = now() + interval '10 seconds', tentativas = 0`,
    [atendimento.leadId, `e:${mensagem.id}`]);
  return true;
}

export interface LoteWhatsApp {
  leadId: string;
  reserva: string;
  versao: number;
  ids: string[];
  idsAgrupados: string[];
  texto: string;
  temMidia: boolean;
  atendimento: AtendimentoWhatsApp;
}

/** SKIP LOCKED e reserva expirada permitem vários processos sem atender duas vezes. */
export async function reservarLoteWhatsApp(tx: Consulta): Promise<LoteWhatsApp | null> {
  // Reinícios durante a IA também contam: uma reserva que expirou três vezes
  // vai para humano em vez de cobrar indefinidamente sem chegar a liberar().
  const { rows: esgotadas } = await tx.query<{ leadId: string }>(
    `select aw.lead_id as "leadId" from crm.atendimento_whatsapp aw
      join crm.fila_whatsapp f on f.lead_id = aw.lead_id
      where f.tentativas >= 3 and (f.reserva_ate is null or f.reserva_ate < now())
      limit 20 for update of aw skip locked`);
  for (const esgotada of esgotadas) await mudarModoAtendimentoWhatsApp(tx, esgotada.leadId, 'humano');
  // Trabalho antigo não pode produzir resposta livre fora da janela da Meta.
  await tx.query(`delete from crm.fila_whatsapp f where not exists (
    select 1 from crm.conversa_whatsapp m where m.lead_id = f.lead_id
      and m.autor = 'cliente' and m.criado_em > now() - interval '24 hours')`);
  const { rows } = await tx.query<{ leadId: string; reserva: string; versao: number; mensagens: string[]; whatsapp: string }>(
    `with proxima as (
      select f.lead_id from crm.fila_whatsapp f
      join crm.atendimento_whatsapp aw on aw.lead_id = f.lead_id
      join crm.lead l on l.id = f.lead_id
      where f.disponivel_em <= now() and (f.reserva_ate is null or f.reserva_ate < now()) and f.tentativas < 3
        and aw.modo = 'agente' and l.etapa not in ('ganho', 'perdido')
      order by f.disponivel_em limit 1 for update of f skip locked
    )
    update crm.fila_whatsapp f set reserva = gen_random_uuid(),
      reserva_ate = now() + interval '2 minutes', tentativas = tentativas + 1
    from proxima p, crm.atendimento_whatsapp aw
    where f.lead_id = p.lead_id and aw.lead_id = f.lead_id
    returning f.lead_id as "leadId", f.reserva, f.versao, f.mensagens, aw.whatsapp`);
  const reserva = rows[0];
  if (!reserva) return null;
  const atendimento = await buscarAtendimentoWhatsApp(tx, reserva.whatsapp);
  if (!atendimento) return null;
  const { rows: recebidas } = await tx.query<{ id: string; texto: string; tipo: string }>(
    `select m.id, m.texto, m.tipo from unnest($2::text[]) with ordinality as entrada(id, ordem)
      join crm.conversa_whatsapp m on m.id = entrada.id where m.lead_id = $1
      order by m.criado_em, entrada.ordem`, [reserva.leadId, reserva.mensagens]);
  if (!recebidas.length) {
    await tx.query('delete from crm.fila_whatsapp where lead_id = $1 and reserva = $2', [reserva.leadId, reserva.reserva]);
    return null;
  }
  const selecionadas: typeof recebidas = [];
  let tamanho = 0;
  for (const mensagem of recebidas) {
    if (selecionadas.length && tamanho + mensagem.texto.length + 1 > 12_000) break;
    selecionadas.push(mensagem);
    tamanho += mensagem.texto.length + 1;
  }
  const { rows: historico } = await tx.query<{ autor: 'cliente' | 'agente' | 'humano'; texto: string }>(
    `select autor, texto from crm.conversa_whatsapp where lead_id = $1
      and not (id = any($2::text[])) and estado in ('recebido', 'enviado')
      and criado_em <= (select min(criado_em) from crm.conversa_whatsapp where id = any($2::text[]))
      order by criado_em desc, id desc limit 12`, [reserva.leadId, reserva.mensagens]);
  atendimento.historico = historico.reverse();
  return {
    leadId: reserva.leadId, reserva: reserva.reserva, versao: reserva.versao,
    idsAgrupados: reserva.mensagens,
    ids: selecionadas.map(m => m.id), texto: selecionadas.map(m => m.texto).join('\n'),
    temMidia: selecionadas.some(m => m.tipo !== 'text'), atendimento,
  };
}

export interface EnvioLoteWhatsApp {
  id: string;
  whatsapp: string;
  texto: string;
  partes: { id: string; texto: string }[];
}

/**
 * Revalida depois da IA e prepara uma única tentativa durável. O chamador precisa
 * confirmar esta transação ANTES de chamar a Meta: uma queda durante o HTTP deixa
 * a resposta pendente para conferência, sem recolocá-la na fila e reenviar.
 */
export async function concluirLoteWhatsApp(
  tx: Consulta, lote: LoteWhatsApp, analise: AnaliseAtendimento,
): Promise<EnvioLoteWhatsApp | 'reagrupar' | 'cancelado'> {
  const { rows: atendimentos } = await tx.query<{ modo: string; revisao: number; etapa: string; ultima: Date | null }>(
    `select aw.modo, aw.revisao, l.etapa::text as etapa,
      (select max(criado_em) from crm.conversa_whatsapp where lead_id = aw.lead_id and autor = 'cliente') as ultima
      from crm.atendimento_whatsapp aw join crm.lead l on l.id = aw.lead_id
      where aw.lead_id = $1 for update of aw`, [lote.leadId]);
  const { rows } = await tx.query<{ versao: number; reserva: string | null; valida: boolean }>(
    `select versao, reserva, reserva_ate > now() as valida from crm.fila_whatsapp where lead_id = $1 for update`, [lote.leadId]);
  if (!rows[0] || rows[0].reserva !== lote.reserva || !rows[0].valida) return 'cancelado';
  if (atendimentos[0]?.modo !== 'agente' || atendimentos[0]?.revisao !== lote.atendimento.revisao
    || ['ganho', 'perdido'].includes(atendimentos[0].etapa) || !janelaWhatsAppAberta(atendimentos[0].ultima)) {
    await tx.query('delete from crm.fila_whatsapp where lead_id = $1', [lote.leadId]);
    return 'cancelado';
  }
  if (rows[0].versao !== lote.versao) {
    await tx.query('update crm.fila_whatsapp set reserva = null, reserva_ate = null where lead_id = $1', [lote.leadId]);
    return 'reagrupar';
  }
  const id = lote.ids.at(-1)!.slice(2);
  const partes = separarRespostaAtendimento(analise.resposta);
  const preparada = await registrarRespostaWhatsApp(tx, lote.atendimento, id, analise, partes);
  if (analise.passarParaHumano) {
    await tx.query('delete from crm.fila_whatsapp where lead_id = $1', [lote.leadId]);
  } else {
    // Lotes excepcionalmente grandes são divididos sem perder as próximas entradas.
    await tx.query(`update crm.fila_whatsapp set mensagens = array(
      select id from unnest(mensagens) as id where not (id = any($2::text[]))),
      reserva = null, reserva_ate = null, tentativas = 0
      where lead_id = $1 and cardinality(mensagens) > cardinality($2::text[])`, [lote.leadId, lote.ids]);
    await tx.query('delete from crm.fila_whatsapp where lead_id = $1 and reserva = $2', [lote.leadId, lote.reserva]);
  }
  return preparada ? { id, whatsapp: lote.atendimento.whatsapp, texto: analise.resposta,
    partes: partes.map((texto, indice) => ({ id: indice === 0 ? `s:${id}` : `s:${id}:p${String(indice).padStart(2, '0')}`, texto })) } : 'cancelado';
}

/**
 * Executada em uma SEGUNDA transação, depois de confirmar a intenção durável.
 * A trava curta impede a tomada humana durante o HTTP; seu rollback nunca
 * ressuscita o lote. O timeout da Meta limita o tempo em que a conversa espera.
 */
export async function enviarLotePreparadoWhatsApp(
  tx: Consulta, lote: LoteWhatsApp, envio: EnvioLoteWhatsApp,
  enviar: (whatsapp: string, texto: string) => Promise<string>,
  indice = 0,
): Promise<boolean> {
  const parte = envio.partes[indice];
  if (!parte) return false;
  const { rows } = await tx.query<{ revisao: number; etapa: string; ultima: Date | null; novas: boolean }>(
    `select aw.revisao, l.etapa::text as etapa,
      (select max(criado_em) from crm.conversa_whatsapp where lead_id = aw.lead_id and autor = 'cliente') as ultima,
      exists(select 1 from crm.fila_whatsapp f where f.lead_id = aw.lead_id
        and not (f.mensagens <@ $2::text[])) as novas
      from crm.atendimento_whatsapp aw join crm.lead l on l.id = aw.lead_id
      where aw.lead_id = $1 for update of aw`, [lote.leadId, lote.idsAgrupados]);
  if (!rows[0] || rows[0].revisao !== lote.atendimento.revisao
    || rows[0].novas || ['ganho', 'perdido'].includes(rows[0].etapa) || !janelaWhatsAppAberta(rows[0].ultima)) {
    await marcarEnvioWhatsApp(tx, envio.id, false, envio.partes.map(p => p.id));
    return false;
  }
  const { rows: estados } = await tx.query<{ estado: string }>('select estado from crm.conversa_whatsapp where id = $1', [parte.id]);
  if (estados[0]?.estado !== 'pendente') return false;
  const metaId = await enviar(envio.whatsapp, parte.texto);
  await confirmarMensagemWhatsApp(tx, parte.id, metaId);
  if (indice === envio.partes.length - 1) await marcarEnvioWhatsApp(tx, envio.id, true);
  return true;
}

/** Falha operacional tem espera e limite; não fica chamando IA em ciclo infinito. */
export async function liberarLoteWhatsApp(tx: Consulta, lote: LoteWhatsApp): Promise<void> {
  await tx.query('select lead_id from crm.atendimento_whatsapp where lead_id = $1 for update', [lote.leadId]);
  const { rows } = await tx.query<{ tentativas: number }>(
    'select tentativas from crm.fila_whatsapp where lead_id = $1 and reserva = $2 for update', [lote.leadId, lote.reserva]);
  if (!rows[0]) return;
  if (rows[0].tentativas >= 3) {
    await mudarModoAtendimentoWhatsApp(tx, lote.leadId, 'humano');
    return;
  }
  await tx.query(`update crm.fila_whatsapp set reserva = null, reserva_ate = null,
    disponivel_em = greatest(disponivel_em, now() + interval '30 seconds')
    where lead_id = $1 and reserva = $2`, [lote.leadId, lote.reserva]);
}
