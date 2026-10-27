import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Consulta } from '@/lib/consulta';
import { bancoDeTeste } from './banco-de-teste';
const conexao=vi.hoisted(()=>({tx:null as Consulta|null}));
vi.mock('@/lib/banco',()=>({emTransacao:async(f:(tx:Consulta)=>unknown)=>f(conexao.tx!)}));
import { POST } from '@/app/api/whatsapp/webhook/route';
import { buscarAtendimentoWhatsApp, listarLeads, mudarModoAtendimentoWhatsApp, reservarLoteWhatsApp } from '@/lib/leads';

beforeEach(()=>{
  vi.stubEnv('WHATSAPP_META_APP_SECRET','segredo-de-teste');
  vi.stubEnv('WHATSAPP_META_PHONE_NUMBER_ID','123456');
  vi.stubEnv('WHATSAPP_ATIVO','sim');
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
function pedido(id:string,texto:string,segredo='segredo-de-teste') {
  const corpo=JSON.stringify({object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{
    metadata:{phone_number_id:'123456'},messages:[{from:'5554999991234',id,timestamp:Math.floor(Date.now()/1000),type:'text',text:{body:texto}}],
  }}]}]});
  return new Request('https://crm.exemplo.com/api/whatsapp/webhook',{method:'POST',body:corpo,headers:{
    'x-hub-signature-256':`sha256=${createHmac('sha256',segredo).update(corpo).digest('hex')}`,
  }});
}
describe('primeiro contato no WhatsApp',()=>{
  it('guarda a pergunta original e agrupa o turno desde o primeiro webhook sem SIM nem envio direto',async()=>{
    const {tx}=await bancoDeTeste();conexao.tx=tx;
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    expect((await POST(pedido('primeira','Vocês fazem sites?'))).status).toBe(200);
    expect((await POST(pedido('primeira','Vocês fazem sites?'))).status).toBe(200);
    expect((await POST(pedido('segunda','Tenho uma clínica'))).status).toBe(200);
    const leads=await listarLeads(tx);expect(leads).toHaveLength(1);expect(leads[0].consentimentoEm).toBeNull();
    const {rows}=await tx.query<{autor:string;texto:string}>('select autor,texto from crm.conversa_whatsapp order by criado_em,id');
    expect(rows).toHaveLength(2);expect(rows.every(m=>m.autor==='cliente')).toBe(true);
    expect(rows.map(m=>m.texto)).toContain('Vocês fazem sites?');
    expect(fetch).not.toHaveBeenCalled();
    expect(await reservarLoteWhatsApp(tx)).toBeNull();
    await tx.query("update crm.fila_whatsapp set disponivel_em=now()-interval '1 second'");
    const lote=await reservarLoteWhatsApp(tx);
    expect(lote?.texto).toContain('Vocês fazem sites?');expect(lote?.texto).toContain('Tenho uma clínica');
    expect(lote?.ids).toHaveLength(2);
    const {rows:eventos}=await tx.query<{tipo:string}>('select tipo from crm.evento where lead_id=$1',[leads[0].id]);
    expect(eventos.some(e=>e.tipo==='whatsapp_iniciado')).toBe(true);
    expect(eventos.some(e=>e.tipo==='whatsapp_autorizado')).toBe(false);
  });
  it('mantém o modo humano e continua registrando as próximas mensagens',async()=>{
    const {tx}=await bancoDeTeste();conexao.tx=tx;
    await POST(pedido('oi','Oi'));
    const a=await buscarAtendimentoWhatsApp(tx,'5554999991234');
    await mudarModoAtendimentoWhatsApp(tx,a!.leadId,'humano');
    await POST(pedido('nova','Pode me responder por aqui?'));
    expect((await buscarAtendimentoWhatsApp(tx,'5554999991234'))?.modo).toBe('humano');
    expect(await reservarLoteWhatsApp(tx)).toBeNull();
    expect((await tx.query('select 1 from crm.conversa_whatsapp where id=$1',['e:nova'])).rows).toHaveLength(1);
  });
  it('continua rejeitando webhook com assinatura inválida antes de acessar o banco',async()=>{
    conexao.tx=null;
    expect((await POST(pedido('invalida','Oi','segredo-errado'))).status).toBe(401);
  });
});
