import * as z from 'zod';
import { emTransacao } from '@/lib/banco';
import { acessoDaConta, lerConta } from '@/lib/instagram';
import { assinarDirect } from '@/lib/instagram-direct-meta';
import { historicoDirect, listarDirect, mudarModoDirect, prepararManualDirect } from '@/lib/leads';
import { temSessao } from '@/lib/sessao';
import { ErroDeDominio } from '@/lib/dominio';

export const runtime='nodejs';
export async function GET(pedido:Request):Promise<Response> {
  if (!await temSessao()) return new Response(null,{status:401});
  const params=new URL(pedido.url).searchParams;
  const id=params.get('conversa');
  const antes=params.get('antes');
  if ((id&&!z.uuid().safeParse(id).success)||(antes&&!z.iso.datetime({offset:true}).safeParse(antes).success)) return new Response(null,{status:400});
  const dados=await emTransacao(async tx=>{
    const conta=await lerConta(tx);
    const conversas=conta?await listarDirect(tx,conta.usuarioId):[];
    if (id) {
      const {rows}=await tx.query('select 1 from crm.conversa_instagram where id=$1 and conta_id=$2',[id,conta?.usuarioId||'']);
      if (!rows.length) throw new ErroDeDominio('Conversa não encontrada.');
    }
    const {rows:estado}=await tx.query<{direct_assinado:boolean}>('select direct_assinado from crm.conta_instagram');
    return {conta,ativo:process.env.INSTAGRAM_DIRECT_ATIVO==='sim',assinado:estado[0]?.direct_assinado||false,
      conversas,mensagens:id?await historicoDirect(tx,id,antes||undefined):[]};
  }).catch(()=>null);
  if (!dados) return Response.json({erro:'Não foi possível abrir as conversas.'},{status:503});
  return Response.json(dados,{headers:{'Cache-Control':'private, no-store'}});
}
const comando=z.discriminatedUnion('acao',[
  z.object({acao:z.literal('conectar')}),
  z.object({acao:z.literal('modo'),id:z.uuid(),modo:z.enum(['agente','humano'])}),
  z.object({acao:z.literal('enviar'),id:z.uuid(),texto:z.string().trim().min(1).max(1000),idEnvio:z.uuid()}),
]);
export async function POST(pedido:Request):Promise<Response> {
  if (!await temSessao()) return new Response(null,{status:401});
  if (pedido.headers.get('origin')!==new URL(process.env.APP_URL||pedido.url).origin) return new Response(null,{status:403});
  if (Number(pedido.headers.get('content-length')||0)>8000) return new Response(null,{status:413});
  const bruto=await pedido.text();
  if (Buffer.byteLength(bruto)>8000) return new Response(null,{status:413});
  let dados:z.infer<typeof comando>;
  try {dados=comando.parse(JSON.parse(bruto));} catch {return Response.json({erro:'Pedido inválido.'},{status:400});}
  try {
    if (dados.acao==='conectar') {
      const acesso=await emTransacao(acessoDaConta);
      if (!acesso || acesso.expiraEm.getTime()<=Date.now()) throw new ErroDeDominio('Reconecte o Instagram primeiro.');
      await assinarDirect(acesso);
      await emTransacao(tx=>tx.query('update crm.conta_instagram set direct_assinado=true where usuario_id=$1',[acesso.usuarioId]));
    } else await emTransacao(async tx=>{
      const conta=await lerConta(tx);
      const {rows}=await tx.query('select 1 from crm.conversa_instagram where id=$1 and conta_id=$2',[dados.id,conta?.usuarioId||'']);
      if (!rows.length) throw new ErroDeDominio('Conversa não encontrada.');
      if (dados.acao==='modo') await mudarModoDirect(tx,dados.id,dados.modo);
      else await prepararManualDirect(tx,dados.id,dados.texto,dados.idEnvio);
    });
    return Response.json({ok:true});
  } catch (e) {
    return Response.json({erro:e instanceof ErroDeDominio?e.message:'A Meta não confirmou a conexão. Reconecte o Instagram com a permissão de mensagens e confira os webhooks.'},{status:400});
  }
}
