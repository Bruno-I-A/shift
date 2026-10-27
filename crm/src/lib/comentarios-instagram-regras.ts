import * as z from 'zod';

export function normalizarPalavra(texto:string):string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
}
export function palavrasDaCampanha(texto:string):string[] {
  const palavras=[...new Set(texto.split(/[,;\n]/).map(normalizarPalavra).filter(Boolean))];
  return z.array(z.string().min(1).max(60)).min(1).max(10).parse(palavras);
}
/** Palavra inteira/frase, sem disparar por substring ou por uma negação direta. */
export function correspondeComentario(texto:string,palavras:string[]):boolean {
  const termos=normalizarPalavra(texto).split(' ');
  return palavras.some(p=>{
    const alvo=normalizarPalavra(p).split(' ');
    return termos.some((_,i)=>alvo.every((t,j)=>termos[i+j]===t) &&
      !['nao','nem'].includes(termos[i-1]||'') && !(termos[i-1]==='eu'&&termos[i-2]==='nao'));
  });
}
export interface ComentarioInstagram {id:string;conta:string;contato:string;midia:string;texto:string}
const id=z.string().regex(/^\d{1,30}$/);
export function lerComentariosInstagram(corpo:unknown,conta:string):ComentarioInstagram[] {
  const lido=z.object({object:z.literal('instagram'),entry:z.array(z.object({id:z.string(),changes:z.array(z.object({
    field:z.string(),value:z.unknown(),
  })).optional()}))}).safeParse(corpo);
  if(!lido.success)return [];
  return lido.data.entry.filter(e=>e.id===conta).flatMap(e=>(e.changes||[]).flatMap(c=>{
    if(c.field!=='comments')return [];
    const v=z.object({id,from:z.object({id}),media:z.object({id}),text:z.string().trim().min(1).max(2200)}).safeParse(c.value);
    if(!v.success || v.data.from.id===conta)return [];
    return [{id:v.data.id,conta,contato:v.data.from.id,midia:v.data.media.id,texto:v.data.text}];
  }));
}
