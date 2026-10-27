import "server-only";

import * as z from "zod";

import { ErroDeDominio } from "./dominio";

/**
 * A API do Instagram com login pelo Instagram (graph.instagram.com).
 *
 * Esse caminho não pede Página do Facebook, e para a conta da própria Shift o
 * acesso padrão basta — sem revisão do app. Permissões:
 * `instagram_business_basic`, `instagram_business_content_publish` e
 * `instagram_business_manage_messages` (Direct).
 *
 * Publicar é sempre em dois passos: criar um contêiner apontando para o
 * arquivo (a Meta vai buscá-lo pelo link) e, quando ele estiver pronto,
 * publicar o contêiner. A Meta não agenda: quem guarda o horário é o CRM.
 */

const VERSAO_PADRAO = "v26.0";
const ESCOPOS = ["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_messages", "instagram_business_manage_comments"];

/** O `state` do login, guardado entre a ida ao Instagram e o retorno. */
export const COOKIE_ESTADO = "crm_instagram_estado";

export interface ConfiguracaoInstagram {
  appId: string;
  appSecret: string;
  versao: string;
  appUrl: string;
}

/** Quais variáveis faltam para o Instagram funcionar. Vazio é pronto. */
export function faltandoParaInstagram(): string[] {
  return ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET", "APP_URL", "SESSAO_SEGREDO"].filter((nome) => !process.env[nome]);
}

export function configuracaoInstagram(): ConfiguracaoInstagram {
  const faltando = faltandoParaInstagram();
  if (faltando.length) throw new ErroDeDominio(`Instagram não configurado: falta ${faltando.join(", ")}.`);
  const versao = process.env.INSTAGRAM_GRAPH_VERSION || VERSAO_PADRAO;
  if (!/^v\d+\.\d+$/.test(versao)) throw new ErroDeDominio("INSTAGRAM_GRAPH_VERSION inválida (ex.: v26.0).");
  return {
    appId: process.env.INSTAGRAM_APP_ID!,
    appSecret: process.env.INSTAGRAM_APP_SECRET!,
    versao,
    appUrl: process.env.APP_URL!.replace(/\/+$/, ""),
  };
}

/** Tem de ser idêntico ao cadastrado no app da Meta, em "Business login settings". */
export function enderecoDeRetorno(config = configuracaoInstagram()): string {
  return `${config.appUrl}/api/instagram/retorno`;
}

export function linkDaMidia(chave: string, config = configuracaoInstagram()): string {
  return `${config.appUrl}/api/instagram/midia/${chave}`;
}

export function urlDeAutorizacao(estado: string, config = configuracaoInstagram()): string {
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", enderecoDeRetorno(config));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", ESCOPOS.join(","));
  url.searchParams.set("state", estado);
  // Só a conta do Instagram; o atalho pelo Facebook confunde qual conta entra.
  url.searchParams.set("enable_fb_login", "false");
  return url.toString();
}

// -----------------------------------------------------------------------------
// Erros
// -----------------------------------------------------------------------------

/**
 * Falha vinda da Meta. `permanente` diz se adianta tentar de novo: arquivo
 * recusado não melhora sozinho; rede caída e limite de uso, sim.
 */
export class ErroDaMeta extends Error {
  constructor(
    mensagem: string,
    readonly permanente: boolean,
    readonly precisaReconectar = false,
  ) {
    super(mensagem);
  }
}

const esquemaErro = z.object({
  error: z.object({
    message: z.string().optional(),
    code: z.number().optional(),
    is_transient: z.boolean().optional(),
    error_user_msg: z.string().optional(),
    error_user_title: z.string().optional(),
  }),
});

// Limite de uso e indisponibilidade temporária: passam sozinhos.
const CODIGOS_PASSAGEIROS = new Set([1, 2, 4, 17, 32, 341, 613]);

async function lerResposta(resposta: Response, acao: string): Promise<unknown> {
  const corpo: unknown = await resposta.json().catch(() => null);
  if (resposta.ok) return corpo;

  const erro = esquemaErro.safeParse(corpo);
  const detalhe = erro.success ? erro.data.error.error_user_msg || erro.data.error.message : undefined;
  const codigo = erro.success ? erro.data.error.code : undefined;
  const passageiro =
    resposta.status >= 500 ||
    resposta.status === 429 ||
    (erro.success && erro.data.error.is_transient === true) ||
    (codigo !== undefined && CODIGOS_PASSAGEIROS.has(codigo));
  const mensagem = `${acao}: ${detalhe ? detalhe.slice(0, 400) : `a Meta respondeu ${resposta.status}`}.`;
  throw new ErroDaMeta(mensagem, !passageiro, codigo === 190);
}

async function chamar(url: string, acao: string, opcoes: RequestInit & { token?: string } = {}): Promise<unknown> {
  const { token, headers, ...resto } = opcoes;
  let resposta: Response;
  try {
    resposta = await fetch(url, {
      ...resto,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new ErroDaMeta(`${acao}: sem resposta da Meta.`, false);
  }
  return lerResposta(resposta, acao);
}

function exigir<T>(esquema: z.ZodType<T>, corpo: unknown, acao: string): T {
  const lido = esquema.safeParse(corpo);
  if (!lido.success) throw new ErroDaMeta(`${acao}: resposta da Meta em formato inesperado.`, false);
  return lido.data;
}

const grafo = (config: ConfiguracaoInstagram, caminho: string) =>
  `https://graph.instagram.com/${config.versao}/${caminho}`;

// -----------------------------------------------------------------------------
// Login
// -----------------------------------------------------------------------------

const esquemaTokenLongo = z.object({ access_token: z.string().min(10), expires_in: z.number().positive() });

/** Código do retorno → permissão de 1 hora → permissão de 60 dias. */
export async function trocarCodigo(
  codigo: string,
  config = configuracaoInstagram(),
): Promise<{ token: string; expiraEm: Date }> {
  const form = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    grant_type: "authorization_code",
    redirect_uri: enderecoDeRetorno(config),
    code: codigo.replace(/#_$/, ""),
  });
  const curto = await chamar("https://api.instagram.com/oauth/access_token", "Trocar o código do login", {
    method: "POST",
    body: form,
  });
  // A documentação mostra a resposta dentro de `data`; versões antigas, solta.
  const item = exigir(
    z.union([
      z.object({ data: z.array(z.object({ access_token: z.string().min(10) })).min(1) }).transform((r) => r.data[0]),
      z.object({ access_token: z.string().min(10) }),
    ]),
    curto,
    "Trocar o código do login",
  );

  const longo = new URL("https://graph.instagram.com/access_token");
  longo.searchParams.set("grant_type", "ig_exchange_token");
  longo.searchParams.set("client_secret", config.appSecret);
  longo.searchParams.set("access_token", item.access_token);
  const resposta = exigir(esquemaTokenLongo, await chamar(longo.toString(), "Pedir a permissão de 60 dias"), "Pedir a permissão de 60 dias");
  return { token: resposta.access_token, expiraEm: new Date(Date.now() + resposta.expires_in * 1000) };
}

export async function renovarToken(token: string): Promise<{ token: string; expiraEm: Date }> {
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", token);
  const resposta = exigir(esquemaTokenLongo, await chamar(url.toString(), "Renovar a permissão"), "Renovar a permissão");
  return { token: resposta.access_token, expiraEm: new Date(Date.now() + resposta.expires_in * 1000) };
}

export async function lerPerfil(
  token: string,
  config = configuracaoInstagram(),
): Promise<{ usuarioId: string; nomeUsuario: string }> {
  const corpo = await chamar(grafo(config, "me?fields=user_id,username"), "Ler a conta", { token });
  const perfil = exigir(
    z.object({ user_id: z.union([z.string(), z.number()]).transform(String), username: z.string().min(1).max(100) }),
    corpo,
    "Ler a conta",
  );
  if (!/^\d{1,30}$/.test(perfil.user_id)) throw new ErroDaMeta("Ler a conta: identificador inesperado.", true);
  return { usuarioId: perfil.user_id, nomeUsuario: perfil.username };
}

// -----------------------------------------------------------------------------
// Publicação
// -----------------------------------------------------------------------------

export interface Acesso {
  token: string;
  usuarioId: string;
}

const esquemaId = z.object({ id: z.union([z.string(), z.number()]).transform(String) });

export async function criarConteiner(
  acesso: Acesso,
  corpo: Record<string, string | boolean>,
  config = configuracaoInstagram(),
): Promise<string> {
  const resposta = await chamar(grafo(config, `${acesso.usuarioId}/media`), "Criar o contêiner na Meta", {
    method: "POST",
    token: acesso.token,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  return exigir(esquemaId, resposta, "Criar o contêiner na Meta").id;
}

export type EstadoConteiner = "EXPIRED" | "ERROR" | "FINISHED" | "IN_PROGRESS" | "PUBLISHED";

export async function estadoDoConteiner(
  acesso: Acesso,
  conteinerId: string,
  config = configuracaoInstagram(),
): Promise<{ estado: EstadoConteiner; detalhe?: string }> {
  const resposta = await chamar(grafo(config, `${conteinerId}?fields=status_code,status`), "Consultar o contêiner", {
    token: acesso.token,
  });
  const lido = exigir(
    z.object({
      status_code: z.enum(["EXPIRED", "ERROR", "FINISHED", "IN_PROGRESS", "PUBLISHED"]),
      status: z.string().optional(),
    }),
    resposta,
    "Consultar o contêiner",
  );
  return { estado: lido.status_code, detalhe: lido.status?.slice(0, 300) };
}

export async function publicarConteiner(
  acesso: Acesso,
  conteinerId: string,
  config = configuracaoInstagram(),
): Promise<string> {
  const resposta = await chamar(grafo(config, `${acesso.usuarioId}/media_publish`), "Publicar", {
    method: "POST",
    token: acesso.token,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: conteinerId }),
  });
  return exigir(esquemaId, resposta, "Publicar").id;
}

/** O link do post. Falhar aqui não desfaz nada: o post já está no ar. */
export async function linkDoPost(acesso: Acesso, midiaId: string, config = configuracaoInstagram()): Promise<string | null> {
  try {
    const resposta = await chamar(grafo(config, `${midiaId}?fields=permalink`), "Ler o link do post", {
      token: acesso.token,
    });
    const lido = z.object({ permalink: z.string().regex(/^https:\/\//) }).safeParse(resposta);
    return lido.success ? lido.data.permalink : null;
  } catch {
    return null;
  }
}
