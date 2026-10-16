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
          image: z.object({ caption: z.string().optional() }).optional(),
          document: z.object({ filename: z.string().optional(), caption: z.string().optional() }).optional(),
        })).optional(),
        statuses: z.array(z.object({ id: z.string().min(1).max(200),
          status: z.enum(['sent', 'delivered', 'read', 'failed']), timestamp: z.union([z.number(), z.string()]),
        })).optional(),
      }),
    })),
  })),
});

export interface MensagemRecebida { id: string; whatsapp: string; texto: string; tipo?: string; recebidoEm?: Date }

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
export function lerMensagensMeta(corpo: unknown, phoneNumberId: string, incluirMidias = false): MensagemRecebida[] {
  const lido = esquemaWebhookMeta.safeParse(corpo);
  if (!lido.success) return [];

  return lido.data.entry.flatMap((entrada) => entrada.changes).flatMap((mudanca) => {
    if (mudanca.value.metadata.phone_number_id !== phoneNumberId) return [];
    return (mudanca.value.messages ?? []).flatMap((mensagem) => {
      const tipos: Record<string, string> = { image: 'Imagem', audio: 'Áudio', video: 'Vídeo', document: 'Documento', sticker: 'Figurinha', location: 'Localização', contacts: 'Contato' };
      const legenda = mensagem.image?.caption || mensagem.document?.caption || mensagem.document?.filename || '';
      const texto = mensagem.type === 'text' ? mensagem.text?.body.trim()
        : incluirMidias ? `[${tipos[mensagem.type] ?? 'Mensagem não textual'} recebida]${legenda ? ` ${legenda}` : ''}` : '';
      if (!texto || texto.length > 4000 || !recente(mensagem.timestamp)) return [];
      const registro = { id: mensagem.id, whatsapp: mensagem.from, texto };
      if (!incluirMidias) return [registro];
      const n = Number(mensagem.timestamp);
      return [{ ...registro, tipo: mensagem.type, recebidoEm: new Date(n > 1_000_000_000_000 ? n : n * 1000) }];
    });
  });
}

export function lerStatusMeta(corpo: unknown, phoneNumberId: string): { id: string; estado: string; ocorridoEm: Date }[] {
  const lido = esquemaWebhookMeta.safeParse(corpo);
  if (!lido.success) return [];
  return lido.data.entry.flatMap(e => e.changes).flatMap(c => c.value.metadata.phone_number_id !== phoneNumberId ? []
    : (c.value.statuses ?? []).flatMap(s => {
      const n = Number(s.timestamp);
      if (!Number.isFinite(n) || n <= 0) return [];
      return [{ id: s.id, estado: s.status, ocorridoEm: new Date(n > 1_000_000_000_000 ? n : n * 1000) }];
    }));
}

export async function enviarTextoMeta(whatsapp: string, texto: string): Promise<string> {
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
  const corpo = z.object({ messages: z.array(z.object({ id: z.string().min(1).max(200) })).min(1) }).safeParse(await resposta.json());
  if (!corpo.success) throw new Error('A Meta não confirmou o envio.');
  return corpo.data.messages[0].id;
}

/** Indicador real da Cloud API; falha cosmética não interrompe o atendimento. */
export async function iniciarDigitandoMeta(mensagemId: string): Promise<() => void> {
  let encerrado = false;
  let ocupado = false;
  const indicar = async () => {
    if (encerrado || ocupado) return;
    ocupado = true;
    try {
      const token = process.env.WHATSAPP_META_ACCESS_TOKEN;
      const numero = process.env.WHATSAPP_META_PHONE_NUMBER_ID;
      const versao = process.env.WHATSAPP_META_GRAPH_VERSION;
      if (!token || !numero || !/^v\d+\.\d+$/.test(versao ?? '')) return;
      const resposta = await fetch(`https://graph.facebook.com/${versao}/${encodeURIComponent(numero)}/messages`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: mensagemId, typing_indicator: { type: 'text' } }),
        signal: AbortSignal.timeout(3000),
      });
      if (!resposta.ok) console.warn(`[whatsapp] indicador de digitação indisponível; status=${resposta.status}.`);
    } catch { console.warn('[whatsapp] indicador de digitação indisponível.'); }
    finally { ocupado = false; }
  };
  await indicar();
  const timer = setInterval(() => { void indicar(); }, 20_000);
  timer.unref?.();
  return () => { encerrado = true; clearInterval(timer); };
}
