import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { emTransacao } from "@/lib/banco";
import {
  iniciarAtendimentoWhatsApp, buscarAtendimentoWhatsApp,
  enfileirarMensagemWhatsApp, registrarStatusWhatsApp,
} from "@/lib/leads";
import { lerMensagensMeta, lerStatusMeta, type MensagemRecebida } from "@/lib/whatsapp";

export const runtime = "nodejs";


function segredoCorreto(recebido: string, esperado: string): boolean {
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

function assinaturaMetaCorreta(recebida: string, corpo: string, segredo: string): boolean {
  const esperada = `sha256=${createHmac("sha256", segredo).update(corpo).digest("hex")}`;
  return segredoCorreto(recebida, esperada);
}

export async function GET(pedido: Request): Promise<Response> {
  const url = new URL(pedido.url);
  const modo = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token") ?? "";
  const desafio = url.searchParams.get("hub.challenge");
  const esperado = process.env.WHATSAPP_META_VERIFY_TOKEN;
  if (modo !== "subscribe" || !desafio || !esperado || !segredoCorreto(token, esperado)) return new Response(null, { status: 403 });
  return new Response(desafio, { status: 200, headers: { "Content-Type": "text/plain" } });
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
    for (const mensagem of mensagens) await atenderMensagem(mensagem);
    return Response.json({ recebidas: mensagens.length });
  } catch {
    return new Response(null, { status: 503 });
  }
}
