import { estadoDoBanco } from "@/lib/banco";

/**
 * Diz se o app enxerga o banco e quais migrações estão aplicadas, e o que
 * falta configurar — sem mostrar valor de variável nenhuma. É para onde olhar
 * quando o deploy subiu e a tela não abre.
 */
export const dynamic = "force-dynamic";

const OBRIGATORIAS = ["DATABASE_URL", "ADMIN_EMAIL", "ADMIN_SENHA_HASH", "SESSAO_SEGREDO", "APP_URL"];

export async function GET() {
  const faltando = OBRIGATORIAS.filter((nome) => !process.env[nome]);
  if (!process.env.DATABASE_URL_MIGRACAO) faltando.push("DATABASE_URL_MIGRACAO (migrações não rodam)");

  let banco: { ok: boolean; migracoes?: string[]; erro?: string };
  try {
    banco = { ok: true, ...(await estadoDoBanco()) };
  } catch (erro) {
    banco = { ok: false, erro: erro instanceof Error ? erro.message.split("\n")[0] : "falhou" };
  }

  const ok = banco.ok && faltando.length === 0;
  return Response.json({ ok, faltando, banco }, { status: ok ? 200 : 503 });
}
