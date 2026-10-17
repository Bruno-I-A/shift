import 'server-only';
import * as z from 'zod';
import type { Consulta } from './consulta';
import { confirmarMensagemWhatsApp, prepararModeloWhatsApp, prepararRespostaHumanaWhatsApp } from './leads';

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

/**
 * Envio de modelo pelo painel: mesmo desenho da resposta humana (registra,
 * envia, confirma; o mesmo pedidoId nunca envia duas vezes), sem a janela de
 * 24 horas. O que fica no histórico é o texto como o cliente o recebe.
 */
export async function enviarModeloHumano(
  executar: Executor,
  enviar: (numero: string, modelo: { nome: string; idioma: string }, parametros: string[]) => Promise<string>,
  entrada: { leadId: string; pedidoId: string; modelo: { nome: string; idioma: string; texto: string }; parametros: string[] },
): Promise<{ estado: 'enviado' | 'ja_registrado' | 'erro'; mensagem: string }> {
  const dados = z.object({
    leadId: z.uuid(), pedidoId: z.uuid(),
    modelo: z.object({ nome: z.string().regex(/^[a-z0-9_]{1,512}$/), idioma: z.string().regex(/^[a-z]{2}(_[A-Z]{2})?$/), texto: z.string().min(1).max(1024) }),
    parametros: z.array(z.string().trim().min(1, 'Preencha todas as variáveis.').max(200)).max(20),
  }).parse(entrada);
  const enviado = dados.modelo.texto.replace(/\{\{(\d+)\}\}/g, (_, n) => dados.parametros[Number(n) - 1] ?? `{{${n}}}`);
  if (/\{\{\d+\}\}/.test(enviado)) return { estado: 'erro', mensagem: 'Preencha todas as variáveis do modelo.' };
  const whatsapp = await executar(tx => prepararModeloWhatsApp(tx, dados.leadId, dados.pedidoId, enviado));
  if (!whatsapp) return { estado: 'ja_registrado', mensagem: 'Este envio já foi registrado. Confira o histórico antes de repetir.' };
  try {
    const metaId = await enviar(whatsapp, dados.modelo, dados.parametros);
    await executar(tx => confirmarMensagemWhatsApp(tx, `h:${dados.pedidoId}`, metaId));
    return { estado: 'enviado', mensagem: 'Modelo enviado. Quando o cliente responder, a conversa reabre e você continua por aqui.' };
  } catch (erro) {
    await executar(tx => confirmarMensagemWhatsApp(tx, `h:${dados.pedidoId}`, null)).catch(() => {});
    const motivo = erro instanceof Error && erro.message.startsWith('A Meta') ? ` ${erro.message}` : '';
    return { estado: 'erro', mensagem: `O envio não foi confirmado.${motivo} Confira o histórico antes de repetir.` };
  }
}
