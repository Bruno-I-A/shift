import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({sessao:vi.fn(),transacao:vi.fn()}));
vi.mock('@/lib/sessao',()=>({temSessao:mocks.sessao}));
vi.mock('@/lib/banco',()=>({emTransacao:mocks.transacao}));
import {GET,POST} from '@/app/api/instagram/campanhas/route';
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('APP_URL','https://crm.exemplo.com');mocks.sessao.mockResolvedValue(true);});
afterEach(()=>vi.unstubAllEnvs());
function pedido(body:string,origin='https://crm.exemplo.com'){return new Request('https://crm.exemplo.com/api/instagram/campanhas',{
  method:'POST',headers:{origin},body,
});}
describe('acesso às campanhas do Instagram',()=>{
  it('exige sessão tanto para ler quanto para mudar campanhas',async()=>{
    mocks.sessao.mockResolvedValue(false);
    expect((await GET(new Request('https://crm.exemplo.com/api/instagram/campanhas'))).status).toBe(401);
    expect((await POST(pedido('{"acao":"conectar"}'))).status).toBe(401);
    expect(mocks.transacao).not.toHaveBeenCalled();
  });
  it('recusa origem externa, corpo excessivo e comandos inválidos antes do banco',async()=>{
    expect((await POST(pedido('{"acao":"conectar"}','https://outro.com'))).status).toBe(403);
    expect((await POST(pedido('a'.repeat(20001)))).status).toBe(413);
    expect((await POST(pedido('{"acao":"ativar","id":"invalido","ativa":true}'))).status).toBe(400);
    expect(mocks.transacao).not.toHaveBeenCalled();
  });
});
