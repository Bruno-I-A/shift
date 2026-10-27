import 'server-only';
import { emTransacao } from './banco';
import { acessoDaConta } from './instagram';
import { enviarTextoDirect } from './instagram-direct-meta';
import { analisarAtendimento } from './ia-atendimento';
import { reservarDirect, contextoDirect, concluirAnaliseDirect, liberarDirect, enviarPendentesDirect, registrarUsoDirect } from './leads';

/** A fila é do Postgres. O temporizador só procura trabalho, inclusive após reiniciar. */
export async function processarDirect(): Promise<void> {
  const lote=await emTransacao(tx=>reservarDirect(tx,process.env.INSTAGRAM_DIRECT_ATIVO==='sim'));
  if (!lote) return;
  try {
    const acesso=await emTransacao(acessoDaConta);
    if (!acesso || acesso.usuarioId!==lote.conta_id || acesso.expiraEm.getTime()<=Date.now()) {
      await emTransacao(tx=>liberarDirect(tx,lote));
      return;
    }
    const { rows }=await emTransacao(tx=>tx.query(`select 1 from crm.mensagem_instagram where conversa_id=$1 and estado='pendente'`,[lote.id]));
    if (!rows.length && process.env.INSTAGRAM_DIRECT_ATIVO==='sim' && lote.modo==='agente') {
      const turno=await emTransacao(tx=>contextoDirect(tx,lote));
      if (turno) {
        turno.contexto.onUso=u=>emTransacao(tx=>registrarUsoDirect(tx,lote.id,u));
        const analise=await analisarAtendimento(turno.pergunta,turno.contexto);
        await emTransacao(tx=>concluirAnaliseDirect(tx,lote,analise));
      }
    }
    await emTransacao(tx=>enviarPendentesDirect(tx,lote,(contato,texto)=>enviarTextoDirect(acesso,contato,texto)));
    await emTransacao(tx=>liberarDirect(tx,lote));
  } catch {
    // Não registrar IDs, tokens, conteúdo ou detalhes livres retornados pela Meta/IA.
    console.error('[instagram-direct] atendimento indisponível; confira a conversa no painel.');
    await emTransacao(tx=>liberarDirect(tx,lote,'Atendimento automático indisponível. Confira modelo, permissões e conexão.'));
  }
}

const estado=globalThis as unknown as { directTimer?:ReturnType<typeof setInterval>; directOcupado?:boolean; limpezaDirect?:number };
export function iniciarDirect(): void {
  if (estado.directTimer) return;
  estado.directTimer=setInterval(async()=>{
    if (!process.env.DATABASE_URL || !process.env.INSTAGRAM_APP_ID || estado.directOcupado) return;
    estado.directOcupado=true;
    try {
      if (!estado.limpezaDirect || Date.now()-estado.limpezaDirect>3600_000) {
        await emTransacao(tx=>tx.query('select crm.limpar_direct_instagram()'));
        estado.limpezaDirect=Date.now();
      }
      await processarDirect();
    } catch { console.error('[instagram-direct] fila indisponível.'); }
    finally { estado.directOcupado=false; }
  },2000);
  estado.directTimer.unref();
}
