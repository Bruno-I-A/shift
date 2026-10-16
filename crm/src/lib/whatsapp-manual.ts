import 'server-only';
import * as z from 'zod';
import type { Consulta } from './consulta';
import { confirmarMensagemWhatsApp, prepararRespostaHumanaWhatsApp } from './leads';

type Executor = <T>(trabalho: (tx: Consulta) => Promise<T>) => Promise<T>;

/** Painel e MCP compartilham validação, tomada humana e idempotência do envio. */
export async function enviarRespostaHumana(
  executar: Executor, enviar: (numero: string, texto: string) => Promise<string>,
  entrada: { leadId: string; pedidoId: string; texto: string },
): Promise<{ estado: 'enviado' | 'ja_registrado' | 'erro'; mensagem: string }> {
  const dados = z.object({ leadId: z.uuid(), pedidoId: z.uuid(), texto: z.string().trim().min(1).max(4000) }).parse(entrada);
  const whatsapp = await executar(tx => prepararRespostaHumanaWhatsApp(tx, dados.leadId, dados.pedidoId, dados.texto));
  if (!whatsapp) return { estado: 'ja_registrado', mensagem: 'Esta tentativa já foi registrada. Confira o histórico antes de enviar novamente.' };
  try {
    const metaId = await enviar(whatsapp, dados.texto);
    await executar(tx => confirmarMensagemWhatsApp(tx, `h:${dados.pedidoId}`, metaId));
    return { estado: 'enviado', mensagem: 'Mensagem enviada. Você está no controle desta conversa.' };
  } catch {
    await executar(tx => confirmarMensagemWhatsApp(tx, `h:${dados.pedidoId}`, null)).catch(() => {});
    return { estado: 'erro', mensagem: 'O envio não foi confirmado. Confira o histórico antes de repetir; o agente continua pausado.' };
  }
}
