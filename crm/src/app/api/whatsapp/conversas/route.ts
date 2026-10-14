import * as z from 'zod';
import { emTransacao } from '@/lib/banco';
import { listarConversasWhatsApp, listarMensagensWhatsApp } from '@/lib/leads';
import { temSessao } from '@/lib/sessao';

export const runtime = 'nodejs';

export async function GET(pedido: Request): Promise<Response> {
  if (!await temSessao()) return new Response(null, { status: 401 });
  const params = new URL(pedido.url).searchParams;
  const id = params.get('lead');
  const antes = params.get('antes') ?? undefined;
  if ((id && !z.uuid().safeParse(id).success) || (antes && antes.length > 220)) return new Response(null, { status: 400 });
  const dados = await emTransacao(async tx => ({
    conversas: await listarConversasWhatsApp(tx),
    mensagens: id ? await listarMensagensWhatsApp(tx, id, antes) : [],
  }));
  return Response.json(dados, { headers: { 'Cache-Control': 'private, no-store' } });
}
