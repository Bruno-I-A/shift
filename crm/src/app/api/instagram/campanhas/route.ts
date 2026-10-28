import * as z from 'zod';
import {emTransacao} from '@/lib/banco';
import {lerConta,acessoDaConta} from '@/lib/instagram';
import {assinarComentariosInstagram,listarMidiasCampanha} from '@/lib/comentarios-instagram-meta';
import {esquemaCampanhaInstagram,alternarCampanhaInstagram,listarCampanhasInstagram,repetirRespostaComentario} from '@/lib/leads';
import {salvarCampanhaComPublicacao} from '@/lib/gestao-campanhas-instagram';
import {temSessao} from '@/lib/sessao';
import {ErroDeDominio} from '@/lib/dominio';
export const runtime='nodejs';
export async function GET(pedido:Request):Promise<Response>{
  if(!await temSessao())return new Response(null,{status:401});
  try{
    const dados=await emTransacao(async tx=>{
      const conta=await lerConta(tx);
      const {rows}=await tx.query<{comentarios_assinados:boolean}>('select comentarios_assinados from crm.conta_instagram');
      return {conta,ativo:process.env.INSTAGRAM_DIRECT_ATIVO==='sim',assinado:rows[0]?.comentarios_assinados||false,...(conta?await listarCampanhasInstagram(tx,conta.usuarioId):{campanhas:[],respostas:[]})};
    });
    let midias;
    if(new URL(pedido.url).searchParams.get('midias')==='sim'){
      const acesso=await emTransacao(acessoDaConta);
      if(acesso)midias=await listarMidiasCampanha(acesso);
    }
    return Response.json({...dados,...(midias?{midias}:{})},{headers:{'Cache-Control':'private, no-store'}});
  }catch{return Response.json({erro:'Não foi possível carregar as campanhas. Confira a conexão do Instagram.'},{status:503});}
}
const comando=z.discriminatedUnion('acao',[
  z.object({acao:z.literal('conectar')}),
  z.object({acao:z.literal('salvar'),campanha:esquemaCampanhaInstagram}),
  z.object({acao:z.literal('ativar'),id:z.uuid(),ativa:z.boolean()}),
  z.object({acao:z.literal('repetir'),id:z.uuid()}),
]);
export async function POST(pedido:Request):Promise<Response>{
  if(!await temSessao())return new Response(null,{status:401});
  if(pedido.headers.get('origin')!==new URL(process.env.APP_URL||pedido.url).origin)return new Response(null,{status:403});
  if(Number(pedido.headers.get('content-length')||0)>20000)return new Response(null,{status:413});
  const bruto=await pedido.text();if(Buffer.byteLength(bruto)>20000)return new Response(null,{status:413});
  let d:z.infer<typeof comando>;
  try{d=comando.parse(JSON.parse(bruto));}catch{return Response.json({erro:'Confira os campos da campanha.'},{status:400});}
  try{
    const acesso=await emTransacao(acessoDaConta);
    if(!acesso || acesso.expiraEm.getTime()<=Date.now())throw new ErroDeDominio('Reconecte o Instagram primeiro.');
    if(d.acao==='conectar'){
      await assinarComentariosInstagram(acesso);
      await emTransacao(tx=>tx.query('update crm.conta_instagram set comentarios_assinados=true,direct_assinado=true where usuario_id=$1',[acesso.usuarioId]));
    }else if(d.acao==='salvar'){
      await salvarCampanhaComPublicacao(emTransacao,d.campanha);
    }else if(d.acao==='ativar'){
      await emTransacao(async tx=>{
        const {rows}=await tx.query<{comentarios_assinados:boolean}>('select comentarios_assinados from crm.conta_instagram where usuario_id=$1',[acesso.usuarioId]);
        if(d.ativa&&!rows[0]?.comentarios_assinados)throw new ErroDeDominio('Conecte os comentários antes de ativar a campanha.');
        await alternarCampanhaInstagram(tx,acesso.usuarioId,d.id,d.ativa);
      });
    }else await emTransacao(tx=>repetirRespostaComentario(tx,acesso.usuarioId,d.id));
    return Response.json({ok:true});
  }catch(e){return Response.json({erro:e instanceof ErroDeDominio?e.message:'A Meta não confirmou. Confira a permissão de comentários, a publicação e o estado do app.'},{status:400});}
}
