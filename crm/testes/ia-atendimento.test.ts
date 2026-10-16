import { afterEach, describe, expect, it, vi } from "vitest";

import { analisarAtendimento, ErroFormatoAtendimento, type ContextoAtendimento } from "@/lib/ia-atendimento";
import { mascararDados } from "@/lib/dados-sensiveis";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

function contexto(extra: Partial<ContextoAtendimento> = {}): ContextoAtendimento {
  return { nome: "", empresa: null, segmento: null, dor: null, prazo: null, resumo: "", ultimaResposta: "", ...extra };
}

describe("resposta com RAG", () => {
  it.each([
    [new DOMException('texto privado', 'TimeoutError'), 'timeout'],
    [new TypeError('chave privada', { cause: { code: 'ENOTFOUND' } }), 'dns'],
    [new TypeError('texto privado', { cause: { code: 'ECONNRESET' } }), 'conexao'],
    [new TypeError('texto privado', { cause: { code: 'CERT_HAS_EXPIRED' } }), 'tls'],
  ])('distingue falha de transporte sem expor a mensagem original: %s', async (erro, tipo) => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'chave-que-nao-pode-vazar');
    const envio = vi.fn(async () => { throw erro; });
    vi.stubGlobal('fetch', envio);
    const falha = await analisarAtendimento('Como funciona?', contexto()).catch(e => e);
    expect(falha.diagnostico).toContain(`tipo=${tipo};`);
    expect(falha.diagnostico).toContain('tentativa=1; fase=conexao; duracao_ms=');
    expect(JSON.stringify(falha)).not.toMatch(/texto privado|chave privada|chave-que-nao/);
    expect(envio).toHaveBeenCalledOnce();
  });

  it('identifica resposta JSON inválida separadamente de rede', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'teste');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('conteudo privado', { status: 200 })));
    await expect(analisarAtendimento('Como funciona?', contexto())).rejects.toMatchObject({ diagnostico: expect.stringContaining('tipo=resposta_invalida;') });
  });

  it('a recuperação tem prazo próprio dentro do limite total e não reutiliza o sinal anterior', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'teste');
    const prazos: number[] = [];
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => { prazos.push(ms); return new AbortController().signal; });
    const sinais: AbortSignal[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, opcoes: RequestInit) => {
      sinais.push(opcoes.signal as AbortSignal);
      return Response.json(sinais.length === 1 ? { stop_reason: 'max_tokens', content: [] }
        : { content: [{ type: 'tool_use', name: 'registrar_atendimento', input: { resposta: 'Posso explicar. Qual é sua dúvida?' } }] });
    }));
    expect((await analisarAtendimento('Como funciona?', contexto())).resposta).toContain('Posso explicar');
    expect(prazos).toEqual([75_000, 45_000, 45_000]);
    expect(sinais[0]).not.toBe(sinais[1]);
  });
  it("mascara dados pessoais comuns antes de enviar ao modelo", () => {
    const texto = mascararDados("Meu e-mail é ana@example.com, CPF 123.456.789-00, WhatsApp (54) 99999-1234.");
    expect(texto).not.toContain("ana@example.com");
    expect(texto).not.toContain("123.456.789-00");
    expect(texto).not.toContain("99999-1234");
  });

  it.each([
    ["ana@example.com", "[e-mail]"], ["123.456.789-00", "[CPF]"],
    ["12.345.678/0001-90", "[CNPJ]"], ["(54) 99999-1234", "[telefone]"],
  ])("mascara %s antes de aplicar o limite do texto", (dado, marcador) => {
    const prefixo = `${"x".repeat(20)} `;
    expect(mascararDados(`${prefixo}${dado}`, 25)).toBe(`${prefixo}${marcador}`.slice(0, 25));
  });

  it("preserva os números de orçamento, prazo e equipe usados na qualificação", () => {
    const texto = "Tenho R$ 3.500 para o projeto, somos 8 pessoas e pensamos em 30 dias.";
    expect(mascararDados(texto)).toBe(texto);
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
    expect(JSON.stringify(corpo.messages)).toContain("[e-mail]");
    expect(JSON.stringify(corpo.messages)).not.toContain("ana@example.com");
    expect(corpo.messages[0].content).toContain("Trechos da base");
    expect(corpo.tool_choice).toEqual({ type: "tool", name: "registrar_atendimento" });
    expect(corpo.tools[0].input_schema.additionalProperties).toBe(false);
    expect(corpo.tools[0].strict).toBe(true);
    expect(JSON.stringify(corpo.tools)).not.toContain("maxLength");
  });

  it.each(["Bruno", "sim", "não"])("entende a resposta curta %s usando a memória e a última pergunta", async (texto) => {
    vi.stubEnv("ANTHROPIC_API_KEY", "teste");
    vi.stubEnv("ANTHROPIC_MODEL", "modelo-de-teste");
    const envio = vi.fn(async (_url: string, opcoes: RequestInit) => {
      const corpo = JSON.parse(String(opcoes.body));
      expect(corpo.messages[0].content).toContain('"empresa":"Scharff"');
      expect(corpo.messages[0].content).toContain("Como você se chama?");
      expect(corpo.messages.at(-1).content).toContain(texto);
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

  it("usa o histórico em ordem com autoria e preserva a complementação de um turno longo mascarado", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "teste");
    vi.stubEnv("ANTHROPIC_MODEL", "claude-sonnet-4-6");
    const turno = `Quero organizar a entrada de documentos. ${"A equipe recebe muitos documentos. ".repeat(55)}\nA correção importante: somos três, não oito. Retorno: ana@example.com`;
    const envio = vi.fn(async (_url: string, opcoes: RequestInit) => {
      const corpo = JSON.parse(String(opcoes.body));
      expect(corpo.messages.slice(1, -1)).toEqual([
        { role: "user", content: "Represento a Scharff e quero organizar documentos." },
        { role: "assistant", content: "Que ferramenta vocês usam hoje?" },
        { role: "user", content: "Usamos uma planilha, com oito pessoas. [e-mail]" },
        { role: "assistant", content: "[Equipe humana da Shift] Retomamos o assunto da entrada de documentos." },
      ]);
      expect(corpo.messages.at(-1).content).toContain("somos três, não oito");
      expect(corpo.messages.at(-1).content).toContain("[e-mail]");
      expect(JSON.stringify(corpo.messages)).not.toContain("ana@example.com");
      expect(corpo.thinking).toEqual({ type: "disabled" });
      expect(corpo.system[0].cache_control).toEqual({ type: "ephemeral" });
      return Response.json({ content: [{ type: "tool_use", name: "registrar_atendimento", input: {
        resposta: "Entendi, são três pessoas. Em que etapa a planilha mais atrapalha?", qualificacao: { equipe: "3" },
      } }] });
    });
    vi.stubGlobal("fetch", envio);
    const resultado = await analisarAtendimento(turno, contexto({
      nome: "Bruno", empresa: "Scharff", historico: [
        { autor: "cliente", texto: "Represento a Scharff e quero organizar documentos." },
        { autor: "agente", texto: "Que ferramenta vocês usam hoje?" },
        { autor: "cliente", texto: "Usamos uma planilha, com oito pessoas. ana@example.com" },
        { autor: "humano", texto: "Retomamos o assunto da entrada de documentos." },
      ],
    }));
    expect(resultado.qualificacao?.equipe).toBe("3");
    expect(envio).toHaveBeenCalledOnce();
  });

  it("limita o histórico às mensagens recentes sem perder o fim do turno atual", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "teste");
    vi.stubEnv("ANTHROPIC_MODEL", "");
    vi.stubGlobal("fetch", vi.fn(async (_url: string, opcoes: RequestInit) => {
      const corpo = JSON.parse(String(opcoes.body));
      expect(corpo.model).toBe("claude-haiku-5-5");
      expect(corpo.system[0].cache_control).toEqual({ type: "ephemeral" });
      expect(corpo.thinking).toEqual({ type: "disabled" });
      expect(corpo).not.toHaveProperty("temperature");
      expect(corpo).not.toHaveProperty("top_p");
      expect(corpo).not.toHaveProperty("top_k");
      expect(corpo.messages.at(-1).role).toBe("user");
      expect(corpo.tools[0].strict).toBe(true);
      expect(corpo.tool_choice).toEqual({ type: "tool", name: "registrar_atendimento" });
      const anteriores = corpo.messages.slice(1, -1);
      expect(anteriores.length).toBeLessThanOrEqual(12);
      expect(anteriores.map((m: { content: string }) => m.content).join("").length).toBeLessThanOrEqual(8000);
      expect(JSON.stringify(anteriores)).not.toContain("antiga-0 ");
      expect(anteriores.at(-1).content).toContain("antiga-29");
      expect(corpo.messages.at(-1).content).toContain("Este é o fim do turno.");
      return Response.json({ content: [{ type: "tool_use", name: "registrar_atendimento", input: { resposta: "Entendi." } }] });
    }));
    await analisarAtendimento(`${"Texto do projeto. ".repeat(600)}Este é o fim do turno.`, contexto({
      historico: Array.from({ length: 30 }, (_, i) => ({ autor: "cliente" as const, texto: `antiga-${i} ${"Contexto anterior. ".repeat(100)}` })),
    }));
  });

  it("preserva o Haiku 4.5 configurado explicitamente sem inflar seu prompt para cache", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "teste");
    vi.stubEnv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001");
    const envio = vi.fn(async (_url: string, opcoes: RequestInit) => {
      const corpo = JSON.parse(String(opcoes.body));
      expect(corpo.model).toBe("claude-haiku-4-5-20251001");
      expect(corpo.system[0].cache_control).toBeUndefined();
      expect(corpo.thinking).toEqual({ type: "disabled" });
      return Response.json({ content: [{ type: "tool_use", name: "registrar_atendimento", input: { resposta: "Podemos avaliar o processo." } }] });
    });
    vi.stubGlobal("fetch", envio);
    expect((await analisarAtendimento("Quero organizar um processo", contexto())).resposta).toBe("Podemos avaliar o processo.");
    expect(envio).toHaveBeenCalledOnce();
  });

  it("conta a identificação humana no orçamento do histórico que começa pela equipe", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "teste");
    vi.stubGlobal("fetch", vi.fn(async (_url: string, opcoes: RequestInit) => {
      const corpo = JSON.parse(String(opcoes.body));
      const anteriores = corpo.messages.slice(1, -1);
      expect(corpo.messages[0].role).toBe("user");
      expect(anteriores[0].role).toBe("assistant");
      expect(anteriores.every((m: { content: string }) => m.content.startsWith("[Equipe humana da Shift] "))).toBe(true);
      expect(anteriores.map((m: { content: string }) => m.content).join("").length).toBeLessThanOrEqual(8000);
      expect(anteriores.at(-1).content).toContain("Último detalhe relevante.");
      return Response.json({ content: [{ type: "tool_use", name: "registrar_atendimento", input: { resposta: "Podemos continuar de onde vocês pararam." } }] });
    }));
    await analisarAtendimento("Podemos retomar?", contexto({
      historico: Array.from({ length: 12 }, () => ({ autor: "humano" as const, texto: `${"Contexto anterior. ".repeat(100)}Último detalhe relevante.` })),
    }));
  });

  it("contabiliza cada tentativa pela usage da API sem aceitar valores do conteúdo", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "teste");
    vi.stubEnv("ANTHROPIC_MODEL", "claude-sonnet-4-6");
    const registro = vi.fn();
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      vi.stubGlobal("fetch", vi.fn()
        .mockResolvedValueOnce(Response.json({ stop_reason: "max_tokens", usage: { input_tokens: 1200, output_tokens: 1000 }, content: [] }))
        .mockResolvedValueOnce(Response.json({ stop_reason: "tool_use", usage: { input_tokens: 1300, output_tokens: 190, cache_read_input_tokens: 1100, cache_creation_input_tokens: -3 }, content: [{ type: "tool_use", name: "registrar_atendimento", input: { resposta: "Sim, podemos avaliar.", inputTokens: 999999, resumo: "ana@example.com" } }] })));
      await analisarAtendimento("O e-mail é ana@example.com", contexto({ onUso: registro }));
      expect(registro.mock.calls).toEqual([
        [{ modelo: "claude-sonnet-4-6", inputTokens: 1200, outputTokens: 1000, cacheReadTokens: 0, cacheCreationTokens: 0 }],
        [{ modelo: "claude-sonnet-4-6", inputTokens: 1300, outputTokens: 190, cacheReadTokens: 1100, cacheCreationTokens: 0 }],
      ]);
      expect(JSON.stringify(log.mock.calls)).not.toContain("ana@example.com");
    } finally { log.mockRestore(); }
  });

  it("não apresenta consumo ausente como se fosse uma chamada de custo zero", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "teste");
    const registro = vi.fn();
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({ content: [{ type: "tool_use", name: "registrar_atendimento", input: { resposta: "Podemos avaliar." } }] })));
      expect((await analisarAtendimento("Quero um sistema", contexto({ onUso: registro }))).resposta).toBe("Podemos avaliar.");
      expect(registro).not.toHaveBeenCalled();
      expect(aviso).toHaveBeenCalledWith("[whatsapp] uso_ia indisponível na resposta do provedor.");
    } finally { aviso.mockRestore(); }
  });

  it("não confunde uma dúvida acompanhada de agradecimento com encerramento", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "teste");
    const envio = vi.fn(async () => Response.json({ content: [{ type: "tool_use", name: "registrar_atendimento", input: { resposta: "Sim, fazemos sites." } }] }));
    vi.stubGlobal("fetch", envio);
    expect((await analisarAtendimento("Vocês fazem sites? Obrigado", contexto())).resposta).toBe("Sim, fazemos sites.");
    expect(envio).toHaveBeenCalledOnce();
  });

  it("não ignora o valor informado junto a uma cortesia", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "teste");
    const envio = vi.fn(async () => Response.json({ content: [{ type: "tool_use", name: "registrar_atendimento", input: { resposta: "Entendi a faixa de investimento.", qualificacao: { investimento: "R$ 3.500" } } }] }));
    vi.stubGlobal("fetch", envio);
    const resultado = await analisarAtendimento("Show, 3500", contexto({ ultimaResposta: "Já tem uma faixa de investimento em mente?" }));
    expect(resultado.qualificacao?.investimento).toBe("R$ 3.500");
    expect(envio).toHaveBeenCalledOnce();
  });

  it("limita uma resposta extensa sem segunda inferência nem perda dos fatos extraídos", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "teste");
    vi.stubEnv("ANTHROPIC_MODEL", "modelo-de-teste");
    const envio = vi.fn()
      .mockResolvedValueOnce(Response.json({ content: [{ type: "tool_use", name: "registrar_atendimento", input: {
        resposta: "A Shift cria sites institucionais. ".repeat(15), nome: "Bruno", empresa: "Clínica B", segmento: "Odontologia", dor: "", prazo: "", resumo: "Bruno quer o primeiro site da Clínica B.", passarParaHumano: false,
        qualificacao: { interesse: "site", cidade: "Passo Fundo", siteAtual: "Primeiro site" },
      } }] }));
    vi.stubGlobal("fetch", envio);
    const resultado = await analisarAtendimento("Quero um site para a clínica", contexto());
    expect(resultado.resposta.length).toBeLessThanOrEqual(600);
    expect(resultado.resposta).toContain("A Shift cria sites institucionais.");
    expect(resultado.resposta).not.toContain("Qual é o nome");
    expect(resultado.qualificacao).toMatchObject({ interesse: "site", cidade: "Passo Fundo" });
    expect(resultado.nome).toBe("Bruno");
    expect(envio).toHaveBeenCalledOnce();
  });

  it("um agradecimento responde sem custo de IA e não confirma encaminhamento", async () => {
    const envio = vi.fn();
    vi.stubGlobal("fetch", envio);
    const resultado = await analisarAtendimento("Show, obrigado", contexto({ nome: "Bruno", resumo: "Bruno quer o primeiro site da clínica.", ultimaResposta: "Posso encaminhar esse resumo à equipe da Shift para continuar com você?" }));
    expect(resultado.passarParaHumano).toBe(false);
    expect(resultado.resposta).toBe("Por nada. Quando quiser, podemos continuar por aqui.");
    expect(resultado.resumo).toBe("Bruno quer o primeiro site da clínica.");
    expect(resultado.qualificacao).toEqual({});
    expect(envio).not.toHaveBeenCalled();
  });

  it("preserva uma pergunta contextual e não acrescenta outra pergunta fixa", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "teste");
    vi.stubEnv("ANTHROPIC_MODEL", "modelo-de-teste");
    const envio = vi.fn(async () => Response.json({ content: [{ type: "tool_use", name: "registrar_atendimento", input: {
      resposta: "Entendi, vocês querem atrair pacientes. Qual tratamento querem destacar primeiro?", qualificacao: { interesse: "site", objetivo: "Atrair pacientes" },
    } }] }));
    vi.stubGlobal("fetch", envio);
    const resultado = await analisarAtendimento("Quero um site", contexto());
    expect(resultado.resposta).toBe("Entendi, vocês querem atrair pacientes. Qual tratamento querem destacar primeiro?");
    expect(resultado.qualificacao).toMatchObject({ objetivo: "Atrair pacientes" });
    expect(envio).toHaveBeenCalledOnce();
  });

  it.each([
    'Você perguntou "o que preciso enviar?". Podemos ajudar a organizar textos, fotos e informações do negócio.',
    "Quer começar pelo site? Podemos organizar primeiro o objetivo e os materiais que você já tem.",
    `Podemos avaliar a integração com a ferramenta da empresa. ${"O fluxo depende dos acessos disponíveis. ".repeat(18)}A equipe precisa confirmar os detalhes antes de garantir essa integração.`,
  ])("preserva a explicação depois de uma interrogação e respostas úteis acima de 600 caracteres", async (resposta) => {
    vi.stubEnv("ANTHROPIC_API_KEY", "teste");
    const envio = vi.fn(async () => Response.json({ content: [{ type: "tool_use", name: "registrar_atendimento", input: { resposta } }] }));
    vi.stubGlobal("fetch", envio);
    expect((await analisarAtendimento("O que preciso para começar?", contexto())).resposta).toBe(resposta);
    expect(envio).toHaveBeenCalledOnce();
  });

  it("uma confirmação explícita encaminha sem garantir prazo de retorno", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "teste");
    vi.stubEnv("ANTHROPIC_MODEL", "modelo-de-teste");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ content: [{ type: "tool_use", name: "registrar_atendimento", input: {
      resposta: "Tudo certo.", nome: "", empresa: "", segmento: "", dor: "", prazo: "", resumo: "Quer site para a clínica.", passarParaHumano: false,
    } }] })));
    const resultado = await analisarAtendimento("Sim, pode", contexto({ nome: "Bruno", ultimaResposta: "Quer que eu encaminhe seu resumo para nossa equipe?" }));
    expect(resultado.passarParaHumano).toBe(true);
    expect(resultado.motivoEncaminhamento).toBe("pedido_cliente");
    expect(resultado.resposta).not.toContain("?");
    expect(resultado.resposta).not.toContain("em breve");
  });

  it("preserva a parte respondida quando outra informação precisa da equipe", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "teste");
    const resposta = "A Shift cria sites institucionais e sistemas para empresas. O preço e as medidas específicas de segurança precisam ser confirmados pela equipe; vou deixar essas dúvidas registradas para ela.";
    const envio = vi.fn(async () => Response.json({ content: [{ type: "tool_use", name: "registrar_atendimento", input: {
      resposta, passarParaHumano: true, motivoEncaminhamento: "informacao_indisponivel", resumo: "Quer entender preço e segurança antes de seguir com o projeto.",
    } }] }));
    vi.stubGlobal("fetch", envio);
    const resultado = await analisarAtendimento("Vocês fazem sites e sistemas? Quanto custa e como funciona a segurança?", contexto());
    expect(resultado.passarParaHumano).toBe(true);
    expect(resultado.motivoEncaminhamento).toBe("informacao_indisponivel");
    expect(resultado.resposta).toBe(resposta);
    expect(envio).toHaveBeenCalledOnce();
  });

  it("um cumprimento recebe a memória anterior incluindo recusa e histórico, sem reiniciar o contato", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "teste");
    const envio = vi.fn(async (_url: string, opcoes: RequestInit) => {
      const corpo = JSON.parse(String(opcoes.body));
      const memoria = corpo.messages[0].content;
      expect(memoria).toContain('"empresa":"Clínica B"');
      expect(memoria).toContain("Prefere não informar o nome.");
      expect(memoria).toContain('"objetivo":"Agendar consultas"');
      expect(corpo.messages.slice(1, -1)).toEqual([
        { role: "user", content: "Prefiro não dar meu nome." },
        { role: "assistant", content: "Tudo bem. Podemos conversar sobre o site da clínica." },
      ]);
      expect(corpo.messages.at(-1).content).toContain("Oi");
      return Response.json({ content: [{ type: "tool_use", name: "registrar_atendimento", input: { resposta: "Oi! Podemos continuar com o site da clínica." } }] });
    });
    vi.stubGlobal("fetch", envio);
    const resultado = await analisarAtendimento("Oi", contexto({
      empresa: "Clínica B", resumo: "Quer o primeiro site da clínica. Prefere não informar o nome.", qualificacao: { interesse: "site", objetivo: "Agendar consultas" },
      historico: [{ autor: "cliente", texto: "Prefiro não dar meu nome." }, { autor: "agente", texto: "Tudo bem. Podemos conversar sobre o site da clínica." }],
      ultimaResposta: "Tudo bem. Podemos conversar sobre o site da clínica.",
    }));
    expect(resultado.resposta).toBe("Oi! Podemos continuar com o site da clínica.");
    expect(resultado.nome).toBe("");
    expect(resultado.passarParaHumano).toBe(false);
    expect(envio).toHaveBeenCalledOnce();
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
    expect(resultado.resposta).toBe("Podemos olhar esse processo juntos.");
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
    expect(resultado.resposta).toBe("Sim, criamos sites institucionais.");
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
