import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {bancoDeTeste} from './banco-de-teste';
import {emTransacao} from '@/lib/banco';
import {salvarConta} from '@/lib/instagram';
import * as leads from '@/lib/leads';
import {processarComentarioInstagram} from '@/lib/processamento-comentarios-instagram';
import {ErroComentarioMeta,enviarRespostaPrivada,assinarComentariosInstagram} from '@/lib/comentarios-instagram-meta';
import {POST as comandoCampanha} from '@/app/api/instagram/campanhas/route';
import {POST as comandoDirect} from '@/app/api/instagram/direct/route';
vi.mock('@/lib/banco',()=>({emTransacao:vi.fn()}));
vi.mock('@/lib/sessao',()=>({temSessao:async()=>true}));
const conta='17841400000001',contato='200',midia='300';
const comentario=(id='100',extra={})=>({id,conta,contato,midia,texto:'Eu quero!',...extra});
const dados={midiaId:midia,nome:'Diagnóstico Shift',palavras:'QUERO, EU QUERO',mensagem:'Aqui está o material: https://shiftsys.com.br/diagnostico.html. O que você quer melhorar?',contexto:'Diagnóstico dos processos e automação da empresa.',ativa:true};
beforeEach(()=>{
  vi.stubEnv('SESSAO_SEGREDO','segredo-de-teste-com-mais-de-32-caracteres');
  vi.stubEnv('INSTAGRAM_APP_ID','123');vi.stubEnv('INSTAGRAM_APP_SECRET','teste');
  vi.stubEnv('APP_URL','https://crm.exemplo.com');vi.stubEnv('INSTAGRAM_DIRECT_ATIVO','sim');
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.clearAllMocks();});
async function iniciar(){
  const b=await bancoDeTeste();vi.mocked(emTransacao).mockImplementation(f=>f(b.tx));
  await salvarConta(b.tx,{usuarioId:conta,nomeUsuario:'shift_systemss',token:'token-falso-de-teste',expiraEm:new Date(Date.now()+86400_000)});
  await b.tx.query('update crm.conta_instagram set comentarios_assinados=true,direct_assinado=true');
  await leads.salvarCampanhaInstagram(b.tx,conta,dados,'https://www.instagram.com/p/teste/');
  return {...b,campanha:(await leads.listarCampanhasInstagram(b.tx,conta)).campanhas[0]};
}
async function reservar(tx:Awaited<ReturnType<typeof bancoDeTeste>>['tx']){
  await leads.receberComentarioInstagram(tx,comentario());const lote=await leads.reservarComentarioInstagram(tx);expect(lote).not.toBeNull();return lote!;
}
async function preparar(tx:Awaited<ReturnType<typeof bancoDeTeste>>['tx']){
  const lote=await reservar(tx);expect(await leads.prepararRespostaComentario(tx,lote,'QUERO',new Date())).toBe(true);return lote;
}
function pedido(corpo:unknown){return new Request('https://crm.exemplo.com/api/instagram/campanhas',{method:'POST',headers:{origin:'https://crm.exemplo.com','Content-Type':'application/json'},body:JSON.stringify(corpo)});}
describe('campanhas do Instagram com banco restrito',()=>{
  it('filtra publicação/palavra/conta e deduplica comentário e pessoa por campanha',async()=>{
    const {tx}=await iniciar();
    expect(await leads.receberComentarioInstagram(tx,comentario('1',{midia:'999'}))).toBe(false);
    expect(await leads.receberComentarioInstagram(tx,comentario('2',{texto:'Não quero'}))).toBe(false);
    expect(await leads.receberComentarioInstagram(tx,comentario('3',{conta:'999'}))).toBe(false);
    expect(await leads.receberComentarioInstagram(tx,comentario('4',{contato:conta}))).toBe(false);
    expect(await leads.receberComentarioInstagram(tx,comentario())).toBe(true);
    expect(await leads.receberComentarioInstagram(tx,comentario())).toBe(false);
    expect(await leads.receberComentarioInstagram(tx,comentario('101'))).toBe(false);
    expect(await leads.receberComentarioInstagram(tx,comentario('102',{contato:'201'}))).toBe(true);
    expect((await leads.listarCampanhasInstagram(tx,conta)).respostas).toHaveLength(2);
  });
  it('envia uma DM e só abre o atendimento quando a pessoa responder, com contexto da campanha',async()=>{
    const {tx}=await iniciar();const lote=await preparar(tx);const enviar=vi.fn().mockResolvedValue({id:'mid-privada',contato});
    await leads.enviarRespostaComentario(tx,lote,enviar);
    expect(enviar).toHaveBeenCalledTimes(1);
    const c=(await leads.listarDirect(tx,conta))[0];
    expect(c.iniciada_em).toBeNull();expect(new Date(c.ultima_recebida).getTime()).toBe(0);
    expect(await leads.reservarDirect(tx)).toBeNull();
    await expect(leads.prepararManualDirect(tx,c.id,'Olá','00000000-0000-4000-8000-000000000001')).rejects.toThrow('Aguarde uma mensagem');
    expect((await leads.historicoDirect(tx,c.id))[0].texto).toBe(dados.mensagem);
    expect((await tx.query('select * from crm.uso_ia_instagram')).rows).toHaveLength(0);
    // Eco da DM enviada pelo próprio sistema não assume a conversa.
    await leads.receberDirect(tx,{id:'mid-privada',conta,contato,texto:dados.mensagem,quando:new Date(),eco:true,anexo:false},true);
    expect((await leads.listarDirect(tx,conta))[0].modo).toBe('agente');
    await leads.receberDirect(tx,{id:'resposta-cliente',conta,contato,texto:'Quero organizar a empresa',quando:new Date(),eco:false,anexo:false},true);
    await tx.query("update crm.conversa_instagram set proxima_execucao=now()-interval '1 second'");
    const turno=await leads.reservarDirect(tx);expect(turno).not.toBeNull();
    const contexto=await leads.contextoDirect(tx,turno!);
    expect(contexto?.contexto.resumo).toContain('Diagnóstico Shift');
    expect(contexto?.contexto.resumo).toContain('QUERO');
    expect(contexto?.contexto.tema).toContain('automação');
    expect(contexto?.contexto.ultimaResposta).toBe(dados.mensagem);
  });
  it('pausar ou editar cancela resposta que ainda não foi enviada',async()=>{
    const {tx,campanha}=await iniciar();const lote=await preparar(tx);
    await leads.alternarCampanhaInstagram(tx,conta,campanha.id,false);
    const enviar=vi.fn();await leads.enviarRespostaComentario(tx,lote,enviar);
    expect(enviar).not.toHaveBeenCalled();expect((await leads.listarCampanhasInstagram(tx,conta)).respostas[0].estado).toBe('cancelada');
    await leads.alternarCampanhaInstagram(tx,conta,campanha.id,true);
    expect(await leads.receberComentarioInstagram(tx,comentario())).toBe(false);
    expect(await leads.receberComentarioInstagram(tx,comentario('105'))).toBe(true);
  });
  it('resposta citando uma DM anterior retoma a oferta certa mesmo após outra campanha',async()=>{
    const {tx}=await iniciar();const primeira=await preparar(tx);
    await leads.enviarRespostaComentario(tx,primeira,async()=>({id:'dm-diagnostico',contato}));
    await leads.salvarCampanhaInstagram(tx,conta,{...dados,midiaId:'301',nome:'Site para clínica',contexto:'Criação de um site odontológico.'},'https://www.instagram.com/p/clinica/');
    await leads.receberComentarioInstagram(tx,comentario('106',{midia:'301'}));
    const segunda=(await leads.reservarComentarioInstagram(tx))!;
    await leads.prepararRespostaComentario(tx,segunda,'Quero',new Date());
    await leads.enviarRespostaComentario(tx,segunda,async()=>({id:'dm-site',contato}));
    expect((await leads.listarDirect(tx,conta))[0].memoria.campanha?.nome).toBe('Site para clínica');
    await leads.receberDirect(tx,{id:'resposta-citada',conta,contato,texto:'Sobre esse diagnóstico, como funciona?',quando:new Date(),eco:false,anexo:false,respondeA:'dm-diagnostico'},true);
    expect((await leads.listarDirect(tx,conta))[0].memoria.campanha?.nome).toBe('Diagnóstico Shift');
    const mensagens=await leads.historicoDirect(tx,(await leads.listarDirect(tx,conta))[0].id);
    expect(mensagens.filter(m=>m.autor==='agente')).toHaveLength(2);
  });
  it.each([['não quero',0],['quero',8],['quero',-1]])('confere o texto e a data reais antes do envio: %s / %s dias',async(texto,dias)=>{
    const {tx}=await iniciar();const lote=await reservar(tx);
    expect(await leads.prepararRespostaComentario(tx,lote,texto,new Date(Date.now()-dias*86400_000))).toBe(false);
    expect((await leads.listarCampanhasInstagram(tx,conta)).respostas[0].estado).toBe('cancelada');
  });
  it('falha confirmada permite repetir explicitamente; timeout permanece incerto sem repetição',async()=>{
    const {tx}=await iniciar();const lote=await preparar(tx);
    await leads.enviarRespostaComentario(tx,lote,async()=>{throw new ErroComentarioMeta(true);});
    expect((await leads.listarCampanhasInstagram(tx,conta)).respostas[0].estado).toBe('falhou');
    await leads.repetirRespostaComentario(tx,conta,lote.id);
    const novo=(await leads.reservarComentarioInstagram(tx))!;
    await leads.prepararRespostaComentario(tx,novo,'Quero',new Date());
    await leads.enviarRespostaComentario(tx,novo,async()=>{throw new Error('timeout');});
    expect((await leads.listarCampanhasInstagram(tx,conta)).respostas[0].estado).toBe('incerta');
    await expect(leads.repetirRespostaComentario(tx,conta,lote.id)).rejects.toThrow('Somente uma falha confirmada');
    expect(await leads.reservarComentarioInstagram(tx)).toBeNull();
  });
  it('queda depois de persistir intenção não repete a DM no reinício',async()=>{
    const {tx}=await iniciar();const lote=await reservar(tx);
    const enviar=vi.fn();await leads.enviarRespostaComentario(tx,lote,enviar);
    expect(enviar).not.toHaveBeenCalled();
    expect(await leads.prepararRespostaComentario(tx,lote,'Quero',new Date())).toBe(true);
    await tx.query("update crm.resposta_comentario_instagram set reserva_ate=now()-interval '1 second' where id=$1",[lote.id]);
    expect(await leads.reservarComentarioInstagram(tx)).toBeNull();
    expect((await leads.listarCampanhasInstagram(tx,conta)).respostas[0].estado).toBe('incerta');
  });
  it('retoma consulta interrompida antes do HTTP, mas limita falhas de consulta',async()=>{
    const {tx}=await iniciar();const lote=await reservar(tx);
    await tx.query("update crm.resposta_comentario_instagram set reserva_ate=now()-interval '1 second' where id=$1",[lote.id]);
    const novo=(await leads.reservarComentarioInstagram(tx))!;expect(novo.id).toBe(lote.id);
    await leads.falharConsultaComentario(tx,novo,true);
    expect((await leads.listarCampanhasInstagram(tx,conta)).respostas[0].estado).toBe('falhou');
  });
  it('respeita atendimento humano, desligamento global e destinatário divergente',async()=>{
    const {tx}=await iniciar();const lote=await preparar(tx);
    await leads.receberDirect(tx,{id:'cliente',conta,contato,texto:'Oi',quando:new Date(),eco:false,anexo:false},true);
    const c=(await leads.listarDirect(tx,conta))[0];await leads.mudarModoDirect(tx,c.id,'humano');
    const enviar=vi.fn();await leads.enviarRespostaComentario(tx,lote,enviar);expect(enviar).not.toHaveBeenCalled();
    expect((await leads.listarDirect(tx,conta))[0].modo).toBe('humano');
    await leads.receberComentarioInstagram(tx,comentario('103',{contato:'202'}));
    const outro=(await leads.reservarComentarioInstagram(tx))!;await leads.prepararRespostaComentario(tx,outro,'Quero',new Date());
    await leads.enviarRespostaComentario(tx,outro,async()=>({id:'m-outro',contato:'999'}));
    expect((await leads.listarCampanhasInstagram(tx,conta)).respostas.some(r=>r.estado==='incerta')).toBe(true);
    vi.stubEnv('INSTAGRAM_DIRECT_ATIVO','não');
    await leads.receberComentarioInstagram(tx,comentario('104',{contato:'203'}));
    const desligado=(await leads.reservarComentarioInstagram(tx))!;await leads.prepararRespostaComentario(tx,desligado,'Quero',new Date());
    await leads.enviarRespostaComentario(tx,desligado,enviar);expect(enviar).not.toHaveBeenCalled();
  });
  it('campanha de outra conta não pode ser alterada e conta substituída não recebe trabalhos antigos',async()=>{
    const {tx,campanha}=await iniciar();await leads.receberComentarioInstagram(tx,comentario());
    await expect(leads.alternarCampanhaInstagram(tx,'999',campanha.id,false)).rejects.toThrow('Campanha não encontrada');
    await salvarConta(tx,{usuarioId:'999',nomeUsuario:'outra',token:'token-falso',expiraEm:new Date(Date.now()+86400_000)});
    expect(await leads.reservarComentarioInstagram(tx)).toBeNull();
    expect((await leads.listarCampanhasInstagram(tx,'999')).campanhas).toHaveLength(0);
  });
  it('worker usa comment_id, sem chamar IA, e assinatura de comentários mantém messages',async()=>{
    const {tx}=await iniciar();await leads.receberComentarioInstagram(tx,comentario());
    const fetch=vi.fn().mockResolvedValueOnce(Response.json({id:'100',text:'QUERO',timestamp:new Date().toISOString()}))
      .mockResolvedValueOnce(Response.json({message_id:'privada-worker',recipient_id:contato}));
    vi.stubGlobal('fetch',fetch);await processarComentarioInstagram();await processarComentarioInstagram();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({recipient:{comment_id:'100'},message:{text:dados.mensagem}});
    expect((await leads.listarCampanhasInstagram(tx,conta)).respostas[0].estado).toBe('enviada');
    expect((await tx.query('select * from crm.uso_ia_instagram')).rows).toHaveLength(0);
    fetch.mockResolvedValueOnce(Response.json({success:true}));
    await comandoDirect(new Request('https://crm.exemplo.com/api/instagram/direct',{method:'POST',headers:{origin:'https://crm.exemplo.com'},body:'{"acao":"conectar"}'}));
    expect(JSON.parse(fetch.mock.calls[2][1].body).subscribed_fields).toBe('messages,comments');
  });
  it('a API só aceita uma publicação que pertence à conta conectada',async()=>{
    const {tx,campanha}=await iniciar();
    const fetch=vi.fn().mockImplementation(async()=>Response.json({data:[{id:midia,caption:'Shift',permalink:'https://www.instagram.com/p/teste/'}]}));
    vi.stubGlobal('fetch',fetch);
    const r=await comandoCampanha(pedido({acao:'salvar',campanha:{...dados,midiaId:'999',ativa:false}}));
    expect(r.status).toBe(400);expect((await leads.listarCampanhasInstagram(tx,conta)).campanhas).toHaveLength(1);
    await expect(leads.salvarCampanhaInstagram(tx,conta,{...dados,id:campanha.id,midiaId:'301'},'https://www.instagram.com/p/outra/')).rejects.toThrow('Crie outra campanha');
  });
  it('cliente Meta usa comment_id e preserva as assinaturas de comentários e Direct',async()=>{
    const fetch=vi.fn().mockResolvedValueOnce(Response.json({message_id:'m1',recipient_id:contato})).mockResolvedValueOnce(Response.json({success:true}));
    vi.stubGlobal('fetch',fetch);const acesso={token:'teste',usuarioId:conta};
    expect(await enviarRespostaPrivada(acesso,'100','Aqui está')).toEqual({id:'m1',contato});
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({recipient:{comment_id:'100'},message:{text:'Aqui está'}});
    await assinarComentariosInstagram(acesso);
    expect(JSON.parse(fetch.mock.calls[1][1].body).subscribed_fields).toBe('messages,comments');
  });
  it('não dá DELETE livre à aplicação; retenção remove comentários expirados',async()=>{
    const {tx,db}=await iniciar();await leads.receberComentarioInstagram(tx,comentario());
    await expect(tx.query('delete from crm.resposta_comentario_instagram')).rejects.toThrow(/permission denied/);
    await expect(tx.query("update crm.resposta_comentario_instagram set texto='outro' ")).rejects.toThrow(/permission denied/);
    // A limpeza expirada é exercitada como dono sem liberar alterações de histórico ao app.
    await db.exec("reset role; update crm.resposta_comentario_instagram set recebida_em=now()-interval '91 days'; set role shift_crm_app");
    await tx.query('select crm.limpar_comentarios_instagram()');
    expect((await leads.listarCampanhasInstagram(tx,conta)).respostas).toHaveLength(0);
  });
});
