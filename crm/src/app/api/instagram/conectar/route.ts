import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { COOKIE_ESTADO, configuracaoInstagram, urlDeAutorizacao } from "@/lib/instagram-meta";
import { temSessao } from "@/lib/sessao";

/**
 * Começa o login do Instagram. O `state` vai num cookie e volta na URL do
 * retorno; se não bater, o retorno recusa — é o que impede alguém de ligar a
 * conta dele ao CRM mandando um link de retorno pronto para o Bruno abrir.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await temSessao())) redirect("/entrar");

  let destino: string;
  try {
    const estado = randomBytes(24).toString("base64url");
    destino = urlDeAutorizacao(estado, configuracaoInstagram());
    (await cookies()).set(COOKIE_ESTADO, estado, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/instagram",
      maxAge: 10 * 60,
    });
  } catch {
    redirect("/instagram?aviso=configuracao");
  }
  redirect(destino);
}
