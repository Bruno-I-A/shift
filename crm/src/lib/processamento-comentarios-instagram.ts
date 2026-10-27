import 'server-only';
import {emTransacao} from './banco';
import {acessoDaConta} from './instagram';
import {consultarComentario,enviarRespostaPrivada,ErroComentarioMeta} from './comentarios-instagram-meta';
import {reservarComentarioInstagram,prepararRespostaComentario,enviarRespostaComentario,falharConsultaComentario} from './leads';

export async function processarComentarioInstagram():Promise<void>{
  if(process.env.INSTAGRAM_DIRECT_ATIVO!=='sim')return;
  const lote=await emTransacao(reservarComentarioInstagram);
  if(!lote)return;
  const acesso=await emTransacao(acessoDaConta);
  if(!acesso || acesso.usuarioId!==lote.conta_id || acesso.expiraEm.getTime()<=Date.now()){
    await emTransacao(tx=>falharConsultaComentario(tx,lote,true));return;
  }
  let comentario:{texto:string;criadoEm:Date};
  try{comentario=await consultarComentario(acesso,lote.comentario_id);}
  catch(e){await emTransacao(tx=>falharConsultaComentario(tx,lote,e instanceof ErroComentarioMeta&&e.rejeitado));return;}
  if(!await emTransacao(tx=>prepararRespostaComentario(tx,lote,comentario.texto,comentario.criadoEm)))return;
  try{await emTransacao(tx=>enviarRespostaComentario(tx,lote,()=>enviarRespostaPrivada(acesso,lote.comentario_id,lote.mensagem)));}
  catch{
    // O HTTP pode ter ocorrido antes da falha do banco. A reserva expirada vira incerta.
    console.error('[instagram-comentarios] envio sem confirmação; confira a campanha no painel.');
  }
}
const estado=globalThis as unknown as {comentariosTimer?:ReturnType<typeof setInterval>;comentariosOcupado?:boolean;limpezaComentarios?:number};
export function iniciarComentariosInstagram():void{
  if(estado.comentariosTimer)return;
  estado.comentariosTimer=setInterval(async()=>{
    if(!process.env.DATABASE_URL || !process.env.INSTAGRAM_APP_ID || estado.comentariosOcupado)return;
    estado.comentariosOcupado=true;
    try{
      if(!estado.limpezaComentarios || Date.now()-estado.limpezaComentarios>3600_000){
        await emTransacao(tx=>tx.query('select crm.limpar_comentarios_instagram()'));estado.limpezaComentarios=Date.now();
      }
      await processarComentarioInstagram();
    }catch{console.error('[instagram-comentarios] fila indisponível.');}
    finally{estado.comentariosOcupado=false;}
  },2000);
  estado.comentariosTimer.unref();
}
