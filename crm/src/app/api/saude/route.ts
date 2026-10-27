import { estadoDoBanco } from "@/lib/banco";
import { faltandoParaInstagram } from "@/lib/instagram-meta";
import { conferirPastaDeMidia } from "@/lib/midia";

/**
 * Diz se o app enxerga o banco e quais migrações estão aplicadas, e o que
 * falta configurar — sem mostrar valor de variável nenhuma. É para onde olhar
 * quando o deploy subiu e a tela não abre.
 */
export const dynamic = "force-dynamic";

const OBRIGATORIAS = ["DATABASE_URL", "ADMIN_EMAIL", "ADMIN_SENHA_HASH", "SESSAO_SEGREDO", "APP_URL"];

export async function GET(pedido: Request) {
  // `?vivo` é a verificação de saúde do contêiner: só diz que o servidor
  // responde. Ela não pode depender de configuração — no Easypanel (Docker
  // Swarm) contêiner "não saudável" é reiniciado, e o app entraria em ciclo de
  // reinício justo enquanto alguém usa o Console para configurar o banco.
  if (new URL(pedido.url).searchParams.has("vivo")) return Response.json({ vivo: true });

  const faltando = OBRIGATORIAS.filter((nome) => !process.env[nome]);
  if (!process.env.DATABASE_URL_MIGRACAO) faltando.push("DATABASE_URL_MIGRACAO (migrações não rodam)");
  const whatsappAtivo = process.env.WHATSAPP_ATIVO === "sim";
  const configuracaoWhatsApp = ["WHATSAPP_META_PHONE_NUMBER_ID", "WHATSAPP_META_ACCESS_TOKEN", "WHATSAPP_META_GRAPH_VERSION", "WHATSAPP_META_VERIFY_TOKEN", "WHATSAPP_META_APP_SECRET", "ANTHROPIC_API_KEY"];
  if (whatsappAtivo) faltando.push(...configuracaoWhatsApp.filter((nome) => !process.env[nome]));

  let banco: { ok: boolean; migracoes?: string[]; erro?: string };
  try {
    banco = { ok: true, ...(await estadoDoBanco()) };
  } catch (erro) {
    banco = { ok: false, erro: erro instanceof Error ? erro.message.split("\n")[0] : "falhou" };
  }

  // Instagram é opcional: só entra no `ok` depois de configurado, e aí o
  // volume vira obrigatório — sem ele, o que está agendado some na implantação.
  const faltaInstagram = faltandoParaInstagram();
  const instagramConfigurado = faltaInstagram.length === 0;
  const directAtivo=process.env.INSTAGRAM_DIRECT_ATIVO==='sim';
  const faltaDirect=[...faltaInstagram,...['INSTAGRAM_WEBHOOK_VERIFY_TOKEN','ANTHROPIC_API_KEY'].filter(nome=>!process.env[nome])];
  if(directAtivo) faltando.push(...faltaDirect.filter(nome=>!faltando.includes(nome)));
  const pasta = instagramConfigurado ? await conferirPastaDeMidia() : undefined;
  if (pasta && !pasta.ok) faltando.push(`volume das publicações: ${pasta.detalhe}`);

  const ok = banco.ok && faltando.length === 0;
  return Response.json({
    ok, faltando, banco,
    whatsapp: { ativo: whatsappAtivo, configurado: whatsappAtivo && configuracaoWhatsApp.every((nome) => !!process.env[nome]) },
    instagram: { configurado: instagramConfigurado, direct:{ativo:directAtivo,configurado:faltaDirect.length===0}, ...(pasta ? { pasta: pasta.detalhe } : { faltando: faltaInstagram }) },
  }, { status: ok ? 200 : 503 });
}
