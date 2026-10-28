import 'server-only';
import type {Consulta} from './consulta';
import type {Ator} from './crm';
import {ErroDeDominio} from './dominio';
import {acessoDaConta} from './instagram';
import {listarMidiasCampanha} from './comentarios-instagram-meta';
import {exigirCampanhaInstagram,exigirPublicacaoDaCampanha,salvarCampanhaInstagram,alternarCampanhaInstagram,
  type esquemaCampanhaInstagram} from './leads';
import type * as z from 'zod';

type Executor=<T>(trabalho:(tx:Consulta)=>Promise<T>)=>Promise<T>;
/** Orquestra HTTP fora da transação. Regras e gravação continuam em leads.ts. */
export async function acessoParaCampanhas(executar:Executor){
  const acesso=await executar(acessoDaConta);
  if(!acesso || acesso.expiraEm.getTime()<=Date.now())throw new ErroDeDominio('Reconecte o Instagram primeiro.');
  return acesso;
}
export async function listarMidiasParaCampanhas(executar:Executor){
  const acesso=await acessoParaCampanhas(executar);
  return listarMidiasCampanha(acesso);
}
export async function salvarCampanhaComPublicacao(executar:Executor,dados:z.infer<typeof esquemaCampanhaInstagram>,opcoes:{revisaoEsperada?:number;ator?:Ator}={}){
  const acesso=await acessoParaCampanhas(executar);
  const atual=dados.id?await executar(tx=>exigirCampanhaInstagram(tx,acesso.usuarioId,dados.id!)):null;
  const midia=atual&&atual.midia_id===dados.midiaId?{id:atual.midia_id,permalink:atual.link}
    :exigirPublicacaoDaCampanha(await listarMidiasCampanha(acesso),dados.midiaId);
  return executar(tx=>salvarCampanhaInstagram(tx,acesso.usuarioId,dados,midia.permalink,opcoes));
}
export async function editarCampanhaPorCampos(executar:Executor,id:string,revisao:number,campos:{nome?:string;palavras?:string[];mensagem?:string;contexto?:string},ator:Ator){
  const acesso=await acessoParaCampanhas(executar);
  const atual=await executar(tx=>exigirCampanhaInstagram(tx,acesso.usuarioId,id));
  return salvarCampanhaComPublicacao(executar,{
    id,midiaId:atual.midia_id,nome:campos.nome??atual.nome,palavras:(campos.palavras??atual.palavras).join(', '),
    mensagem:campos.mensagem??atual.mensagem,contexto:campos.contexto??atual.contexto,ativa:false,
  },{revisaoEsperada:revisao,ator});
}
export async function mudarStatusCampanhaPeloMcp(executar:Executor,id:string,revisao:number,ativa:boolean,ator:Ator){
  const acesso=await acessoParaCampanhas(executar);
  return executar(tx=>alternarCampanhaInstagram(tx,acesso.usuarioId,id,ativa,{revisaoEsperada:revisao,ator}));
}
