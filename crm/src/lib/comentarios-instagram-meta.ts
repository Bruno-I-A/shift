import 'server-only';
import * as z from 'zod';
import {configuracaoInstagram,type Acesso} from './instagram-meta';

export class ErroComentarioMeta extends Error {
  constructor(readonly rejeitado:boolean){super('A Meta não confirmou a resposta privada.');}
}
async function chamar(acesso:Acesso,caminho:string,corpo?:unknown):Promise<unknown>{
  const {versao}=configuracaoInstagram();
  const r=await fetch(`https://graph.instagram.com/${versao}/${caminho}`,{
    method:corpo?'POST':'GET',headers:{Authorization:`Bearer ${acesso.token}`,'Content-Type':'application/json'},
    ...(corpo?{body:JSON.stringify(corpo)}:{}),signal:AbortSignal.timeout(10_000),
  });
  if(!r.ok)throw new ErroComentarioMeta(r.status>=400&&r.status<500);
  return r.json();
}
const id=z.string().regex(/^\d{1,30}$/);
export interface MidiaDaCampanha {id:string;caption:string;permalink:string}
export async function listarMidiasCampanha(acesso:Acesso):Promise<MidiaDaCampanha[]>{
  const dados=z.object({data:z.array(z.object({id,caption:z.string().optional().default(''),
    permalink:z.string().regex(/^https:\/\/(www\.)?instagram\.com\//)}))}).parse(await chamar(acesso,
      `${acesso.usuarioId}/media?fields=id,caption,permalink&limit=50`));
  return dados.data;
}
export async function assinarComentariosInstagram(acesso:Acesso):Promise<void>{
  z.object({success:z.literal(true)}).parse(await chamar(acesso,`${acesso.usuarioId}/subscribed_apps`,{subscribed_fields:'messages,comments'}));
}
export async function consultarComentario(acesso:Acesso,comentarioId:string):Promise<{texto:string;criadoEm:Date}>{
  const dados=z.object({id,text:z.string().max(2200),timestamp:z.string()}).parse(await chamar(acesso,
    `${id.parse(comentarioId)}?fields=id,text,timestamp`));
  const criadoEm=new Date(dados.timestamp);
  if(!Number.isFinite(criadoEm.getTime()))throw new Error('Data do comentário inválida.');
  return {texto:dados.text,criadoEm};
}
export async function enviarRespostaPrivada(acesso:Acesso,comentarioId:string,texto:string):Promise<{id:string;contato:string}>{
  const r=z.object({message_id:z.string().min(1).max(2000),recipient_id:id}).parse(await chamar(acesso,`${acesso.usuarioId}/messages`,{
    recipient:{comment_id:id.parse(comentarioId)},message:{text:z.string().min(1).max(1000).parse(texto)},
  }));
  return {id:r.message_id,contato:r.recipient_id};
}
