import { emTransacao } from '@/lib/banco';
import { lerConta } from '@/lib/instagram';
import { assinaturaDirectValida, lerEventosDirect } from '@/lib/instagram-direct-meta';
import { receberDirect } from '@/lib/leads';
import { receberComentarioInstagram } from '@/lib/leads';
import { lerComentariosInstagram } from '@/lib/comentarios-instagram-regras';
import { iguais } from '@/lib/segredos';

export const runtime='nodejs';
export async function GET(pedido:Request):Promise<Response> {
  const params=new URL(pedido.url).searchParams;
  const esperado=process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
  const desafio=params.get('hub.challenge');
  if (!esperado || !desafio || params.get('hub.mode')!=='subscribe' || !iguais(params.get('hub.verify_token')||'',esperado)) {
    return new Response(null,{status:403});
  }
  return new Response(desafio,{headers:{'Content-Type':'text/plain'}});
}
export async function POST(pedido:Request):Promise<Response> {
  const segredo=process.env.INSTAGRAM_WEBHOOK_APP_SECRET || process.env.INSTAGRAM_APP_SECRET;
  if (!segredo) return new Response(null,{status:503});
  if (Number(pedido.headers.get('content-length')||0)>64000) return new Response(null,{status:413});
  const corpo=await pedido.text();
  if (Buffer.byteLength(corpo)>64000) return new Response(null,{status:413});
  if (!assinaturaDirectValida(pedido.headers.get('x-hub-signature-256')||'',corpo,segredo)) return new Response(null,{status:401});
  let objeto:unknown;
  try { objeto=JSON.parse(corpo); } catch { return new Response(null,{status:400}); }
  try {
    const conta=await emTransacao(lerConta);
    if (!conta) return Response.json({recebidas:0});
    const eventos=lerEventosDirect(objeto,conta.usuarioId);
    for (const e of eventos) await emTransacao(tx=>receberDirect(tx,e,process.env.INSTAGRAM_DIRECT_ATIVO==='sim'));
    const comentarios=lerComentariosInstagram(objeto,conta.usuarioId);
    let enfileirados=0;
    for(const c of comentarios)if(await emTransacao(tx=>receberComentarioInstagram(tx,c)))enfileirados++;
    if(comentarios.length)console.info(`[instagram-comentarios] recebidos=${comentarios.length}; enfileirados=${enfileirados}`);
    return Response.json({recebidas:eventos.length,comentarios:comentarios.length});
  } catch {
    console.error('[instagram-direct] webhook não persistido; aguardando nova entrega da Meta.');
    return new Response(null,{status:503});
  }
}
