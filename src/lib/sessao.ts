import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { assinar, iguais } from "./segredos";

/**
 * Login de uma pessoa só.
 *
 * O CRM tem um usuário, o Bruno, e continua tendo enquanto a Shift não
 * crescer. Então não há tabela de usuários: e-mail e hash da senha moram nas
 * variáveis de ambiente, e a sessão é um cookie assinado com HMAC.
 *
 * A chave do HMAC é o segredo de sessão **junto com o hash da senha**. Trocar a
 * senha derruba toda sessão aberta, sem precisar de lista de sessões no banco.
 */

const COOKIE = "crm_sessao";
const DURACAO_S = 30 * 24 * 60 * 60;

function configuracao() {
  const email = process.env.ADMIN_EMAIL;
  const hash = process.env.ADMIN_SENHA_HASH;
  const segredo = process.env.SESSAO_SEGREDO;
  if (!email || !hash || !segredo || segredo.length < 32) {
    throw new Error(
      "Login não configurado: defina ADMIN_EMAIL, ADMIN_SENHA_HASH e SESSAO_SEGREDO (32+ caracteres). Ver README.md.",
    );
  }
  return { email, hash, chave: `${segredo}.${hash}` };
}

export function credenciaisDoAdmin() {
  const { email, hash } = configuracao();
  return { email, hash };
}

function tokenDaSessao(expiraEm: number): string {
  const conteudo = Buffer.from(JSON.stringify({ exp: expiraEm })).toString("base64url");
  return `${conteudo}.${assinar(conteudo, configuracao().chave)}`;
}

function sessaoValida(valor: string | undefined): boolean {
  if (!valor) return false;
  const [conteudo, assinatura] = valor.split(".");
  if (!conteudo || !assinatura) return false;
  if (!iguais(assinatura, assinar(conteudo, configuracao().chave))) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(conteudo, "base64url").toString("utf8"));
    return typeof exp === "number" && exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

export async function iniciarSessao(): Promise<void> {
  const expiraEm = Math.floor(Date.now() / 1000) + DURACAO_S;
  (await cookies()).set(COOKIE, tokenDaSessao(expiraEm), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACAO_S,
  });
}

export async function encerrarSessao(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function temSessao(): Promise<boolean> {
  return sessaoValida((await cookies()).get(COOKIE)?.value);
}

/**
 * Chamada em toda página e toda ação do painel, não só no layout: o layout não
 * roda de novo a cada navegação, e uma Server Action é um endpoint público que
 * qualquer um pode chamar sem passar pela página.
 */
export async function exigirSessao(): Promise<void> {
  if (!(await temSessao())) redirect("/entrar");
}

/**
 * IP de quem pede, para o limitador de login. Atrás do proxy do Easypanel o
 * primeiro endereço do X-Forwarded-For é o do visitante. Se alguém forjar o
 * cabeçalho, o teto global do limitador continua valendo.
 */
export async function ipDoPedido(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconhecido";
}
