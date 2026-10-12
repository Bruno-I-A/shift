import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { emTransacao } from "@/lib/banco";
import { analisarAtendimento } from "@/lib/ia-atendimento";
import {
  apagarAvisoWhatsApp, autorizarAtendimentoWhatsApp, buscarAtendimentoWhatsApp, buscarAvisoWhatsApp,
  marcarEnvioWhatsApp, pausarSeRespostaHumana, registrarRespostaWhatsApp,
  registrarAvisoWhatsApp,
} from "@/lib/leads";
import { decidirConsentimentoWhatsApp, enviarTextoEvolution, lerMensagemDaShiftEvolution, lerMensagemEvolution } from "@/lib/whatsapp";

export const runtime = "nodejs";

function segredoCorreto(recebido: string, esperado: string): boolean {
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

const AVISO = "Olá! Sou o assistente virtual da Shift Systems. Posso responder dúvidas e encaminhar você à equipe. Para guardar suas informações e usar IA no atendimento, responda *SIM* e depois repita sua pergunta. Veja nossa política: https://shiftsys.com.br/privacidade.html";
const BOAS_VINDAS = "Obrigado por autorizar. Como posso ajudar? Se quiser conversar sobre sua empresa, me diga seu nome e o processo que mais consome tempo.";

export async function POST(pedido: Request): Promise<Response> {
  if (process.env.WHATSAPP_ATIVO !== "sim") return new Response(null, { status: 503 });
  const segredo = process.env.WHATSAPP_WEBHOOK_SEGREDO;
  if (!segredo || !segredoCorreto(pedido.headers.get("x-shift-webhook-token") ?? "", segredo)) {
    return new Response(null, { status: 401 });
  }
  if (Number(pedido.headers.get("content-length") ?? 0) > 64_000) return new Response(null, { status: 413 });
  let corpo: unknown;
  let respostaRegistrada = false;
  try {
    const bruto = await pedido.text();
    if (bruto.length > 64_000) return new Response(null, { status: 413 });
    corpo = JSON.parse(bruto);
  } catch { return new Response(null, { status: 400 }); }
  const instancia = process.env.EVOLUTION_INSTANCIA ?? "";
  const enviadaPelaShift = lerMensagemDaShiftEvolution(corpo, instancia);
  if (enviadaPelaShift) {
    try {
      await emTransacao((tx) => pausarSeRespostaHumana(tx, enviadaPelaShift.whatsapp, enviadaPelaShift.texto));
      return Response.json({ enviadaPelaShift: true });
    } catch { return new Response(null, { status: 503 }); }
  }
  const mensagem = lerMensagemEvolution(corpo, instancia);
  if (!mensagem) return Response.json({ ignorado: true });

  try {
    let atendimento = await emTransacao((tx) => buscarAtendimentoWhatsApp(tx, mensagem.whatsapp));
    if (atendimento && ["ganho", "perdido"].includes(atendimento.etapa)) atendimento = null;
    if (!atendimento) {
      const chaveAviso = createHmac("sha256", segredo).update(mensagem.whatsapp).digest("hex");
      const aviso = await emTransacao((tx) => buscarAvisoWhatsApp(tx, chaveAviso));
      const decisao = decidirConsentimentoWhatsApp(aviso, mensagem);
      if (decisao === "ignorar") return Response.json({ avisoRecente: true });
      if (decisao === "avisar") {
        await enviarTextoEvolution(mensagem.whatsapp, AVISO);
        await emTransacao((tx) => registrarAvisoWhatsApp(tx, chaveAviso, mensagem.id));
        return Response.json({ aviso: true });
      }
      atendimento = await emTransacao((tx) => autorizarAtendimentoWhatsApp(tx, mensagem.whatsapp));
      await emTransacao((tx) => apagarAvisoWhatsApp(tx, chaveAviso));
      const novo = await emTransacao((tx) => registrarRespostaWhatsApp(tx, atendimento!, mensagem.id, {
        resposta: BOAS_VINDAS, nome: "", empresa: "", segmento: "", dor: "", prazo: "", resumo: "", passarParaHumano: false,
      }));
      if (!novo) return Response.json({ duplicado: true });
      respostaRegistrada = true;
      await enviarTextoEvolution(mensagem.whatsapp, BOAS_VINDAS);
      await emTransacao((tx) => marcarEnvioWhatsApp(tx, mensagem.id, true));
      return Response.json({ autorizado: true });
    }
    if (atendimento.modo === "humano") return Response.json({ humano: true });
    if (/^(sim|aceito|autorizo)([.! ]*)$/i.test(mensagem.texto) && !atendimento.resumo) return Response.json({ duplicado: true });

    const analise = await analisarAtendimento(mensagem.texto, atendimento.resumo).catch(() => ({
      resposta: "O atendimento automático está indisponível no momento. Vou deixar seu contato para uma pessoa da Shift continuar por aqui.",
      nome: "", empresa: "", segmento: "", dor: "", prazo: "",
      resumo: atendimento.resumo, passarParaHumano: true,
    }));
    const novo = await emTransacao((tx) => registrarRespostaWhatsApp(tx, atendimento!, mensagem.id, analise));
    if (!novo) return Response.json({ duplicado: true });
    respostaRegistrada = true;
    await enviarTextoEvolution(mensagem.whatsapp, analise.resposta);
    await emTransacao((tx) => marcarEnvioWhatsApp(tx, mensagem.id, true));
    return Response.json({ recebido: true });
  } catch {
    // Nunca registra o texto recebido nem o número do contato em logs.
    console.error("[whatsapp] atendimento falhou; verifique conexão e envios pendentes no CRM.");
    if (respostaRegistrada) await emTransacao((tx) => marcarEnvioWhatsApp(tx, mensagem.id, false)).catch(() => {});
    return new Response(null, { status: 503 });
  }
}
