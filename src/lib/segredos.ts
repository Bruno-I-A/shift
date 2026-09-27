/**
 * Senha do painel, chaves do MCP e assinatura do cookie de sessão.
 *
 * Tudo com `node:crypto`, sem dependência: scrypt para a senha (lento de
 * propósito), SHA-256 para as chaves do MCP (que já nascem com 256 bits de
 * acaso — não há dicionário a atacar, então lentidão não compraria nada) e
 * HMAC para o cookie.
 */
import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const PARAMETROS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function derivar(senha: string, sal: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolver, rejeitar) => {
    scrypt(senha, sal, 32, { N: n, r, p, maxmem: PARAMETROS.maxmem }, (erro, chave) =>
      erro ? rejeitar(erro) : resolver(chave),
    );
  });
}

/**
 * Formato: `scrypt:N:r:p:sal:hash`, sal e hash em base64url.
 *
 * Dois-pontos e não cifrão: o valor vai para variável de ambiente, e tanto o
 * carregador de `.env` do Next quanto o painel de hospedagem tratam `$` como
 * começo de outra variável. O hash chegaria ao app mutilado e o login
 * recusaria a senha certa, sem dizer por quê.
 */
export async function gerarHashDeSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const { N, r, p } = PARAMETROS;
  const hash = await derivar(senha, sal, N, r, p);
  return ["scrypt", N, r, p, sal.toString("base64url"), hash.toString("base64url")].join(":");
}

export async function conferirSenha(senha: string, guardado: string): Promise<boolean> {
  const partes = guardado.trim().split(":");
  if (partes.length !== 6 || partes[0] !== "scrypt") return false;
  const [, n, r, p, sal, hash] = partes;
  const esperado = Buffer.from(hash, "base64url");
  const obtido = await derivar(senha, Buffer.from(sal, "base64url"), Number(n), Number(r), Number(p));
  return obtido.length === esperado.length && timingSafeEqual(obtido, esperado);
}

/** Comparação de textos sem vazar, pelo tempo, onde eles começam a diferir. */
export function iguais(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export const PREFIXO_TOKEN = "scrm_";

export function gerarToken(): string {
  return PREFIXO_TOKEN + randomBytes(32).toString("base64url");
}

export function hashDoToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function assinar(conteudo: string, chave: string): string {
  return createHmac("sha256", chave).update(conteudo).digest("base64url");
}
