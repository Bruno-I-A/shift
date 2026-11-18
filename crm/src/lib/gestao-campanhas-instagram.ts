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
/** `conta`: ID ou nome de usuário. Sem ela, a conta principal (a da Shift). */
export async function acessoParaCampanhas(executar:Executor,conta?:string){
  const acesso=await executar(tx=>acessoDaConta(tx,conta));
  if(!acesso || acesso.expiraEm.getTime()<=Date.now())throw new ErroDeDominio('Reconecte o Instagram primeiro.');
  return acesso;
}
export async function listarMidiasParaCampanhas(executar:Executor,conta?:string){
  const acesso=await acessoParaCampanhas(executar,conta);
  return listarMidiasCampanha(acesso);
}
export async function salvarCampanhaComPublicacao(executar:Executor,dados:z.input<typeof esquemaCampanhaInstagram>,opcoes:{revisaoEsperada?:number;ator?:Ator;conta?:string}={}){
  const acesso=await acessoParaCampanhas(executar,opcoes.conta);
  const atual=dados.id?await executar(tx=>exigirCampanhaInstagram(tx,acesso.usuarioId,dados.id!)):null;
  const midia=atual&&atual.midia_id===dados.midiaId?{id:atual.midia_id,permalink:atual.link}
    :exigirPublicacaoDaCampanha(await listarMidiasCampanha(acesso),dados.midiaId);
  return executar(tx=>salvarCampanhaInstagram(tx,acesso.usuarioId,dados,midia.permalink,opcoes));
}
export async function editarCampanhaPorCampos(executar:Executor,id:string,revisao:number,campos:{nome?:string;palavras?:string[];mensagem?:string;contexto?:string;respostasPublicas?:string[]},ator:Ator,conta?:string){
  const acesso=await acessoParaCampanhas(executar,conta);
  const atual=await executar(tx=>exigirCampanhaInstagram(tx,acesso.usuarioId,id));
  return salvarCampanhaComPublicacao(executar,{
    id,midiaId:atual.midia_id,nome:campos.nome??atual.nome,palavras:(campos.palavras??atual.palavras).join(', '),
    mensagem:campos.mensagem??atual.mensagem,contexto:campos.contexto??atual.contexto,ativa:false,
    respostasPublicas:(campos.respostasPublicas??atual.respostas_publicas??[]).join('\n'),
  },{revisaoEsperada:revisao,ator,conta});
}
export async function mudarStatusCampanhaPeloMcp(executar:Executor,id:string,revisao:number,ativa:boolean,ator:Ator,conta?:string){
  const acesso=await acessoParaCampanhas(executar,conta);
  return executar(tx=>alternarCampanhaInstagram(tx,acesso.usuarioId,id,ativa,{revisaoEsperada:revisao,ator}));
}
