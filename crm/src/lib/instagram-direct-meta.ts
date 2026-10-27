import 'server-only';
import { createHmac } from 'node:crypto';
import * as z from 'zod';
import { iguais } from './segredos';
import { configuracaoInstagram, type Acesso } from './instagram-meta';

export interface EventoDirect {
  id: string; conta: string; contato: string; texto: string; quando: Date; eco: boolean; anexo: boolean;
}
const identificador = z.string().regex(/^\d{1,30}$/);
const evento = z.object({
  sender: z.object({ id: identificador }), recipient: z.object({ id: identificador }),
  timestamp: z.number().int().positive(),
  message: z.object({ mid: z.string().min(1).max(2000), text: z.string().max(12000).optional(),
    is_echo: z.boolean().optional(), is_deleted: z.boolean().optional(),
    attachments: z.array(z.unknown()).optional() }),
});

/** Apenas mensagens da conta conectada; nunca abre links ou baixa anexos. */
export function lerEventosDirect(corpo: unknown, conta: string, agora = Date.now()): EventoDirect[] {
  const envelope = z.object({ object: z.literal('instagram'), entry: z.array(z.object({
    id: z.string(), messaging: z.array(z.unknown()).optional(),
  })) }).safeParse(corpo);
  if (!envelope.success) return [];
  return envelope.data.entry.filter(e => e.id === conta).flatMap(e => (e.messaging ?? []).flatMap(bruto => {
    const lido = evento.safeParse(bruto);
    if (!lido.success) return [];
    const m = lido.data;
    const eco = m.message.is_echo === true || m.sender.id === conta;
    if ((eco ? m.sender.id : m.recipient.id) !== conta || m.message.is_deleted ||
      m.timestamp > agora + 60_000 || m.timestamp < agora - 24 * 3600_000) return [];
    const anexo = !!m.message.attachments?.length;
    const texto = m.message.text?.trim() || (anexo ? '[Anexo recebido no Instagram]' : '');
    if (!texto) return [];
    return [{ id: m.message.mid, conta, contato: eco ? m.recipient.id : m.sender.id,
      texto, quando: new Date(m.timestamp), eco, anexo }];
  }));
}

export function assinaturaDirectValida(assinatura: string, corpo: string, segredo: string): boolean {
  return /^sha256=[a-f0-9]{64}$/.test(assinatura) && iguais(assinatura,
    `sha256=${createHmac('sha256', segredo).update(corpo).digest('hex')}`);
}

async function chamarDirect(acesso: Acesso, caminho: string, corpo: unknown): Promise<unknown> {
  const { versao } = configuracaoInstagram();
  const resposta = await fetch(`https://graph.instagram.com/${versao}/${acesso.usuarioId}/${caminho}`, {
    method: 'POST', headers: { Authorization: `Bearer ${acesso.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo), signal: AbortSignal.timeout(10_000),
  });
  if (!resposta.ok) throw new Error(`Meta Direct HTTP ${resposta.status}`);
  return resposta.json();
}

export async function assinarDirect(acesso: Acesso): Promise<void> {
  const resultado = z.object({ success: z.literal(true) }).safeParse(await chamarDirect(acesso, 'subscribed_apps', {
    subscribed_fields: 'messages',
  }));
  if (!resultado.success) throw new Error('Assinatura do Direct não confirmada.');
}

export async function enviarTextoDirect(acesso: Acesso, contato: string, texto: string): Promise<string> {
  identificador.parse(contato);
  z.string().min(1).max(1000).parse(texto);
  const resultado = z.object({ message_id: z.string().min(1).max(2000) }).parse(await chamarDirect(acesso, 'messages', {
    recipient: { id: contato }, message: { text: texto },
  }));
  return resultado.message_id;
}
