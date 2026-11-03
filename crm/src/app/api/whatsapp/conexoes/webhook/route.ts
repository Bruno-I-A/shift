import { assinaturaMetaCorreta, responderDesafioMeta } from "@/lib/assinatura-meta";
import { emTransacao } from "@/lib/banco";
import { registrarAvisos } from "@/lib/conexoes-whatsapp";

export const runtime = "nodejs";

/*
 * Webhook dos números conectados de outras empresas (coexistência). A Meta
 * manda para cá, e não para o webhook da Shift, porque a conexão pede isso
 * (override_callback_uri). O histórico sincronizado chega em avisos grandes,
 * por isso o limite é maior que o do webhook principal.
 */
const LIMITE = 5_000_000;

export async function GET(pedido: Request): Promise<Response> {
  return responderDesafioMeta(pedido, process.env.WHATSAPP_META_VERIFY_TOKEN);
}

export async function POST(pedido: Request): Promise<Response> {
  const segredo = process.env.WHATSAPP_META_APP_SECRET;
  if (!segredo) return new Response(null, { status: 503 });
  if (Number(pedido.headers.get("content-length") ?? 0) > LIMITE) return new Response(null, { status: 413 });
  const bruto = await pedido.text();
  if (bruto.length > LIMITE) return new Response(null, { status: 413 });
  if (!assinaturaMetaCorreta(pedido.headers.get("x-hub-signature-256") ?? "", bruto, segredo)) {
    return new Response(null, { status: 401 });
  }
  let corpo: unknown;
  try { corpo = JSON.parse(bruto); } catch { return new Response(null, { status: 400 }); }
  try {
    const conexoes = await emTransacao((tx) => registrarAvisos(tx, corpo));
    return Response.json({ conexoes });
  } catch {
    // Nunca registra o conteúdo do aviso: são mensagens dos clientes do cliente.
    console.error("[whatsapp] falha ao registrar aviso de número conectado.");
    return new Response(null, { status: 503 });
  }
}
