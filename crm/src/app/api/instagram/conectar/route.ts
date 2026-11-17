import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { COOKIE_ESTADO, COOKIE_EXTRA, configuracaoInstagram, urlDeAutorizacao } from "@/lib/instagram-meta";
import { temSessao } from "@/lib/sessao";

/**
 * Começa o login do Instagram. O `state` vai num cookie e volta na URL do
 * retorno; se não bater, o retorno recusa — é o que impede alguém de ligar a
 * conta dele ao CRM mandando um link de retorno pronto para o Bruno abrir.
 */
export const dynamic = "force-dynamic";

/** `?conta=extra` conecta um perfil ao lado da conta principal, só para campanhas. */
export async function GET(pedido: Request) {
  if (!(await temSessao())) redirect("/entrar");
  const extra = new URL(pedido.url).searchParams.get("conta") === "extra";

  let destino: string;
  try {
    const estado = randomBytes(24).toString("base64url");
    destino = urlDeAutorizacao(estado, configuracaoInstagram());
    const deposito = await cookies();
    const opcoes = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/api/instagram",
      maxAge: 10 * 60,
    };
    deposito.set(COOKIE_ESTADO, estado, opcoes);
    if (extra) deposito.set(COOKIE_EXTRA, "sim", opcoes);
    else deposito.delete({ name: COOKIE_EXTRA, path: "/api/instagram" });
  } catch {
    redirect("/instagram?aviso=configuracao");
  }
  redirect(destino);
}
