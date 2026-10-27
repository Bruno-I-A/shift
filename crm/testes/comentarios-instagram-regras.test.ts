import {describe,expect,it} from 'vitest';
import {normalizarPalavra,palavrasDaCampanha,correspondeComentario,lerComentariosInstagram} from '@/lib/comentarios-instagram-regras';
import {lerEventosDirect} from '@/lib/instagram-direct-meta';
describe('palavra-chave de comentário',()=>{
  it.each(['QUERO','Eu quero!','Quero 🔥','Oi, quero saber mais','Eu QUÉRO'])('aceita %s',texto=>expect(correspondeComentario(texto,['quero'])).toBe(true));
  it.each(['Não quero','eu não quero','nem quero','querosene','quer','não, obrigado'])('não dispara em %s',texto=>expect(correspondeComentario(texto,['quero'])).toBe(false));
  it('aceita frase inteira e normaliza variantes sem duplicar palavras',()=>{
    expect(correspondeComentario('Eu quero o material',['eu quero'])).toBe(true);
    expect(correspondeComentario('Eu não quero o material',['eu quero'])).toBe(false);
    expect(palavrasDaCampanha('QUERO, quero; LINK\nEu quero')).toEqual(['quero','link','eu quero']);
    expect(normalizarPalavra('Olá, É ISSO!')).toBe('ola e isso');
    expect(()=>palavrasDaCampanha('🔥')).toThrow();
  });
  it('lê só comentários da conta conectada e ignora o próprio perfil',()=>{
    const valor={id:'100',from:{id:'200'},media:{id:'300'},text:'Quero'};
    const corpo={object:'instagram',entry:[{id:'400',changes:[{field:'comments',value:valor},
      {field:'comments',value:{...valor,id:'101',from:{id:'400'}}},{field:'messages',value:valor},
      {field:'comments',value:{id:'102',text:'Excluído'}}]},
      {id:'999',changes:[{field:'comments',value:valor}]}]};
    expect(lerComentariosInstagram(corpo,'400')).toEqual([{id:'100',conta:'400',contato:'200',midia:'300',texto:'Quero'}]);
  });
  it('preserva referência de uma DM citada e não descarta respostas a Stories',()=>{
    const mensagem={sender:{id:'200'},recipient:{id:'400'},timestamp:Date.now(),message:{mid:'m1',text:'Quero saber mais',reply_to:{mid:'dm-oferta'}}};
    const corpo={object:'instagram',entry:[{id:'400',messaging:[mensagem]}]};
    expect(lerEventosDirect(corpo,'400')[0].respondeA).toBe('dm-oferta');
    expect(lerEventosDirect({...corpo,entry:[{id:'400',messaging:[{...mensagem,message:{mid:'m2',text:'Sobre isso',reply_to:{story:{id:'500'}}}}]}]},'400')).toHaveLength(1);
  });
});
