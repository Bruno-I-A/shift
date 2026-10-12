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

  it("envia só os trechos recuperados e não guarda a resposta no provedor", async () => {
    vi.stubEnv("OPENAI_API_KEY", "teste");
    vi.stubEnv("OPENAI_MODEL", "modelo-de-teste");
    const chamadas: RequestInit[] = [];
    const envio = vi.fn(async (url: string, opcoes: RequestInit) => {
      expect(url).toBe("https://api.openai.com/v1/responses");
      chamadas.push(opcoes);
      return new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
      resposta: "Sim, atendemos indústrias.", nome: "", empresa: "", segmento: "Indústria", dor: "", prazo: "", resumo: "Interesse no setor industrial.", passarParaHumano: false,
    }) }] }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", envio);

    const resultado = await analisarAtendimento("Vocês atendem indústrias? Meu e-mail é ana@example.com", "");
    expect(resultado.resposta).toMatch(/indústrias/);
    const opcoes = chamadas[0];
    const corpo = JSON.parse(String(opcoes.body));
    expect(corpo.store).toBe(false);
    expect(corpo.input).toContain("[e-mail]");
    expect(corpo.input).not.toContain("ana@example.com");
    expect(corpo.input).toContain("Trechos da base");
    expect(corpo.text.format.strict).toBe(true);
  });

  it("sem trecho de base, entrega a dúvida a uma pessoa sem chamar a IA", async () => {
    const envio = vi.fn();
    vi.stubGlobal("fetch", envio);
    const resultado = await analisarAtendimento("Qual é o preço exato de R$ 123?", "");
    expect(resultado.passarParaHumano).toBe(true);
    expect(envio).not.toHaveBeenCalled();
  });
});
