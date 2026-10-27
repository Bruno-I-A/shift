import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
const mocks=vi.hoisted(()=>({receber:vi.fn(),comentario:vi.fn(),conta:vi.fn(),tx:vi.fn(),sessao:vi.fn()}));
vi.mock('@/lib/banco',()=>({emTransacao:async(f:(tx:unknown)=>unknown)=>f(mocks.tx)}));
vi.mock('@/lib/instagram',()=>({lerConta:mocks.conta,acessoDaConta:vi.fn()}));
vi.mock('@/lib/leads',()=>({receberDirect:mocks.receber,receberComentarioInstagram:mocks.comentario,listarDirect:vi.fn(),historicoDirect:vi.fn(),mudarModoDirect:vi.fn(),prepararManualDirect:vi.fn()}));
vi.mock('@/lib/sessao',()=>({temSessao:mocks.sessao}));
import { GET, POST } from '@/app/api/instagram/webhook/route';
import { GET as GETCaixa, POST as POSTCaixa } from '@/app/api/instagram/direct/route';
beforeEach(()=>{
  vi.resetAllMocks();vi.stubEnv('INSTAGRAM_APP_SECRET','segredo');
  vi.stubEnv('INSTAGRAM_WEBHOOK_APP_SECRET','');vi.stubEnv('INSTAGRAM_WEBHOOK_VERIFY_TOKEN','verificacao');
  vi.stubEnv('INSTAGRAM_DIRECT_ATIVO','sim');
  mocks.conta.mockResolvedValue({usuarioId:'17841400000001'});
  mocks.sessao.mockResolvedValue(true);
});
afterEach(()=>vi.unstubAllEnvs());
function pedido(corpo:string,segredo='segredo') {
  return new Request('https://crm.exemplo.com/api/instagram/webhook',{method:'POST',headers:{
    'x-hub-signature-256':`sha256=${createHmac('sha256',segredo).update(corpo).digest('hex')}`,
  },body:corpo});
}
describe('webhook do Direct',()=>{
  it('encaminha comentários autenticados à fila e pede reentrega se não conseguir persistir',async()=>{
    const corpo=JSON.stringify({object:'instagram',entry:[{id:'17841400000001',changes:[{field:'comments',value:{
      id:'100',from:{id:'200'},media:{id:'300'},text:'QUERO',
    }}]}]});
    mocks.comentario.mockResolvedValueOnce(true);
    const resposta=await POST(pedido(corpo));
    expect(resposta.status).toBe(200);expect(await resposta.json()).toMatchObject({comentarios:1});
    expect(mocks.comentario).toHaveBeenCalledOnce();expect(mocks.receber).not.toHaveBeenCalled();
    mocks.comentario.mockRejectedValueOnce(new Error('banco indisponível'));
    expect((await POST(pedido(corpo))).status).toBe(503);
  });
  it('caixa exige sessão e recusa comandos vindos de outro site',async()=>{
    vi.stubEnv('APP_URL','https://crm.exemplo.com');
    mocks.sessao.mockResolvedValue(false);
    expect((await GETCaixa(new Request('https://crm.exemplo.com/api/instagram/direct'))).status).toBe(401);
    expect((await POSTCaixa(pedido('{}'))).status).toBe(401);
    mocks.sessao.mockResolvedValue(true);
    expect((await POSTCaixa(new Request('https://crm.exemplo.com/api/instagram/direct',{method:'POST',headers:{origin:'https://outro.com'},body:'{}'}))).status).toBe(403);
    expect(mocks.conta).not.toHaveBeenCalled();
  });
  it('caixa valida identificadores e comandos antes de consultar o banco',async()=>{
    vi.stubEnv('APP_URL','https://crm.exemplo.com');
    expect((await GETCaixa(new Request('https://crm.exemplo.com/api/instagram/direct?conversa=invalido'))).status).toBe(400);
    expect((await POSTCaixa(new Request('https://crm.exemplo.com/api/instagram/direct',{method:'POST',headers:{origin:'https://crm.exemplo.com'},body:'{"acao":"enviar","id":"invalido"}'}))).status).toBe(400);
    expect(mocks.conta).not.toHaveBeenCalled();
  });
  it('só devolve desafio com o token de verificação correto',async()=>{
    const url='https://crm.exemplo.com/api/instagram/webhook?hub.mode=subscribe&hub.challenge=123&hub.verify_token=';
    expect((await GET(new Request(url+'errado'))).status).toBe(403);
    expect(await (await GET(new Request(url+'verificacao'))).text()).toBe('123');
  });
  it('recusa assinatura inválida, JSON inválido e corpo excessivo antes de abrir banco',async()=>{
    expect((await POST(pedido('{}','errado'))).status).toBe(401);
    expect((await POST(pedido('{'))).status).toBe(400);
    expect((await POST(pedido('x'.repeat(64001)))).status).toBe(413);
    expect(mocks.conta).not.toHaveBeenCalled();
  });
  it('aceita chave de assinatura própria do webhook sem confundir com OAuth',async()=>{
    vi.stubEnv('INSTAGRAM_WEBHOOK_APP_SECRET','assinatura-app-meta');
    expect((await POST(pedido('{}','segredo'))).status).toBe(401);
    expect((await POST(pedido('{}','assinatura-app-meta'))).status).toBe(200);
  });
  it('confirma só depois de persistir e permite reentrega quando banco falha',async()=>{
    const corpo=JSON.stringify({object:'instagram',entry:[{id:'17841400000001',messaging:[{
      sender:{id:'123'},recipient:{id:'17841400000001'},timestamp:Date.now(),message:{mid:'m1',text:'Oi'},
    }]}]});
    expect((await POST(pedido(corpo))).status).toBe(200);
    expect(mocks.receber).toHaveBeenCalledTimes(1);
    mocks.receber.mockRejectedValueOnce(new Error('banco indisponível'));
    expect((await POST(pedido(corpo))).status).toBe(503);
  });
});
