import * as z from "zod";

import { emTransacao } from "@/lib/banco";
import { conectarNumero, conferirEstado, enviarTeste, listarConexoes, sincronizar } from "@/lib/conexoes-whatsapp";
import { ErroDeDominio } from "@/lib/dominio";
import { temSessao } from "@/lib/sessao";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  if (!(await temSessao())) return new Response(null, { status: 401 });
  const conexoes = await emTransacao(listarConexoes);
  return Response.json({ conexoes }, { headers: { "Cache-Control": "private, no-store" } });
}

const comando = z.discriminatedUnion("acao", [
  z.object({
    acao: z.literal("conectar"), codigo: z.string(), waba_id: z.string().optional(),
    phone_number_id: z.string().optional(), business_id: z.string().optional(), evento: z.string().optional(),
    numero_da_shift: z.boolean().optional(),
  }),
  z.object({ acao: z.literal("conferir"), id: z.uuid() }),
  z.object({ acao: z.literal("sincronizar"), id: z.uuid(), tipo: z.enum(["contatos", "historico"]) }),
  z.object({ acao: z.literal("enviar"), id: z.uuid(), para: z.string().max(40), texto: z.string().max(1000) }),
]);

export async function POST(pedido: Request): Promise<Response> {
  if (!(await temSessao())) return new Response(null, { status: 401 });
  if (pedido.headers.get("origin") !== new URL(process.env.APP_URL || pedido.url).origin) return new Response(null, { status: 403 });
  const bruto = await pedido.text();
  if (Buffer.byteLength(bruto) > 20_000) return new Response(null, { status: 413 });
  let d: z.infer<typeof comando>;
  try { d = comando.parse(JSON.parse(bruto)); } catch { return Response.json({ erro: "Pedido inválido." }, { status: 400 }); }
  try {
    switch (d.acao) {
      case "conectar":
        return Response.json(await conectarNumero(emTransacao, {
          codigo: d.codigo, wabaId: d.waba_id || undefined, phoneNumberId: d.phone_number_id || undefined,
          businessId: d.business_id || undefined, evento: d.evento || undefined, numeroDaShift: d.numero_da_shift ?? false,
        }));
      case "conferir":
        return Response.json({ numero: await conferirEstado(emTransacao, d.id) });
      case "sincronizar":
        return Response.json({ pedido: await sincronizar(emTransacao, d.id, d.tipo) });
      case "enviar":
        return Response.json({ mensagem: await enviarTeste(emTransacao, d.id, d.para, d.texto) });
    }
  } catch (erro) {
    if (erro instanceof ErroDeDominio) return Response.json({ erro: erro.message }, { status: 400 });
    if (erro instanceof z.ZodError) return Response.json({ erro: erro.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
    console.error("[whatsapp] falha na conexão de número.");
    return Response.json({ erro: "A Meta não respondeu como esperado. Confira a conexão antes de repetir." }, { status: 502 });
  }
}
