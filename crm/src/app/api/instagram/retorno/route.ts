import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { emTransacao } from "@/lib/banco";
import { salvarConta } from "@/lib/instagram";
import { ErroDeDominio } from "@/lib/dominio";
import { COOKIE_ESTADO, COOKIE_EXTRA, ErroDaMeta, lerPerfil, trocarCodigo } from "@/lib/instagram-meta";
import { iguais } from "@/lib/segredos";
import { temSessao } from "@/lib/sessao";

/**
 * Para onde o Instagram devolve depois do login. Este endereço exato
 * (`APP_URL` + `/api/instagram/retorno`) precisa estar cadastrado no app da
 * Meta, senão ela recusa antes de chegar aqui.
 */
export const dynamic = "force-dynamic";

export async function GET(pedido: Request) {
  if (!(await temSessao())) redirect("/entrar");

  const url = new URL(pedido.url);
  const deposito = await cookies();
  const esperado = deposito.get(COOKIE_ESTADO)?.value;
  const extra = deposito.get(COOKIE_EXTRA)?.value === "sim";
  deposito.delete({ name: COOKIE_ESTADO, path: "/api/instagram" });
  deposito.delete({ name: COOKIE_EXTRA, path: "/api/instagram" });

  if (url.searchParams.get("error")) redirect("/instagram?aviso=recusado");
  const codigo = url.searchParams.get("code");
  const estado = url.searchParams.get("state");
  if (!codigo || !estado || !esperado || !iguais(estado, esperado)) redirect("/instagram?aviso=estado");

  let aviso = extra ? "extra" : "conectado";
  try {
    const { token, expiraEm } = await trocarCodigo(codigo);
    const perfil = await lerPerfil(token);
    await emTransacao((tx) => salvarConta(tx, { ...perfil, token, expiraEm }, { principal: !extra }));
  } catch (erro) {
    if (erro instanceof ErroDeDominio) redirect("/instagram?aviso=ja-principal");
    // Só a mensagem nossa: a da Meta pode trazer o código de volta.
    console.error(`[instagram] login não concluído: ${erro instanceof ErroDaMeta ? erro.message : "falha interna"}`);
    aviso = "falhou";
  }
  redirect(`/instagram?aviso=${aviso}`);
}
