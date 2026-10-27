import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { bancoDeTeste } from './banco-de-teste';
import { assinaturaDirectValida, lerEventosDirect, enviarTextoDirect, assinarDirect, type EventoDirect } from '@/lib/instagram-direct-meta';
import { receberDirect, reservarDirect, contextoDirect, concluirAnaliseDirect, historicoDirect, listarDirect,
  mudarModoDirect, prepararManualDirect, enviarPendentesDirect, liberarDirect, registrarUsoDirect } from '@/lib/leads';
import { salvarConta } from '@/lib/instagram';
import type { AnaliseAtendimento } from '@/lib/ia-atendimento';

const conta='17841400000001', contato='123456789012345';
const evento=(id:string,texto:string,extra:Partial<EventoDirect>={}):EventoDirect=>({id,conta,contato,texto,quando:new Date(),eco:false,anexo:false,...extra});
const analise:AnaliseAtendimento={resposta:'A Shift desenvolve sites para clínicas.\n\nVocê quer facilitar os agendamentos?',nome:'Bruno',empresa:'Clínica do Dente',segmento:'Odontologia',dor:'Poucos agendamentos',prazo:'',resumo:'Quer site para clínica.',passarParaHumano:false};
beforeEach(()=>{
  vi.unstubAllEnvs();vi.unstubAllGlobals();
  vi.stubEnv('SESSAO_SEGREDO','segredo-de-teste-instagram-com-mais-de-32-caracteres');
  vi.stubEnv('INSTAGRAM_DIRECT_ATIVO','sim');
});
async function iniciar() {
  const banco=await bancoDeTeste();
  await salvarConta(banco.tx,{usuarioId:conta,nomeUsuario:'shift_systemss',token:'token-de-teste-nao-real',expiraEm:new Date(Date.now()+86400_000)});
  await banco.tx.query('update crm.conta_instagram set direct_assinado=true');
  return banco;
}
async function autorizar(tx:Awaited<ReturnType<typeof bancoDeTeste>>['tx']) {
  await receberDirect(tx,evento('oi','Oi'),true);
  await receberDirect(tx,evento('sim','SIM'),true);
  const c=(await listarDirect(tx,conta))[0];
  await tx.query("update crm.mensagem_instagram set estado='enviada' where conversa_id=$1 and estado='pendente'",[c.id]);
  return c;
}
async function pronto(tx:Awaited<ReturnType<typeof bancoDeTeste>>['tx']) {
  await tx.query("update crm.conversa_instagram set proxima_execucao=now()-interval '1 second'");
  const lote=await reservarDirect(tx);
  expect(lote).not.toBeNull();return lote!;
}

describe('protocolo oficial do Direct',()=>{
  it('valida HMAC do corpo bruto e rejeita alterações ou assinatura ausente',()=>{
    const corpo='{"object":"instagram"}';
    const assinatura=`sha256=${createHmac('sha256','segredo').update(corpo).digest('hex')}`;
    expect(assinaturaDirectValida(assinatura,corpo,'segredo')).toBe(true);
    expect(assinaturaDirectValida(assinatura,corpo+' ','segredo')).toBe(false);
    expect(assinaturaDirectValida('',corpo,'segredo')).toBe(false);
  });
  it('lê DM, anexo e eco, mas rejeita outra conta, evento antigo e recibos',()=>{
    const m={sender:{id:contato},recipient:{id:conta},timestamp:Date.now(),message:{mid:'m1',text:'Oi'}};
    const corpo={object:'instagram',entry:[{id:conta,messaging:[m,{...m,message:{mid:'anexo',attachments:[{}]}},
      {...m,sender:{id:conta},recipient:{id:contato},message:{mid:'eco',text:'Resposta',is_echo:true}},
      {...m,timestamp:Date.now()-25*3600_000},{...m,recipient:{id:'999'}},{...m,message:undefined,read:{mid:'m1'}}]},
      {id:'outra',messaging:[m]}]};
    const eventos=lerEventosDirect(corpo,conta);
    expect(eventos).toHaveLength(3);expect(eventos[1].anexo).toBe(true);expect(eventos[2].eco).toBe(true);expect(eventos[2].contato).toBe(contato);
  });
  it('envia somente ao IGSID e assina a conta com o token cifrado recuperado',async()=>{
    vi.stubEnv('INSTAGRAM_APP_ID','123');vi.stubEnv('INSTAGRAM_APP_SECRET','segredo');vi.stubEnv('APP_URL','https://crm.exemplo.com');
    const fetch=vi.fn().mockResolvedValueOnce(Response.json({message_id:'mid'})).mockResolvedValueOnce(Response.json({success:true}));
    vi.stubGlobal('fetch',fetch);
    const acesso={usuarioId:conta,token:'teste'};
    expect(await enviarTextoDirect(acesso,contato,'Olá')).toBe('mid');
    await assinarDirect(acesso);
    expect(fetch.mock.calls[0][0]).toBe(`https://graph.instagram.com/v26.0/${conta}/messages`);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({recipient:{id:contato},message:{text:'Olá'}});
    expect(fetch.mock.calls[1][0]).toContain('/subscribed_apps');
  });
});

describe('Direct com banco e papel restrito',()=>{
  it('não armazena texto antes do aceite e deduplica inclusive avisos',async()=>{
    const {tx}=await iniciar();
    await receberDirect(tx,evento('oi','Informação privada antes do aceite'),true);
    await receberDirect(tx,evento('oi','Informação privada antes do aceite'),true);
    const c=(await listarDirect(tx,conta))[0];
    const mensagens=await historicoDirect(tx,c.id);
    expect(mensagens.some(m=>m.texto.includes('Informação privada'))).toBe(false);
    expect(mensagens.every(m=>m.autor==='agente')).toBe(true);
    expect(c.consentimento_em).toBeNull();
    const lote=await reservarDirect(tx);expect(lote).not.toBeNull();
    // Nova mensagem antes de o aviso sair não pode cancelar o aviso.
    await receberDirect(tx,evento('oi2','Tem alguém?'),true);
    const enviar=vi.fn().mockImplementation(async()=>`aviso-${Math.random()}`);
    await enviarPendentesDirect(tx,lote!,enviar);
    expect(enviar).toHaveBeenCalled();
  });
  it('agrupa mensagens, respeita a espera e mantém memória sem repetir no texto',async()=>{
    const {tx}=await iniciar();const c=await autorizar(tx);
    await receberDirect(tx,evento('m1','Sou Bruno, tenho uma clínica'),true);
    await receberDirect(tx,evento('m2','Preciso de um site'),true);
    expect(await reservarDirect(tx)).toBeNull();
    const lote=await pronto(tx);const turno=await contextoDirect(tx,lote);
    expect(turno?.pergunta).toBe('Sou Bruno, tenho uma clínica\nPreciso de um site');
    expect(turno?.contexto.canal).toBe('instagram');
    expect(await concluirAnaliseDirect(tx,lote,analise)).toBe(true);
    const enviar=vi.fn().mockImplementation(async()=>`resposta-${Math.random()}`);
    await enviarPendentesDirect(tx,lote,enviar);await liberarDirect(tx,lote);
    expect(enviar).toHaveBeenCalledTimes(2);
    const atual=(await listarDirect(tx,conta))[0];expect(atual.memoria.nome).toBe('Bruno');expect(atual.memoria.empresa).toBe('Clínica do Dente');
    await receberDirect(tx,evento('m3','Sim, agendamentos'),true);
    const proximo=await pronto(tx);const contexto=await contextoDirect(tx,proximo);
    expect(contexto?.contexto.empresa).toBe('Clínica do Dente');
    expect(contexto?.contexto.historico?.some(m=>m.texto.includes('Você quer facilitar'))).toBe(true);
    expect(await historicoDirect(tx,c.id)).not.toHaveLength(0);
  });
  it('descarta análise se outra mensagem chegou e não envia após humano assumir',async()=>{
    const {tx}=await iniciar();const c=await autorizar(tx);
    await receberDirect(tx,evento('m1','Quero site'),true);
    const lote=await pronto(tx);
    await receberDirect(tx,evento('m2','Na verdade quero sistema'),true);
    expect(await concluirAnaliseDirect(tx,lote,analise)).toBe(false);
    await liberarDirect(tx,lote);const novo=await pronto(tx);
    expect(await concluirAnaliseDirect(tx,novo,analise)).toBe(true);
    await mudarModoDirect(tx,c.id,'humano');
    const enviar=vi.fn();await enviarPendentesDirect(tx,novo,enviar);expect(enviar).not.toHaveBeenCalled();
    await mudarModoDirect(tx,c.id,'agente');expect(await reservarDirect(tx)).toBeNull();
  });
  it('humano pelo aplicativo pausa IA; eco do próprio envio não pausa',async()=>{
    const {tx}=await iniciar();const c=await autorizar(tx);
    await receberDirect(tx,evento('m1','Quero site'),true);const lote=await pronto(tx);
    await concluirAnaliseDirect(tx,lote,{...analise,resposta:'Resposta curta'});
    await enviarPendentesDirect(tx,lote,async()=>'nosso-mid');await liberarDirect(tx,lote);
    await receberDirect(tx,evento('nosso-mid','Resposta curta',{eco:true}),true);
    expect((await listarDirect(tx,conta))[0].modo).toBe('agente');
    await receberDirect(tx,evento('app-mid','Oi, sou o Bruno da equipe',{eco:true}),true);
    expect((await listarDirect(tx,conta))[0].modo).toBe('humano');
    expect((await historicoDirect(tx,c.id)).some(m=>m.autor==='humano')).toBe(true);
  });
  it('timeout não repete envio; pausa e conserva resultado incerto',async()=>{
    const {tx}=await iniciar();const c=await autorizar(tx);
    await prepararManualDirect(tx,c.id,'Resposta da equipe','00000000-0000-4000-8000-000000000001');
    const lote=await reservarDirect(tx);const enviar=vi.fn().mockRejectedValue(new Error('timeout'));
    await enviarPendentesDirect(tx,lote!,enviar);
    expect(enviar).toHaveBeenCalledTimes(1);expect((await listarDirect(tx,conta))[0].modo).toBe('humano');
    expect((await historicoDirect(tx,c.id)).at(-1)?.estado).toBe('incerto');
    expect(await reservarDirect(tx)).toBeNull();
  });
  it('desligar IA conserva recebidas e permite envio humano; anexo não chama IA',async()=>{
    const {tx}=await iniciar();const c=await autorizar(tx);
    vi.stubEnv('INSTAGRAM_DIRECT_ATIVO','nao');
    await receberDirect(tx,evento('m1','Olá de novo'),false);
    await tx.query("update crm.conversa_instagram set proxima_execucao=now()-interval '1 second'");
    expect(await reservarDirect(tx,false)).toBeNull();
    expect((await historicoDirect(tx,c.id)).some(m=>m.texto==='Olá de novo')).toBe(true);
    await prepararManualDirect(tx,c.id,'Resposta humana','00000000-0000-4000-8000-000000000002');
    const lote=await reservarDirect(tx,false);const enviar=vi.fn().mockResolvedValue('humano-desligado');
    await enviarPendentesDirect(tx,lote!,enviar);await liberarDirect(tx,lote!);
    expect(enviar).toHaveBeenCalledTimes(1);
    await mudarModoDirect(tx,c.id,'agente');
    await receberDirect(tx,evento('anexo','[Anexo recebido no Instagram]',{anexo:true}),true);
    expect((await listarDirect(tx,conta))[0].modo).toBe('humano');
    expect(await reservarDirect(tx)).toBeNull();
  });
  it('envio manual é idempotente e continua válido se chegar outra mensagem',async()=>{
    const {tx}=await iniciar();const c=await autorizar(tx);const envio='00000000-0000-4000-8000-000000000001';
    await prepararManualDirect(tx,c.id,'Estou conferindo',envio);await prepararManualDirect(tx,c.id,'Estou conferindo',envio);
    await receberDirect(tx,evento('m2','Obrigado'),true);
    const lote=await reservarDirect(tx);const enviar=vi.fn().mockResolvedValue('manual-mid');
    await enviarPendentesDirect(tx,lote!,enviar);expect(enviar).toHaveBeenCalledTimes(1);
  });
  it('bloqueia envios após 24h e não atende conta substituída/desconectada',async()=>{
    const {tx}=await iniciar();const c=await autorizar(tx);
    await tx.query("update crm.conversa_instagram set ultima_recebida=now()-interval '25 hours' where id=$1",[c.id]);
    await expect(prepararManualDirect(tx,c.id,'Oi','00000000-0000-4000-8000-000000000001')).rejects.toThrow('24 horas');
    await salvarConta(tx,{usuarioId:'17841400000002',nomeUsuario:'outra',token:'token-de-teste-nao-real',expiraEm:new Date(Date.now()+86400_000)});
    expect(await reservarDirect(tx)).toBeNull();
    await receberDirect(tx,evento('antiga','Não pode entrar'),true);
    expect((await historicoDirect(tx,c.id)).some(m=>m.texto==='Não pode entrar')).toBe(false);
  });
  it('reinício recupera análise mas jamais repete intenções de envio incertas',async()=>{
    const {tx}=await iniciar();const c=await autorizar(tx);
    await receberDirect(tx,evento('m1','Quero site'),true);const lote=await pronto(tx);
    await concluirAnaliseDirect(tx,lote,analise);
    await tx.query("update crm.conversa_instagram set reserva_ate=now()-interval '1 second' where id=$1",[c.id]);
    expect(await reservarDirect(tx)).toBeNull();expect((await listarDirect(tx,conta))[0].modo).toBe('humano');
    expect((await historicoDirect(tx,c.id)).filter(m=>m.estado==='incerto')).toHaveLength(2);
  });
  it('falha ao confirmar transação depois do HTTP conserva intenção como incerta',async()=>{
    const {tx}=await iniciar();const c=await autorizar(tx);
    await prepararManualDirect(tx,c.id,'Resposta humana','00000000-0000-4000-8000-000000000003');
    const lote=await reservarDirect(tx);
    await liberarDirect(tx,lote!,'Não foi possível confirmar o envio.');
    expect((await historicoDirect(tx,c.id)).at(-1)?.estado).toBe('incerto');
    expect(await reservarDirect(tx)).toBeNull();
  });
  it('retém histórico imutável e separa custos de Instagram do WhatsApp',async()=>{
    const {tx}=await iniciar();const c=await autorizar(tx);
    await registrarUsoDirect(tx,c.id,{modelo:'claude-haiku-5-5',inputTokens:100,outputTokens:20,cacheReadTokens:30,cacheCreationTokens:0});
    expect((await tx.query('select * from crm.uso_ia_instagram')).rows).toHaveLength(1);
    expect((await tx.query('select * from crm.uso_ia_whatsapp')).rows).toHaveLength(0);
    await expect(tx.query("update crm.mensagem_instagram set texto='alterado'")).rejects.toThrow(/permission denied/);
    await expect(tx.query('delete from crm.mensagem_instagram')).rejects.toThrow(/permission denied/);
    await tx.query('select crm.limpar_direct_instagram()');
    expect(await listarDirect(tx,conta)).toHaveLength(1);
  });
});
