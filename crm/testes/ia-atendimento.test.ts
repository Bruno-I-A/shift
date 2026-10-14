import { afterEach, describe, expect, it, vi } from "vitest";

import { analisarAtendimento, ErroFormatoAtendimento, type ContextoAtendimento } from "@/lib/ia-atendimento";
import { mascararDados } from "@/lib/dados-sensiveis";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function contexto(extra: Partial<ContextoAtendimento> = {}): ContextoAtendimento {
  return { nome: "", empresa: null, segmento: null, dor: null, prazo: null, resumo: "", ultimaResposta: "", ...extra };
}

describe("resposta com RAG", () => {
  it("mascara dados pessoais comuns antes de enviar ao modelo", () => {
    const texto = mascararDados("Meu e-mail é ana@example.com, CPF 123.456.789-00, WhatsApp (54) 99999-1234.");
    expect(texto).not.toContain("ana@example.com");
    expect(texto).not.toContain("123.456.789-00");
    expect(texto).not.toContain("99999-1234");
  });

  it("envia só os trechos recuperados à API da Anthropic", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "teste");
    vi.stubEnv("ANTHROPIC_MODEL", "modelo-de-teste");
    const chamadas: RequestInit[] = [];
    const envio = vi.fn(async (url: string, opcoes: RequestInit) => {
      expect(url).toBe("https://api.anthropic.com/v1/messages");
      chamadas.push(opcoes);
      return new Response(JSON.stringify({ content: [{ type: "tool_use", name: "registrar_atendimento", input: {
        resposta: "Sim, atendemos indústrias.", nome: "", empresa: "", segmento: "Indústria", dor: "", prazo: "", resumo: "Interesse no setor industrial.", passarParaHumano: false,
      } }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", envio);

    const resultado = await analisarAtendimento("Vocês atendem indústrias? Meu e-mail é ana@example.com", contexto({
      resumo: "Retornar por ana@example.com, telefone (54) 99999-1234.",
      ultimaResposta: "Você pode enviar para ana@example.com.",
    }));
    expect(resultado.resposta).toMatch(/indústrias/);
    const opcoes = chamadas[0];
    const corpo = JSON.parse(String(opcoes.body));
    expect(corpo.messages[0].content).toContain("[e-mail]");
    expect(corpo.messages[0].content).not.toContain("ana@example.com");
    expect(corpo.messages[0].content).toContain("Trechos da base");
    expect(corpo.tool_choice).toEqual({ type: "tool", name: "registrar_atendimento" });
    expect(corpo.tools[0].input_schema.additionalProperties).toBe(false);
    expect(corpo.tools[0].strict).toBe(true);
    expect(JSON.stringify(corpo.tools)).not.toContain("maxLength");
  });

  it.each(["Bruno", "sim", "não", "Obrigado"])("entende a resposta curta %s usando a memória e a última pergunta", async (texto) => {
    vi.stubEnv("ANTHROPIC_API_KEY", "teste");
    vi.stubEnv("ANTHROPIC_MODEL", "modelo-de-teste");
    const envio = vi.fn(async (_url: string, opcoes: RequestInit) => {
      const corpo = JSON.parse(String(opcoes.body));
      expect(corpo.messages[0].content).toContain('"empresa":"Scharff"');
      expect(corpo.messages[0].content).toContain("Como você se chama?");
      expect(corpo.messages[0].content).toContain(`Mensagem atual: ${texto}`);
      return Response.json({ content: [{ type: "tool_use", name: "registrar_atendimento", input: {
        resposta: "Entendi.", nome: texto === "Bruno" ? "Bruno" : "", empresa: "", segmento: "", dor: "", prazo: "", resumo: "Representa a Scharff.", passarParaHumano: false,
      } }] });
    });
    vi.stubGlobal("fetch", envio);
    const resultado = await analisarAtendimento(texto, contexto({ empresa: "Scharff", ultimaResposta: "Como você se chama?" }));
    expect(resultado.passarParaHumano).toBe(false);
    expect(envio).toHaveBeenCalledOnce();
  });

  it("informa o status da Anthropic sem incluir conteúdo da conversa", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "teste");
    vi.stubEnv("ANTHROPIC_MODEL", "modelo-de-teste");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("credencial recusada", { status: 401 })));

    await expect(analisarAtendimento("Vocês atendem indústrias? Meu e-mail é ana@example.com", contexto())).rejects.toThrow("IA indisponível (401).");
  });

  it("encurta uma resposta extensa sem perder os fatos extraídos do cliente", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "teste");
    vi.stubEnv("ANTHROPIC_MODEL", "modelo-de-teste");
    const envio = vi.fn()
      .mockResolvedValueOnce(Response.json({ content: [{ type: "tool_use", name: "registrar_atendimento", input: {
        resposta: "A Shift cria sites institucionais. ".repeat(15), nome: "Bruno", empresa: "Clínica B", segmento: "Odontologia", dor: "", prazo: "", resumo: "Bruno quer o primeiro site da Clínica B.", passarParaHumano: false,
        qualificacao: { interesse: "site", cidade: "Passo Fundo", siteAtual: "Primeiro site" },
      } }] }))
      .mockResolvedValueOnce(Response.json({ content: [{ type: "tool_use", name: "resumir_resposta", input: { resposta: "Sim, criamos sites institucionais e ajudamos a organizar o conteúdo." } }] }));
    vi.stubGlobal("fetch", envio);
    const resultado = await analisarAtendimento("Quero um site para a clínica", contexto());
    expect(resultado.resposta.length).toBeLessThanOrEqual(420);
    expect(resultado.resposta).toContain("O que você quer alcançar com o site?");
    expect(resultado.resposta.match(/\?/g)).toHaveLength(1);
    expect(resultado.qualificacao).toMatchObject({ interesse: "site", cidade: "Passo Fundo" });
    expect(resultado.nome).toBe("Bruno");
    expect(envio).toHaveBeenCalledTimes(2);
  });

  it("um agradecimento não confirma a oferta de encaminhamento nem promete contato", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "teste");
    vi.stubEnv("ANTHROPIC_MODEL", "modelo-de-teste");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ content: [{ type: "tool_use", name: "registrar_atendimento", input: {
      resposta: "Em breve um especialista vai entrar em contato.", nome: "", empresa: "", segmento: "", dor: "", prazo: "", resumo: "Quer site para a clínica.", passarParaHumano: true,
      motivoEncaminhamento: "pedido_cliente", coletarDados: true,
    } }] })));
    const resultado = await analisarAtendimento("Show, obrigado", contexto({ nome: "Bruno", resumo: "Bruno quer o primeiro site da clínica.", ultimaResposta: "Posso encaminhar esse resumo à equipe da Shift para continuar com você?" }));
    expect(resultado.passarParaHumano).toBe(false);
    expect(resultado.resposta).toBe("Por nada. Quando quiser, podemos continuar por aqui.");
    expect(resultado.resumo).toBe("Bruno quer o primeiro site da clínica.");
    expect(resultado.qualificacao).toEqual({});
  });

  it("uma falha na reescrita mantém a qualificação extraída e o agente ativo", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "teste");
    vi.stubEnv("ANTHROPIC_MODEL", "modelo-de-teste");
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      vi.stubGlobal("fetch", vi.fn()
        .mockResolvedValueOnce(Response.json({ content: [{ type: "tool_use", name: "registrar_atendimento", input: {
          resposta: "Uma explicação longa sobre sites. ".repeat(20), nome: "Bruno", empresa: "Clínica B", segmento: "Odontologia", dor: "", prazo: "", resumo: "Quer um site.", passarParaHumano: false,
          qualificacao: { interesse: "site", objetivo: "Atrair pacientes" },
        } }] }))
        .mockResolvedValueOnce(new Response(null, { status: 429 })));
      const resultado = await analisarAtendimento("Quero um site", contexto());
      expect(resultado.passarParaHumano).toBe(false);
      expect(resultado.qualificacao).toMatchObject({ objetivo: "Atrair pacientes" });
      expect(resultado.resposta).toContain("Em qual cidade sua empresa atende?");
      expect(resultado.resposta.length).toBeLessThanOrEqual(420);
    } finally { aviso.mockRestore(); }
  });

  it("uma confirmação explícita encaminha sem garantir prazo de retorno", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "teste");
    vi.stubEnv("ANTHROPIC_MODEL", "modelo-de-teste");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ content: [{ type: "tool_use", name: "registrar_atendimento", input: {
      resposta: "Tudo certo.", nome: "", empresa: "", segmento: "", dor: "", prazo: "", resumo: "Quer site para a clínica.", passarParaHumano: false,
    } }] })));
    const resultado = await analisarAtendimento("Sim, pode", contexto({ nome: "Bruno", ultimaResposta: "Posso encaminhar esse resumo à equipe da Shift para continuar com você?" }));
    expect(resultado.passarParaHumano).toBe(true);
    expect(resultado.resposta).not.toContain("?");
    expect(resultado.resposta).not.toContain("em breve");
  });

  it("aceita campos nulos, limita o resumo e aproveita os campos úteis de qualificação", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "teste");
    vi.stubEnv("ANTHROPIC_MODEL", "claude-sonnet-4-6");
    const envio = vi.fn(async () => Response.json({ stop_reason: "tool_use", content: [{ type: "tool_use", name: "registrar_atendimento", input: {
      resposta: "Podemos olhar esse processo juntos.", nome: null, empresa: null, segmento: null, dor: null, prazo: null,
      resumo: "Contexto do projeto. ".repeat(100), passarParaHumano: "false", coletarDados: "true", motivoEncaminhamento: "Nenhum",
      qualificacao: { interesse: "IA nos processos", equipe: 8, materiais: false, cidade: null, investimento: { indefinido: true }, campoInventado: "não deve ser salvo" },
    } }] }));
    vi.stubGlobal("fetch", envio);
    const resultado = await analisarAtendimento("Somos oito pessoas", contexto({ nome: "Bruno", empresa: "Empresa B", segmento: "Serviços" }));
    expect(resultado.nome).toBe("");
    expect(resultado.empresa).toBe("");
    expect(resultado.resumo.length).toBe(1000);
    expect(resultado.qualificacao).toEqual({ interesse: "IA nos processos", equipe: "8", materiais: "Não" });
    expect(resultado.passarParaHumano).toBe(false);
    expect(resultado.resposta).toContain("Qual processo");
    expect(envio).toHaveBeenCalledOnce();
  });

  it("uma resposta útil funciona com metadados ausentes, sem apagar a memória anterior", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "teste");
    vi.stubEnv("ANTHROPIC_MODEL", "claude-sonnet-4-6");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ stop_reason: "tool_use", content: [{ type: "tool_use", name: "registrar_atendimento", input: {
      resposta: "Sim, criamos sites institucionais.", qualificacao: null,
    } }] })));
    const resultado = await analisarAtendimento("Vocês fazem sites?", contexto({ nome: "Bruno", empresa: "Clínica B", qualificacao: { interesse: "site" } }));
    expect(resultado.qualificacao).toEqual({});
    expect(resultado.nome).toBe("");
    expect(resultado.resumo).toBe("");
    expect(resultado.resposta).toContain("O que você quer alcançar com o site?");
  });

  it("repete uma resposta truncada com mais tokens sem usar os dados parciais", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "teste");
    vi.stubEnv("ANTHROPIC_MODEL", "claude-sonnet-4-6");
    const pedidos: { max_tokens: number }[] = [];
    const envio = vi.fn(async (_url: string, opcoes: RequestInit) => {
      pedidos.push(JSON.parse(String(opcoes.body)));
      return pedidos.length === 1
        ? Response.json({ stop_reason: "max_tokens", content: [{ type: "tool_use", name: "registrar_atendimento", input: { resposta: "Uma resposta parcial.", nome: "Nome incompleto" } }] })
        : Response.json({ stop_reason: "tool_use", content: [{ type: "tool_use", name: "registrar_atendimento", input: { resposta: "Vamos olhar o projeto da clínica.", nome: "Bruno", empresa: "Clínica B", qualificacao: { interesse: "site" } } }] });
    });
    vi.stubGlobal("fetch", envio);
    const resultado = await analisarAtendimento("Bruno, da Clínica B", contexto());
    expect(resultado.nome).toBe("Bruno");
    expect(pedidos[1].max_tokens).toBeGreaterThan(pedidos[0].max_tokens);
    expect(envio).toHaveBeenCalledTimes(2);
  });

  it("repete uma chamada sem ferramenta antes de interromper o atendimento", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "teste");
    vi.stubEnv("ANTHROPIC_MODEL", "claude-sonnet-4-6");
    const envio = vi.fn()
      .mockResolvedValueOnce(Response.json({ stop_reason: "end_turn", content: [{ type: "text", text: "Um texto fora da ferramenta." }] }))
      .mockResolvedValueOnce(Response.json({ stop_reason: "tool_use", content: [{ type: "tool_use", name: "registrar_atendimento", input: { resposta: "Sim, fazemos sites.", coletarDados: false } }] }));
    vi.stubGlobal("fetch", envio);
    expect((await analisarAtendimento("Vocês fazem sites?", contexto())).resposta).toBe("Sim, fazemos sites.");
    expect(envio).toHaveBeenCalledTimes(2);
  });

  it("recusa uma resposta essencial inválida após uma tentativa extra e diagnostica sem conteúdo", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "teste");
    vi.stubEnv("ANTHROPIC_MODEL", "claude-sonnet-4-6");
    const envio = vi.fn(async () => Response.json({ stop_reason: "tool_use", content: [{ type: "tool_use", name: "registrar_atendimento", input: {
      resposta: null, nome: "Nome privado", resumo: "ana@example.com",
    } }] }));
    vi.stubGlobal("fetch", envio);
    const erro = await analisarAtendimento("Vocês fazem sites?", contexto()).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroFormatoAtendimento);
    expect(erro.diagnostico).toBe("stop=tool_use; campos=resposta");
    expect(erro.diagnostico).not.toContain("Nome privado");
    expect(erro.diagnostico).not.toContain("ana@example.com");
    expect(envio).toHaveBeenCalledTimes(2);
  });

  it("não repete uma recusa do modelo", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "teste");
    vi.stubEnv("ANTHROPIC_MODEL", "claude-sonnet-4-6");
    const envio = vi.fn(async () => Response.json({ stop_reason: "refusal", content: [{ type: "text", text: "Recusa." }] }));
    vi.stubGlobal("fetch", envio);
    await expect(analisarAtendimento("Uma pergunta", contexto())).rejects.toBeInstanceOf(ErroFormatoAtendimento);
    expect(envio).toHaveBeenCalledOnce();
  });
});
