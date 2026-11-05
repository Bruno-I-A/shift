import { assinaturaMetaCorreta, responderDesafioMeta } from "@/lib/assinatura-meta";
import { emTransacao } from "@/lib/banco";
import { registrarAvisos } from "@/lib/conexoes-whatsapp";
import {
  iniciarAtendimentoWhatsApp, buscarAtendimentoWhatsApp,
  enfileirarMensagemWhatsApp, registrarRespostaPeloAppWhatsApp, registrarStatusWhatsApp,
} from "@/lib/leads";
import { lerEcosMeta, lerMensagensMeta, lerStatusMeta, type MensagemRecebida } from "@/lib/whatsapp";

export const runtime = "nodejs";

export async function GET(pedido: Request): Promise<Response> {
  return responderDesafioMeta(pedido, process.env.WHATSAPP_META_VERIFY_TOKEN);
}

async function atenderMensagem(mensagem: MensagemRecebida): Promise<void> {
  try {
    const ativo=process.env.WHATSAPP_ATIVO==='sim';
    await emTransacao(async tx=>{
      let atendimento=await buscarAtendimentoWhatsApp(tx,mensagem.whatsapp);
      if (!atendimento || ['ganho','perdido'].includes(atendimento.etapa)) {
        if (!ativo) return;
        atendimento=await iniciarAtendimentoWhatsApp(tx,mensagem.whatsapp);
      }
      // O primeiro turno entra na mesma fila dos seguintes, com deduplicação e agrupamento.
      await enfileirarMensagemWhatsApp(tx,atendimento,mensagem,ativo);
    });
  } catch {
    // Nunca registra o texto recebido nem o número do contato em logs.
    console.error("[whatsapp] atendimento falhou; verifique conexão e envios pendentes no CRM.");
    throw new Error("atendimento WhatsApp falhou");
  }
}

export async function POST(pedido: Request): Promise<Response> {
  const segredo = process.env.WHATSAPP_META_APP_SECRET;
  const phoneNumberId = process.env.WHATSAPP_META_PHONE_NUMBER_ID;
  if (!segredo || !phoneNumberId) return new Response(null, { status: 503 });
  if (Number(pedido.headers.get("content-length") ?? 0) > 64_000) return new Response(null, { status: 413 });

  const bruto = await pedido.text();
  if (bruto.length > 64_000) return new Response(null, { status: 413 });
  if (!assinaturaMetaCorreta(pedido.headers.get("x-hub-signature-256") ?? "", bruto, segredo)) return new Response(null, { status: 401 });

  let corpo: unknown;
  try { corpo = JSON.parse(bruto); } catch { return new Response(null, { status: 400 }); }
  const mensagens = lerMensagensMeta(corpo, phoneNumberId, true);
  try {
    for (const status of lerStatusMeta(corpo, phoneNumberId)) await emTransacao(tx => registrarStatusWhatsApp(tx, status));
    // Respostas pelo app (coexistência) antes das mensagens novas: se vierem
    // juntas, o agente já está pausado quando a mensagem do cliente entra.
    for (const eco of lerEcosMeta(corpo, phoneNumberId)) await emTransacao(tx => registrarRespostaPeloAppWhatsApp(tx, eco));
    for (const mensagem of mensagens) await atenderMensagem(mensagem);
  } catch {
    return new Response(null, { status: 503 });
  }
  // Avisos de conta dos números conectados (account_update…) sempre vêm para cá,
  // mesmo com o webhook separado. Contar é secundário: falha aqui não faz a Meta
  // reenviar as mensagens da Shift.
  try { await emTransacao(tx => registrarAvisos(tx, corpo)); }
  catch { console.warn("[whatsapp] não foi possível contar avisos de números conectados."); }
  return Response.json({ recebidas: mensagens.length });
}
