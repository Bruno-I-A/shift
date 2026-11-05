/**
 * Números de WhatsApp de outras empresas, conectados pelo app da Shift com o
 * Embedded Signup da Meta (Tech Provider). Por enquanto só coexistência: o
 * número continua no app WhatsApp Business e também atende pela Cloud API.
 *
 * A permissão (token de negócio) fica cifrada no banco. Os avisos da Meta
 * desses números vão para um webhook separado (`/api/whatsapp/conexoes/webhook`),
 * que só conta os avisos por tipo: o conteúdo é dos clientes do cliente.
 */
import "server-only";

import * as z from "zod";

import type { Consulta } from "./consulta";
import { ErroDeDominio } from "./dominio";
import { cifrar, decifrar } from "./instagram-regras";

const USO_DA_CIFRA = "permissao-whatsapp-cliente";
const ID = /^\d{1,30}$/;

export type Executor = <T>(trabalho: (tx: Consulta) => Promise<T>) => Promise<T>;

export function configuracaoConexoes() {
  const valores = {
    WHATSAPP_META_APP_ID: process.env.WHATSAPP_META_APP_ID,
    WHATSAPP_META_APP_SECRET: process.env.WHATSAPP_META_APP_SECRET,
    WHATSAPP_META_CONFIG_ID: process.env.WHATSAPP_META_CONFIG_ID,
    WHATSAPP_META_GRAPH_VERSION: process.env.WHATSAPP_META_GRAPH_VERSION,
    WHATSAPP_META_VERIFY_TOKEN: process.env.WHATSAPP_META_VERIFY_TOKEN,
    APP_URL: process.env.APP_URL,
    SESSAO_SEGREDO: process.env.SESSAO_SEGREDO,
  };
  const faltando = Object.entries(valores).filter(([, v]) => !v).map(([nome]) => nome);
  if (faltando.length) throw new ErroDeDominio(`Conexão de números não configurada: falta ${faltando.join(", ")}.`);
  if (!/^v\d+\.\d+$/.test(valores.WHATSAPP_META_GRAPH_VERSION!)) throw new ErroDeDominio("WHATSAPP_META_GRAPH_VERSION inválida (ex.: v24.0).");
  if (!ID.test(valores.WHATSAPP_META_APP_ID!) || !ID.test(valores.WHATSAPP_META_CONFIG_ID!)) {
    throw new ErroDeDominio("WHATSAPP_META_APP_ID e WHATSAPP_META_CONFIG_ID são números (ID do app e ID da configuração).");
  }
  return {
    appId: valores.WHATSAPP_META_APP_ID!,
    segredoApp: valores.WHATSAPP_META_APP_SECRET!,
    configId: valores.WHATSAPP_META_CONFIG_ID!,
    versao: valores.WHATSAPP_META_GRAPH_VERSION!,
    verifyToken: valores.WHATSAPP_META_VERIFY_TOKEN!,
    webhook: `${valores.APP_URL!.replace(/\/+$/, "")}/api/whatsapp/conexoes/webhook`,
    segredo: valores.SESSAO_SEGREDO!,
  };
}

/** O que a página precisa para abrir o fluxo da Meta. Nada aqui é segredo. */
export function configuracaoPublica(): { appId: string; configId: string; versao: string } {
  const { appId, configId, versao } = configuracaoConexoes();
  return { appId, configId, versao };
}

/** Chamada à Graph API. Nunca registra a URL: na troca do código ela leva o segredo do app. */
async function graph(caminho: string, opcoes: {
  token?: string; metodo?: "GET" | "POST"; corpo?: unknown; consulta?: Record<string, string>;
} = {}): Promise<unknown> {
  const { versao } = configuracaoConexoes();
  const url = new URL(`https://graph.facebook.com/${versao}/${caminho}`);
  for (const [chave, valor] of Object.entries(opcoes.consulta ?? {})) url.searchParams.set(chave, valor);
  const resposta = await fetch(url, {
    method: opcoes.metodo ?? "GET",
    headers: {
      ...(opcoes.token ? { Authorization: `Bearer ${opcoes.token}` } : {}),
      ...(opcoes.corpo !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const dados: unknown = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    const erro = z.object({ error: z.object({ message: z.string() }) }).safeParse(dados);
    throw new ErroDeDominio(`A Meta recusou (${resposta.status})${erro.success ? `: ${erro.data.error.message.slice(0, 200)}` : "."}`);
  }
  return dados;
}

const esquemaNumero = z.object({
  id: z.string().regex(ID).optional(),
  display_phone_number: z.string().max(40).optional(),
  verified_name: z.string().max(200).optional(),
  is_on_biz_app: z.boolean().optional(),
  platform_type: z.string().max(40).optional(),
});
export type EstadoNumero = z.infer<typeof esquemaNumero>;

async function lerNumero(phoneNumberId: string, token: string): Promise<EstadoNumero> {
  return esquemaNumero.parse(await graph(phoneNumberId, {
    token, consulta: { fields: "display_phone_number,verified_name,is_on_biz_app,platform_type" },
  }));
}

const esquemaConectar = z.object({
  codigo: z.string().min(10).max(4000),
  wabaId: z.string().regex(ID),
  phoneNumberId: z.string().regex(ID).optional(),
  businessId: z.string().regex(ID).optional(),
  evento: z.string().max(80),
  numeroDaShift: z.boolean().default(false),
});

/**
 * Termina a conexão depois do fluxo da Meta: troca o código pela permissão,
 * manda os avisos do número para o webhook separado e guarda a conexão.
 * O código vale 30 segundos, por isso a troca vem antes de tudo.
 */
export async function conectarNumero(executar: Executor, entrada: unknown): Promise<{ id: string; numero: EstadoNumero }> {
  const d = esquemaConectar.parse(entrada);
  if (d.evento !== "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
    throw new ErroDeDominio("Por enquanto só conectamos números que continuam no app WhatsApp Business (coexistência).");
  }
  const c = configuracaoConexoes();
  const { access_token: token } = z.object({ access_token: z.string().min(10).max(4000) }).parse(
    await graph("oauth/access_token", { consulta: { client_id: c.appId, client_secret: c.segredoApp, code: d.codigo } }),
  );

  let phoneNumberId = d.phoneNumberId;
  if (!phoneNumberId) {
    const lista = z.object({ data: z.array(z.object({ id: z.string().regex(ID) })) })
      .parse(await graph(`${d.wabaId}/phone_numbers`, { token, consulta: { fields: "id" } }));
    if (lista.data.length !== 1) throw new ErroDeDominio("A Meta não informou qual número foi conectado. Tente de novo.");
    phoneNumberId = lista.data[0].id;
  }

  // Número de cliente: os avisos vão para o webhook separado, que só conta.
  // Número da Shift: sem desvio (POST sem corpo também desfaz um desvio
  // anterior), para o agente continuar atendendo pelo webhook principal.
  await graph(`${d.wabaId}/subscribed_apps`, d.numeroDaShift
    ? { token, metodo: "POST" }
    : { token, metodo: "POST", corpo: { override_callback_uri: c.webhook, verify_token: c.verifyToken } });
  const numero = await lerNumero(phoneNumberId, token);

  const id = await executar(async (tx) => {
    if (d.numeroDaShift) {
      await tx.query("update crm.conexao_whatsapp set numero_da_shift = false where numero_da_shift and phone_number_id <> $1", [phoneNumberId]);
    }
    const { rows } = await tx.query<{ id: string }>(
      `insert into crm.conexao_whatsapp
         (waba_id, phone_number_id, business_id, numero_exibicao, nome_verificado, coexistencia, token_cifrado, numero_da_shift)
       values ($1, $2, $3, $4, $5, true, $6, $7)
       on conflict (phone_number_id) do update set
         waba_id = excluded.waba_id, business_id = excluded.business_id,
         numero_exibicao = excluded.numero_exibicao, nome_verificado = excluded.nome_verificado,
         coexistencia = excluded.coexistencia, token_cifrado = excluded.token_cifrado, conectada_em = now(),
         numero_da_shift = excluded.numero_da_shift,
         sinc_contatos_id = null, sinc_contatos_em = null, sinc_historico_id = null, sinc_historico_em = null
       returning id`,
      [d.wabaId, phoneNumberId, d.businessId ?? null, numero.display_phone_number ?? null,
        numero.verified_name ?? null, cifrar(token, c.segredo, USO_DA_CIFRA), d.numeroDaShift],
    );
    await tx.query("insert into crm.evento (ator, tipo, dados) values ('bruno', 'whatsapp_numero_conectado', $1::jsonb)",
      [JSON.stringify({ conexao_id: rows[0].id })]);
    return rows[0].id;
  });
  return { id, numero };
}

export interface ConexaoWhatsApp {
  id: string;
  wabaId: string;
  phoneNumberId: string;
  numeroExibicao: string | null;
  nomeVerificado: string | null;
  coexistencia: boolean;
  conectadaEm: Date;
  sincContatosEm: Date | null;
  sincHistoricoEm: Date | null;
  eventos: Record<string, number>;
  ultimoEventoEm: Date | null;
  /** Passaram as 24 horas em que a Meta aceita sincronizar contatos e histórico. */
  prazoSincronizarVencido: boolean;
  numeroDaShift: boolean;
}

/** Sem a permissão: ela nunca sai do servidor. */
export async function listarConexoes(tx: Consulta): Promise<ConexaoWhatsApp[]> {
  const { rows } = await tx.query<ConexaoWhatsApp>(
    `select id, waba_id as "wabaId", phone_number_id as "phoneNumberId", numero_exibicao as "numeroExibicao",
            nome_verificado as "nomeVerificado", coexistencia, conectada_em as "conectadaEm",
            sinc_contatos_em as "sincContatosEm", sinc_historico_em as "sincHistoricoEm",
            eventos, ultimo_evento_em as "ultimoEventoEm",
            conectada_em <= now() - interval '24 hours' as "prazoSincronizarVencido",
            numero_da_shift as "numeroDaShift"
       from crm.conexao_whatsapp order by numero_da_shift desc, conectada_em desc`,
  );
  return rows;
}

async function permissao(tx: Consulta, id: string): Promise<{ token: string; phoneNumberId: string }> {
  const { rows } = await tx.query<{ token_cifrado: string; phone_number_id: string }>(
    "select token_cifrado, phone_number_id from crm.conexao_whatsapp where id = $1", [z.uuid().parse(id)],
  );
  if (!rows[0]) throw new ErroDeDominio("Conexão não encontrada.");
  return { token: decifrar(rows[0].token_cifrado, configuracaoConexoes().segredo, USO_DA_CIFRA), phoneNumberId: rows[0].phone_number_id };
}

/** Pergunta à Meta se o número está no app e na Cloud API ao mesmo tempo. */
export async function conferirEstado(executar: Executor, id: string): Promise<EstadoNumero> {
  const { token, phoneNumberId } = await executar((tx) => permissao(tx, id));
  const numero = await lerNumero(phoneNumberId, token);
  await executar((tx) => tx.query(
    `update crm.conexao_whatsapp set numero_exibicao = coalesce($2, numero_exibicao),
       nome_verificado = coalesce($3, nome_verificado) where id = $1`,
    [id, numero.display_phone_number ?? null, numero.verified_name ?? null],
  ));
  return numero;
}

const SINCRONIZACOES = {
  contatos: { coluna: "sinc_contatos", tipo: "smb_app_state_sync" },
  historico: { coluna: "sinc_historico", tipo: "history" },
} as const;

/**
 * Pede à Meta os contatos ou o histórico do app. Cada um só pode ser pedido
 * uma vez por conexão e dentro de 24 horas: a marcação vem antes da chamada
 * (dois cliques não pedem duas vezes) e é desfeita se a Meta recusar.
 */
export async function sincronizar(executar: Executor, id: string, qual: keyof typeof SINCRONIZACOES): Promise<string> {
  const { coluna, tipo } = SINCRONIZACOES[z.enum(["contatos", "historico"]).parse(qual)];
  const conexaoId = z.uuid().parse(id);
  const marcada = await executar(async (tx) => {
    const { rows: shift } = await tx.query("select 1 from crm.conexao_whatsapp where id = $1 and numero_da_shift", [conexaoId]);
    // Os avisos da sincronização são grandes e iriam para o webhook principal.
    if (shift.length) throw new ErroDeDominio("No número da Shift a sincronização fica desligada.");
    const { rows } = await tx.query<{ id: string }>(
      `update crm.conexao_whatsapp set ${coluna}_em = now()
        where id = $1 and ${coluna}_em is null and conectada_em > now() - interval '24 hours' returning id`, [conexaoId],
    );
    return rows.length > 0;
  });
  if (!marcada) throw new ErroDeDominio("Já foi pedido, ou passaram as 24 horas da conexão. Para repetir, conecte o número de novo.");
  try {
    const { token, phoneNumberId } = await executar((tx) => permissao(tx, conexaoId));
    const resposta = z.object({ request_id: z.string().min(1).max(200) }).parse(await graph(`${phoneNumberId}/smb_app_data`, {
      token, metodo: "POST", corpo: { messaging_product: "whatsapp", sync_type: tipo },
    }));
    await executar((tx) => tx.query(`update crm.conexao_whatsapp set ${coluna}_id = $2 where id = $1`, [conexaoId, resposta.request_id]));
    return resposta.request_id;
  } catch (erro) {
    await executar((tx) => tx.query(`update crm.conexao_whatsapp set ${coluna}_em = null where id = $1`, [conexaoId]));
    throw erro;
  }
}

/** Mensagem de texto pela Cloud API do número conectado. Fora da janela de 24 h, a Meta recusa. */
export async function enviarTeste(executar: Executor, id: string, para: string, texto: string): Promise<string> {
  const destino = z.string().regex(/^\d{10,15}$/, "Número com DDI e DDD, só dígitos.").parse(para.replace(/\D/g, ""));
  const corpo = z.string().trim().min(1, "Escreva a mensagem.").max(1000).parse(texto);
  const { token, phoneNumberId } = await executar((tx) => permissao(tx, id));
  const resposta = z.object({ messages: z.array(z.object({ id: z.string().min(1).max(200) })).min(1) }).parse(
    await graph(`${phoneNumberId}/messages`, {
      token, metodo: "POST",
      corpo: { messaging_product: "whatsapp", to: destino, type: "text", text: { body: corpo, preview_url: false } },
    }),
  );
  return resposta.messages[0].id;
}

const esquemaAviso = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(z.object({
    id: z.string().max(40),
    changes: z.array(z.object({ field: z.string().max(60), value: z.unknown() })),
  })),
});

/**
 * Conta os avisos da Meta por tipo, para as conexões conhecidas. Não guarda
 * nada do conteúdo. Avisos de números que não estão conectados são ignorados.
 */
export async function registrarAvisos(tx: Consulta, corpo: unknown): Promise<number> {
  const lido = esquemaAviso.safeParse(corpo);
  if (!lido.success) return 0;
  const contagem = new Map<string, Map<string, number>>();
  for (const entrada of lido.data.entry) {
    for (const mudanca of entrada.changes) {
      if (!/^[a-z_]{1,60}$/.test(mudanca.field)) continue;
      const metadata = z.object({ metadata: z.object({ phone_number_id: z.string().regex(ID) }) }).safeParse(mudanca.value);
      const chave = metadata.success ? `n:${metadata.data.metadata.phone_number_id}` : `w:${entrada.id}`;
      const porTipo = contagem.get(chave) ?? new Map<string, number>();
      porTipo.set(mudanca.field, (porTipo.get(mudanca.field) ?? 0) + 1);
      contagem.set(chave, porTipo);
    }
  }
  let atualizadas = 0;
  for (const [chave, porTipo] of contagem) {
    const [tipoChave, valor] = [chave.slice(0, 1), chave.slice(2)];
    if (!ID.test(valor)) continue;
    const { rows } = await tx.query<{ id: string; eventos: Record<string, number> }>(
      `select id, eventos from crm.conexao_whatsapp where ${tipoChave === "n" ? "phone_number_id" : "waba_id"} = $1 for update`, [valor],
    );
    for (const linha of rows) {
      const eventos = { ...linha.eventos };
      for (const [campo, n] of porTipo) eventos[campo] = (eventos[campo] ?? 0) + n;
      await tx.query("update crm.conexao_whatsapp set eventos = $2::jsonb, ultimo_evento_em = now() where id = $1",
        [linha.id, JSON.stringify(eventos)]);
      atualizadas++;
    }
  }
  return atualizadas;
}
