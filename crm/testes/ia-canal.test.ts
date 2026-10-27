import { afterEach, expect, it, vi } from 'vitest';
import { analisarAtendimento, type ContextoAtendimento } from '@/lib/ia-atendimento';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('reutiliza IA e RAG no Instagram sem mudar o prompt padrão do WhatsApp',async()=>{
  vi.stubEnv('ANTHROPIC_API_KEY','teste');
  const fetch=vi.fn().mockImplementation(async()=>Response.json({stop_reason:'tool_use',content:[{
    type:'tool_use',name:'registrar_atendimento',input:{resposta:'A Shift desenvolve sites. Qual é o seu negócio?'},
  }]}));
  vi.stubGlobal('fetch',fetch);
  const contexto:ContextoAtendimento={nome:'Bruno',empresa:'Clínica do Dente',segmento:null,dor:null,prazo:null,resumo:'Quer um site.',ultimaResposta:'',canal:'instagram'};
  await analisarAtendimento('Vocês fazem sites?',contexto);
  const direct=JSON.parse(fetch.mock.calls[0][1].body);
  expect(direct.system[0].text).toContain('Você atende pela Shift Systems no Instagram Direct.');
  expect(direct.messages[0].content).toContain('Clínica do Dente');
  await analisarAtendimento('Vocês fazem sites?',{...contexto,canal:undefined});
  expect(JSON.parse(fetch.mock.calls[1][1].body).system[0].text).toContain('Você atende pela Shift Systems no WhatsApp.');
});
