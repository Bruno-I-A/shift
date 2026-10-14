import { afterEach, describe, expect, it, vi } from "vitest";

import { analisarAtendimento } from "@/lib/ia-atendimento";
import { mascararDados } from "@/lib/dados-sensiveis";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

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

    const resultado = await analisarAtendimento("Vocês atendem indústrias? Meu e-mail é ana@example.com", "");
    expect(resultado.resposta).toMatch(/indústrias/);
    const opcoes = chamadas[0];
    const corpo = JSON.parse(String(opcoes.body));
    expect(corpo.messages[0].content).toContain("[e-mail]");
    expect(corpo.messages[0].content).not.toContain("ana@example.com");
    expect(corpo.messages[0].content).toContain("Trechos da base");
    expect(corpo.tool_choice).toEqual({ type: "tool", name: "registrar_atendimento" });
    expect(corpo.tools[0].input_schema.additionalProperties).toBe(false);
  });

  it("sem trecho de base, entrega a dúvida a uma pessoa sem chamar a IA", async () => {
    const envio = vi.fn();
    vi.stubGlobal("fetch", envio);
    const resultado = await analisarAtendimento("Qual é o preço exato de R$ 123?", "");
    expect(resultado.passarParaHumano).toBe(true);
    expect(envio).not.toHaveBeenCalled();
  });

  it("informa o status da Anthropic sem incluir conteúdo da conversa", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "teste");
    vi.stubEnv("ANTHROPIC_MODEL", "modelo-de-teste");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("credencial recusada", { status: 401 })));

    await expect(analisarAtendimento("Vocês atendem indústrias? Meu e-mail é ana@example.com", "")).rejects.toThrow("IA indisponível (401).");
  });
});
