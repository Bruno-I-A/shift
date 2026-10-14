import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { emTransacao } from "@/lib/banco";
import { analisarAtendimento } from "@/lib/ia-atendimento";
import {
  apagarAvisoWhatsApp, autorizarAtendimentoWhatsApp, buscarAtendimentoWhatsApp, buscarAvisoWhatsApp,
  marcarEnvioWhatsApp, registrarRespostaWhatsApp, registrarAvisoWhatsApp,
} from "@/lib/leads";
import { decidirConsentimentoWhatsApp, enviarTextoMeta, lerMensagensMeta, type MensagemRecebida } from "@/lib/whatsapp";

export const runtime = "nodejs";

const AVISO = "Olá! Sou o assistente virtual da Shift Systems. Posso responder dúvidas e encaminhar você à equipe. Para guardar suas informações e usar IA no atendimento, responda *SIM* e depois repita sua pergunta. Veja nossa política: https://shiftsys.com.br/privacidade.html";
const BOAS_VINDAS = "Obrigado por autorizar. Como posso ajudar? Se quiser conversar sobre sua empresa, me diga seu nome e o processo que mais consome tempo.";

function segredoCorreto(recebido: string, esperado: string): boolean {
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

function assinaturaMetaCorreta(recebida: string, corpo: string, segredo: string): boolean {
  const esperada = `sha256=${createHmac("sha256", segredo).update(corpo).digest("hex")}`;
  return segredoCorreto(recebida, esperada);
}

function motivoSeguroDaIa(erro: unknown): string {
  if (!(erro instanceof Error)) return "falha de rede ou timeout.";
  if (/^IA indisponível \(\d{3}\)\.$/.test(erro.message)) return erro.message;
  if (["Configuração de IA ausente.", "Resposta da IA fora do formato esperado."].includes(erro.message)) return erro.message;
  return "falha de rede ou timeout.";
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

async function atenderMensagem(mensagem: MensagemRecebida, segredo: string): Promise<void> {
  let respostaRegistrada = false;
  try {
    let atendimento = await emTransacao((tx) => buscarAtendimentoWhatsApp(tx, mensagem.whatsapp));
    if (atendimento && ["ganho", "perdido"].includes(atendimento.etapa)) atendimento = null;
    if (!atendimento) {
      const chaveAviso = createHmac("sha256", segredo).update(`aviso:${mensagem.whatsapp}`).digest("hex");
      const aviso = await emTransacao((tx) => buscarAvisoWhatsApp(tx, chaveAviso));
      const decisao = decidirConsentimentoWhatsApp(aviso, mensagem);
      if (decisao === "ignorar") return;
      if (decisao === "avisar") {
        await enviarTextoMeta(mensagem.whatsapp, AVISO);
        await emTransacao((tx) => registrarAvisoWhatsApp(tx, chaveAviso, mensagem.id));
        return;
      }
      atendimento = await emTransacao((tx) => autorizarAtendimentoWhatsApp(tx, mensagem.whatsapp));
      await emTransacao((tx) => apagarAvisoWhatsApp(tx, chaveAviso));
      const novo = await emTransacao((tx) => registrarRespostaWhatsApp(tx, atendimento!, mensagem.id, {
        resposta: BOAS_VINDAS, nome: "", empresa: "", segmento: "", dor: "", prazo: "", resumo: "", passarParaHumano: false,
      }));
      if (!novo) return;
      respostaRegistrada = true;
      await enviarTextoMeta(mensagem.whatsapp, BOAS_VINDAS);
      await emTransacao((tx) => marcarEnvioWhatsApp(tx, mensagem.id, true));
      return;
    }
    if (atendimento.modo === "humano") return;
    if (/^(sim|aceito|autorizo)([.! ]*)$/i.test(mensagem.texto) && !atendimento.resumo) return;

    const analise = await analisarAtendimento(mensagem.texto, atendimento.resumo).catch((erro) => {
      console.error(`[whatsapp] IA indisponível: ${motivoSeguroDaIa(erro)}`);
      return {
        resposta: "O atendimento automático está indisponível no momento. Vou deixar seu contato para uma pessoa da Shift continuar por aqui.",
        nome: "", empresa: "", segmento: "", dor: "", prazo: "",
        resumo: atendimento.resumo, passarParaHumano: true,
      };
    });
    const novo = await emTransacao((tx) => registrarRespostaWhatsApp(tx, atendimento!, mensagem.id, analise));
    if (!novo) return;
    respostaRegistrada = true;
    await enviarTextoMeta(mensagem.whatsapp, analise.resposta);
    await emTransacao((tx) => marcarEnvioWhatsApp(tx, mensagem.id, true));
  } catch {
    // Nunca registra o texto recebido nem o número do contato em logs.
    console.error("[whatsapp] atendimento falhou; verifique conexão e envios pendentes no CRM.");
    if (respostaRegistrada) await emTransacao((tx) => marcarEnvioWhatsApp(tx, mensagem.id, false)).catch(() => {});
    throw new Error("atendimento WhatsApp falhou");
  }
}

export async function POST(pedido: Request): Promise<Response> {
  if (process.env.WHATSAPP_ATIVO !== "sim") return new Response(null, { status: 503 });
  const segredo = process.env.WHATSAPP_META_APP_SECRET;
  const phoneNumberId = process.env.WHATSAPP_META_PHONE_NUMBER_ID;
  if (!segredo || !phoneNumberId) return new Response(null, { status: 503 });
  if (Number(pedido.headers.get("content-length") ?? 0) > 64_000) return new Response(null, { status: 413 });

  const bruto = await pedido.text();
  if (bruto.length > 64_000) return new Response(null, { status: 413 });
  if (!assinaturaMetaCorreta(pedido.headers.get("x-hub-signature-256") ?? "", bruto, segredo)) return new Response(null, { status: 401 });

  let corpo: unknown;
  try { corpo = JSON.parse(bruto); } catch { return new Response(null, { status: 400 }); }
  const mensagens = lerMensagensMeta(corpo, phoneNumberId);
  try {
    for (const mensagem of mensagens) await atenderMensagem(mensagem, segredo);
    return Response.json({ recebidas: mensagens.length });
  } catch {
    return new Response(null, { status: 503 });
  }
}
