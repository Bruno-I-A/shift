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
import type { EventoDirect } from './instagram-direct-meta';
import { estimarCustoAtendimento } from './uso-atendimento';
import type { UsoAtendimento } from './ia-atendimento';

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

/**
 * Apaga o lead e tudo o que o atendimento guardou dele (conversa, resumo, fila
 * e eventos). Serve ao pedido de exclusão do titular e a recomeçar um teste: a
 * próxima mensagem do número volta a pedir autorização. O evento que fica não
 * leva nada que identifique a pessoa.
 */
export async function excluirLeadComHistorico(tx: Consulta, id: string, ator: Ator): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ErroDeDominio("Lead inválido.");
  const { rows } = await tx.query<{ excluido: boolean }>("select crm.excluir_lead($1) as excluido", [id]);
  if (!rows[0]?.excluido) throw new ErroDeDominio("Lead não encontrado. Ele pode já ter sido excluído.");
  await tx.query("insert into crm.evento (ator, tipo) values ($1, 'lead_excluido')", [ator]);
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

/**
 * Registra um modelo enviado por uma pessoa da Shift. Igual à resposta humana,
 * menos a trava das 24 horas — o modelo existe justamente para falar fora dela.
 * Só vale para quem já é contato do atendimento (escreveu para a Shift e
 * autorizou): a Meta exige consentimento para a empresa iniciar a conversa.
 */
export async function prepararModeloWhatsApp(tx: Consulta, leadId: string, pedidoId: string, textoEnviado: string): Promise<string | null> {
  const dados = z.object({ leadId: z.uuid(), pedidoId: z.uuid(), texto: z.string().trim().min(1).max(4000) })
    .parse({ leadId, pedidoId, texto: textoEnviado });
  const { rows } = await tx.query<{ whatsapp: string }>(
    'select whatsapp from crm.atendimento_whatsapp where lead_id = $1 for update', [dados.leadId]);
  if (!rows[0]) throw new ErroDeDominio('Este contato ainda não tem atendimento no WhatsApp.');
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

// -----------------------------------------------------------------------------
// Instagram Direct — identidade própria, sem criar telefones fictícios em leads.
// -----------------------------------------------------------------------------
export interface ConversaDirect {
  id: string; conta_id: string; contato_id: string; consentimento_em: Date | null;
  modo: 'agente' | 'humano'; memoria: Partial<AnaliseAtendimento>;
  revisao: string; processada: string; ultima_recebida: Date;
  reserva: string | null; reserva_ate: Date | null; erro: string | null; aviso_em: Date | null;
}
export interface MensagemDirect {
  id: string; meta_id: string | null; chave?:string; autor: 'cliente' | 'agente' | 'humano';
  texto: string; estado: string; revisao: string; criada_em: Date;
}
const AVISO_DIRECT = 'Oi! Sou o assistente virtual da Shift. Você autoriza o uso de IA e o registro desta conversa por até 90 dias para nossa equipe atender você? Responda SIM. Privacidade: https://shiftsys.com.br/privacidade.html';

async function travarDirect(tx: Consulta, id: string): Promise<ConversaDirect> {
  const { rows } = await tx.query<ConversaDirect>('select * from crm.conversa_instagram where id = $1 for update', [z.uuid().parse(id)]);
  if (!rows[0]) throw new ErroDeDominio('Conversa não encontrada.');
  return rows[0];
}

async function prepararTextoDirect(tx: Consulta, c: ConversaDirect, texto: string, autor: 'agente' | 'humano', chave: string) {
  const partes = separarRespostaAtendimento(texto);
  for (const [i, parte] of partes.entries()) {
    await tx.query(`insert into crm.mensagem_instagram(conversa_id,chave,autor,texto,estado,revisao,criada_em)
      values($1,$2,$3,$4,'pendente',$5,clock_timestamp() + $6 * interval '1 millisecond') on conflict(chave) do nothing`,
    [c.id, `${chave}:${i}`, autor, parte, c.revisao, i]);
  }
}

/** O recibo deduplica inclusive mensagens anteriores ao consentimento, sem seu texto. */
export async function receberDirect(tx: Consulta, e: EventoDirect, ativo: boolean): Promise<void> {
  // Conta desconectada ou substituída nunca aceita eventos nem recupera uma fila antiga.
  const { rows: contas } = await tx.query('select 1 from crm.conta_instagram where usuario_id=$1 and direct_assinado', [e.conta]);
  if (!contas.length) return;
  const { rows: recibos } = await tx.query('insert into crm.recibo_instagram(meta_id) values($1) on conflict do nothing returning meta_id', [e.id]);
  if (!recibos.length) return;
  if (e.eco) {
    const { rows: nossas } = await tx.query('select 1 from crm.mensagem_instagram where meta_id=$1', [e.id]);
    if (nossas.length) return;
  }
  const { rows } = await tx.query<{ id: string }>(`insert into crm.conversa_instagram(conta_id,contato_id,ultima_recebida,modo)
    values($1,$2,$3,$4) on conflict(conta_id,contato_id) do update set atualizada_em=now() returning id`,
  [e.conta,e.contato,e.quando,e.eco ? 'humano' : 'agente']);
  const c = await travarDirect(tx, rows[0].id);
  if (e.eco) {
    // O eco pode chegar antes de a transação do envio confirmar. Releia depois da trava.
    const { rows: nossas } = await tx.query('select 1 from crm.mensagem_instagram where meta_id=$1', [e.id]);
    if (nossas.length) return;
    // Eco não identificado como nosso: resposta pelo aplicativo assume a conversa.
    await mudarModoDirect(tx, c.id, 'humano');
    if (c.consentimento_em) await tx.query(`insert into crm.mensagem_instagram(conversa_id,meta_id,autor,texto,estado,revisao)
      values($1,$2,'humano',$3,'enviada',$4) on conflict(meta_id) do nothing`, [c.id,e.id,e.texto,c.revisao]);
    return;
  }
  await tx.query(`update crm.conversa_instagram set revisao=revisao+1, ultima_recebida=greatest(ultima_recebida,$2),
    atualizada_em=now(), proxima_execucao=now()+interval '10 seconds' where id=$1`, [c.id,e.quando]);
  c.revisao = String(BigInt(c.revisao) + BigInt(1));
  if (!c.consentimento_em) {
    if (!ativo || c.modo === 'humano') return;
    if (c.aviso_em && Date.now() - new Date(c.aviso_em).getTime() < 24*3600_000 && /^(sim|aceito|autorizo)[.! ]*$/i.test(e.texto)) {
      await tx.query('update crm.conversa_instagram set consentimento_em=now() where id=$1', [c.id]);
      await prepararTextoDirect(tx,c,'Combinado. Como você se chama?', 'agente', `consentimento:${e.id}`);
      await tx.query('update crm.conversa_instagram set processada=revisao where id=$1', [c.id]);
    } else {
      if (!c.aviso_em || Date.now()-new Date(c.aviso_em).getTime() >= 600_000) {
        await prepararTextoDirect(tx,c,AVISO_DIRECT,'agente',`aviso:${e.id}`);
        await tx.query('update crm.conversa_instagram set aviso_em=now(),processada=revisao where id=$1',[c.id]);
      }
      return;
    }
  }
  await tx.query(`insert into crm.mensagem_instagram(conversa_id,meta_id,autor,texto,estado,revisao,criada_em)
    values($1,$2,'cliente',$3,'recebida',$4,$5) on conflict(meta_id) do nothing`, [c.id,e.id,e.texto,c.revisao,e.quando]);
  if (e.anexo) await mudarModoDirect(tx,c.id,'humano');
}

export async function mudarModoDirect(tx: Consulta, id: string, modo: 'agente' | 'humano'): Promise<void> {
  await travarDirect(tx,id);
  await tx.query(`update crm.conversa_instagram set modo=$2,revisao=revisao+1,processada=revisao+1,
    reserva=null,reserva_ate=null,proxima_execucao=null,erro=null,atualizada_em=now() where id=$1`, [id,z.enum(['agente','humano']).parse(modo)]);
  await tx.query("update crm.mensagem_instagram set estado='cancelada' where conversa_id=$1 and estado='pendente'", [id]);
}

export async function listarDirect(tx: Consulta, conta: string): Promise<ConversaDirect[]> {
  const { rows } = await tx.query<ConversaDirect>(`select * from crm.conversa_instagram where conta_id=$1
    order by atualizada_em desc limit 100`,[conta]);
  return rows;
}

export async function historicoDirect(tx: Consulta, id: string, antes?: string): Promise<MensagemDirect[]> {
  const limite = antes ? z.iso.datetime({ offset:true }).parse(antes) : new Date(Date.now()+60_000).toISOString();
  const { rows } = await tx.query<MensagemDirect>(`select * from (select id,meta_id,autor,texto,estado,revisao,criada_em
    from crm.mensagem_instagram where conversa_id=$1 and criada_em<$2 order by criada_em desc,id desc limit 60) m
    order by criada_em,id`,[z.uuid().parse(id),limite]);
  return rows;
}

export async function reservarDirect(tx: Consulta, ativo = true): Promise<ConversaDirect | null> {
  // Intenção de envio sobrevive ao processo. Após queda, nunca reenviar às cegas.
  const { rows: expiradas } = await tx.query<{id:string}>(`select id from crm.conversa_instagram
    where reserva_ate<now() for update skip locked limit 10`);
  for (const expirada of expiradas) {
    const { rows: pendentes } = await tx.query(`update crm.mensagem_instagram set estado='incerto'
      where conversa_id=$1 and estado='pendente' returning id`, [expirada.id]);
    await tx.query(`update crm.conversa_instagram set reserva=null,reserva_ate=null,
      modo=case when $2 then 'humano' else modo end,
      erro=case when $2 then 'Envio sem confirmação; confira no Instagram.' else erro end
      where id=$1`,[expirada.id,pendentes.length>0]);
  }
  const { rows } = await tx.query<ConversaDirect>(`with candidata as (
    select c.id from crm.conversa_instagram c join crm.conta_instagram a on a.usuario_id=c.conta_id
    where a.direct_assinado and a.token_expira_em>now() and (c.reserva_ate is null or c.reserva_ate<now()) and
    (exists(select 1 from crm.mensagem_instagram m where m.conversa_id=c.id and m.estado='pendente' and ($1 or m.autor='humano'))
      or ($1 and c.modo='agente' and c.consentimento_em is not null and c.revisao>c.processada
        and c.proxima_execucao<=now() and c.ultima_recebida>now()-interval '24 hours'))
    order by c.atualizada_em for update of c skip locked limit 1)
    update crm.conversa_instagram c set reserva=gen_random_uuid(),reserva_ate=now()+interval '120 seconds'
    from candidata x where c.id=x.id returning c.*`,[ativo]);
  return rows[0] ?? null;
}

export async function contextoDirect(tx: Consulta, c: ConversaDirect): Promise<{ pergunta:string; contexto:ContextoAtendimento } | null> {
  const atual=await travarDirect(tx,c.id);
  if(atual.reserva!==c.reserva || atual.revisao!==c.revisao || atual.modo!=='agente') return null;
  const { rows: uso } = await tx.query<{ n:number }>(`select count(*)::int as n from crm.uso_ia_instagram
    where conversa_id=$1 and criada_em>now()-interval '1 hour'`,[c.id]);
  if (uso[0].n>=30) throw new ErroDeDominio('Limite de atendimento automático atingido.');
  const {rows:quantidade}=await tx.query<{n:number}>(`select count(*)::int as n from crm.mensagem_instagram
    where conversa_id=$1 and autor='cliente' and revisao>$2`,[c.id,c.processada]);
  if(quantidade[0].n>30) throw new ErroDeDominio('Mensagens demais para um turno.');
  const { rows } = await tx.query<MensagemDirect>(`select * from (select * from crm.mensagem_instagram where conversa_id=$1
    and (autor='cliente' or estado='enviada') order by criada_em desc,id desc limit 30) m order by criada_em,id`, [c.id]);
  const {rows:atuais}=await tx.query<MensagemDirect>(`select * from crm.mensagem_instagram
    where conversa_id=$1 and autor='cliente' and revisao>$2 order by criada_em,id limit 30`,[c.id,c.processada]);
  const pergunta = atuais.map(m=>m.texto).join('\n');
  if (!pergunta) return null;
  if (pergunta.length>12000) throw new ErroDeDominio('Mensagens demais para um turno.');
  const anterior = rows.filter(m=>!atuais.some(a=>a.id===m.id)).slice(-12);
  return { pergunta, contexto: { canal:'instagram', nome:c.memoria.nome||'', empresa:c.memoria.empresa||null,
    segmento:c.memoria.segmento||null,dor:c.memoria.dor||null,prazo:c.memoria.prazo||null,resumo:c.memoria.resumo||'',
    qualificacao:c.memoria.qualificacao, ultimaResposta:rows.filter(m=>m.autor!=='cliente').at(-1)?.texto||'',
    historico:anterior.map(m=>({autor:m.autor,texto:m.texto})) } };
}

export async function registrarUsoDirect(tx: Consulta, id: string, u: UsoAtendimento): Promise<void> {
  await tx.query(`insert into crm.uso_ia_instagram(conversa_id,modelo,entrada,saida,cache_leitura,cache_criacao,custo_estimado_usd)
    values($1,$2,$3,$4,$5,$6,$7)`,[id,u.modelo,u.inputTokens,u.outputTokens,u.cacheReadTokens,u.cacheCreationTokens,estimarCustoAtendimento(u)]);
}

export async function concluirAnaliseDirect(tx: Consulta, lote: ConversaDirect, analise: AnaliseAtendimento): Promise<boolean> {
  const c = await travarDirect(tx,lote.id);
  if (c.reserva!==lote.reserva || c.revisao!==lote.revisao || c.modo!=='agente' ||
      Date.now()-new Date(c.ultima_recebida).getTime()>=24*3600_000) return false;
  const memoria = { ...c.memoria };
  for (const campo of ['nome','empresa','segmento','dor','prazo','resumo'] as const) {
    if (analise[campo]) memoria[campo]=analise[campo];
  }
  memoria.qualificacao={...memoria.qualificacao,...analise.qualificacao};
  await tx.query(`update crm.conversa_instagram set memoria=$2,processada=revisao,modo=$3,erro=null where id=$1`,
    [c.id,JSON.stringify(memoria),analise.passarParaHumano?'humano':'agente']);
  await prepararTextoDirect(tx,c,analise.resposta,'agente',`ia:${c.id}:${c.revisao}`);
  return true;
}

export async function liberarDirect(tx: Consulta, c: ConversaDirect, erro?: string): Promise<void> {
  await travarDirect(tx,c.id);
  if (erro) {
    const { rows } = await tx.query('select 1 from crm.conversa_instagram where id=$1 and reserva=$2',[c.id,c.reserva]);
    if (!rows.length) return;
    // Uma falha no COMMIT pode acontecer depois do HTTP. Preserve a incerteza.
    await tx.query("update crm.mensagem_instagram set estado='incerto' where conversa_id=$1 and estado='pendente'",[c.id]);
    await mudarModoDirect(tx,c.id,'humano');
    await tx.query('update crm.conversa_instagram set erro=$2 where id=$1',[c.id,erro]);
  } else await tx.query('update crm.conversa_instagram set reserva=null,reserva_ate=null where id=$1 and reserva=$2',[c.id,c.reserva]);
}

export async function prepararManualDirect(tx: Consulta, id: string, texto: string, idEnvio: string): Promise<void> {
  const c = await travarDirect(tx,id);
  if (!c.consentimento_em) throw new ErroDeDominio('O contato ainda não autorizou o registro da conversa. Responda pelo Instagram.');
  if (Date.now()-new Date(c.ultima_recebida).getTime()>=24*3600_000) throw new ErroDeDominio('Janela de 24 horas encerrada. Aguarde uma nova mensagem do contato.');
  const chave=`manual:${z.uuid().parse(idEnvio)}`;
  const { rows }=await tx.query('select 1 from crm.mensagem_instagram where chave=$1',[`${chave}:0`]);
  if (rows.length) return;
  await mudarModoDirect(tx,id,'humano');
  const atual = await travarDirect(tx,id);
  await prepararTextoDirect(tx,atual,z.string().trim().min(1).max(1000).parse(texto),'humano',chave);
}

/** Rede sob a trava da conversa: assumir atendimento espera o envio em curso. */
export async function enviarPendentesDirect(tx: Consulta, lote: ConversaDirect, enviar: (contato:string,texto:string)=>Promise<string>): Promise<void> {
  const c = await travarDirect(tx,lote.id);
  if (c.reserva!==lote.reserva) return;
  const { rows: conta } = await tx.query('select 1 from crm.conta_instagram where usuario_id=$1 and direct_assinado and token_expira_em>now()', [c.conta_id]);
  const { rows } = await tx.query<MensagemDirect>(`select * from crm.mensagem_instagram where conversa_id=$1 and estado='pendente'
    order by criada_em,id limit 6`,[c.id]);
  for (const m of rows) {
    const avisoPendente=!c.consentimento_em && m.chave?.startsWith('aviso:');
    if (!conta.length || (m.autor==='agente' && process.env.INSTAGRAM_DIRECT_ATIVO!=='sim') ||
        (m.autor==='agente' && !avisoPendente && m.revisao!==c.revisao) ||
        Date.now()-new Date(c.ultima_recebida).getTime()>=24*3600_000) {
      await tx.query("update crm.mensagem_instagram set estado='cancelada' where id=$1",[m.id]);
      continue;
    }
    try {
      const mid = await enviar(c.contato_id,m.texto);
      await tx.query("update crm.mensagem_instagram set estado='enviada',meta_id=$2 where id=$1",[m.id,mid]);
    } catch {
      await tx.query("update crm.mensagem_instagram set estado='incerto' where id=$1",[m.id]);
      await mudarModoDirect(tx,c.id,'humano');
      await tx.query("update crm.conversa_instagram set erro='Envio sem confirmação; confira no Instagram.' where id=$1",[c.id]);
      break;
    }
  }
}
