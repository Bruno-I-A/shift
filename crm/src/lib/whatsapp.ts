import "server-only";

import * as z from "zod";

const esquemaWebhookMeta = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(z.object({
    changes: z.array(z.object({
      field: z.literal("messages"),
      value: z.object({
        metadata: z.object({ phone_number_id: z.string().min(1).max(100) }),
        messages: z.array(z.object({
          from: z.string().regex(/^\d{10,15}$/),
          id: z.string().min(1).max(200),
          timestamp: z.union([z.number(), z.string()]),
          type: z.string(),
          text: z.object({ body: z.string() }).optional(),
        })).optional(),
      }),
    })),
  })),
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

/** Lê apenas textos recentes recebidos pelo número oficial configurado na Meta. */
export function lerMensagensMeta(corpo: unknown, phoneNumberId: string): MensagemRecebida[] {
  const lido = esquemaWebhookMeta.safeParse(corpo);
  if (!lido.success) return [];

  return lido.data.entry.flatMap((entrada) => entrada.changes).flatMap((mudanca) => {
    if (mudanca.value.metadata.phone_number_id !== phoneNumberId) return [];
    return (mudanca.value.messages ?? []).flatMap((mensagem) => {
      const texto = mensagem.type === "text" ? mensagem.text?.body.trim() : "";
      if (!texto || texto.length > 1500 || !recente(mensagem.timestamp)) return [];
      return [{ id: mensagem.id, whatsapp: mensagem.from, texto }];
    });
  });
}

export async function enviarTextoMeta(whatsapp: string, texto: string): Promise<void> {
  const token = process.env.WHATSAPP_META_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_META_PHONE_NUMBER_ID;
  const versao = process.env.WHATSAPP_META_GRAPH_VERSION;
  if (!token || !phoneNumberId || !versao) throw new Error("Cloud API do WhatsApp não configurada.");
  if (!/^v\d+\.\d+$/.test(versao)) throw new Error("WHATSAPP_META_GRAPH_VERSION inválida.");

  const resposta = await fetch(`https://graph.facebook.com/${versao}/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: whatsapp, type: "text", text: { body: texto, preview_url: false } }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!resposta.ok) throw new Error(`Cloud API do WhatsApp indisponível (${resposta.status}).`);
}
