import "server-only";

import * as z from "zod";

const esquema = z.object({
  event: z.string(),
  instance: z.string(),
  data: z.object({
    key: z.object({ id: z.string().min(1).max(200), remoteJid: z.string(), remoteJidAlt: z.string().optional(), fromMe: z.boolean() }),
    messageTimestamp: z.union([z.number(), z.string()]),
    message: z.object({
      conversation: z.string().optional(),
      extendedTextMessage: z.object({ text: z.string() }).optional(),
    }).optional(),
  }),
});

export interface MensagemRecebida { id: string; whatsapp: string; texto: string }

export function decidirConsentimentoWhatsApp(
  aviso: { mensagemId: string; enviadoEm: Date } | null,
  mensagem: Pick<MensagemRecebida, "id" | "texto">,
  agora = Date.now(),
): "autorizar" | "avisar" | "ignorar" {
  const idade = aviso ? agora - new Date(aviso.enviadoEm).getTime() : Infinity;
  const autorizou = /^(sim|aceito|autorizo)([.! ]*)$/i.test(mensagem.texto);
  if (aviso?.mensagemId === mensagem.id) return "ignorar";
  if (autorizou && aviso && idade >= -60_000 && idade <= 86_400_000) return "autorizar";
  if (aviso && idade >= 0 && idade < 600_000) return "ignorar";
  return "avisar";
}

function recente(valor: number | string): boolean {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return false;
  const milissegundos = numero > 1_000_000_000_000 ? numero : numero * 1000;
  return Math.abs(Date.now() - milissegundos) <= 10 * 60_000;
}

/** Aceita apenas texto de conversa individual, da instância autorizada. */
export function lerMensagemEvolution(corpo: unknown, instancia: string): MensagemRecebida | null {
  const lido = esquema.safeParse(corpo);
  if (!lido.success) return null;
  const { event, instance, data } = lido.data;
  if (event.toLowerCase().replaceAll("_", ".") !== "messages.upsert" || instance !== instancia || data.key.fromMe || !recente(data.messageTimestamp)) return null;
  const jid = [data.key.remoteJid, data.key.remoteJidAlt].find((valor) => valor && /^\d{10,15}@s\.whatsapp\.net$/.test(valor));
  if (!jid) return null;
  const texto = (data.message?.conversation ?? data.message?.extendedTextMessage?.text ?? "").trim();
  if (!texto || texto.length > 1500) return null;
  return { id: data.key.id, whatsapp: jid.split("@")[0], texto };
}

/** Mensagem escrita no aparelho da Shift: pode indicar que uma pessoa assumiu. */
export function lerMensagemDaShiftEvolution(corpo: unknown, instancia: string): MensagemRecebida | null {
  const lido = esquema.safeParse(corpo);
  if (!lido.success) return null;
  const { event, instance, data } = lido.data;
  if (event.toLowerCase().replaceAll("_", ".") !== "messages.upsert" || instance !== instancia || !data.key.fromMe || !recente(data.messageTimestamp)) return null;
  const jid = [data.key.remoteJid, data.key.remoteJidAlt].find((valor) => valor && /^\d{10,15}@s\.whatsapp\.net$/.test(valor));
  if (!jid) return null;
  const texto = (data.message?.conversation ?? data.message?.extendedTextMessage?.text ?? "").trim();
  if (!data.message || texto.length > 4000) return null;
  return { id: data.key.id, whatsapp: jid.split("@")[0], texto };
}

export async function enviarTextoEvolution(whatsapp: string, texto: string): Promise<void> {
  const endereco = process.env.EVOLUTION_URL;
  const chave = process.env.EVOLUTION_API_KEY;
  const instancia = process.env.EVOLUTION_INSTANCIA;
  if (!endereco || !chave || !instancia) throw new Error("Evolution API não configurada.");
  const base = new URL(endereco);
  if (!['http:', 'https:'].includes(base.protocol)) throw new Error("EVOLUTION_URL inválida.");
  const url = new URL(`message/sendText/${encodeURIComponent(instancia)}`, `${base.href.replace(/\/$/, "")}/`);
  const resposta = await fetch(url, {
    method: "POST", headers: { apikey: chave, "Content-Type": "application/json" },
    body: JSON.stringify({ number: whatsapp, text: texto, delay: Math.min(texto.length * 40, 3000) }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!resposta.ok) throw new Error(`Evolution API indisponível (${resposta.status}).`);
}
