import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "@/app/api/whatsapp/webhook/route";
import { emTransacao } from "@/lib/banco";
import { buscarAtendimentoWhatsApp } from "@/lib/leads";
import { bancoDeTeste } from "./banco-de-teste";

vi.mock("@/lib/banco", () => ({ emTransacao: vi.fn() }));

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

function assinatura(corpo: string, segredo: string): string {
  return `sha256=${createHmac("sha256", segredo).update(corpo).digest("hex")}`;
}

describe("proteção do webhook oficial do WhatsApp", () => {
  it("fica desligado por padrão", async () => {
    vi.stubEnv("WHATSAPP_ATIVO", "não");
    expect((await POST(new Request("https://crm.shiftsys.com.br/api/whatsapp/webhook", { method: "POST" }))).status).toBe(503);
  });

  it("devolve o desafio da Meta apenas com o token correto", async () => {
    vi.stubEnv("WHATSAPP_ATIVO", "não");
    vi.stubEnv("WHATSAPP_META_VERIFY_TOKEN", "segredo-de-teste");
    const url = "https://crm.shiftsys.com.br/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=segredo-de-teste&hub.challenge=desafio";
    expect(await (await GET(new Request(url))).text()).toBe("desafio");
    expect((await GET(new Request(url.replace("segredo-de-teste", "errado")))).status).toBe(403);
  });

  it("recusa eventos cuja assinatura da Meta não confere", async () => {
    vi.stubEnv("WHATSAPP_ATIVO", "sim");
    vi.stubEnv("WHATSAPP_META_APP_SECRET", "segredo-de-teste");
    vi.stubEnv("WHATSAPP_META_PHONE_NUMBER_ID", "123");
    const corpo = "{}";
    const pedido = new Request("https://crm.shiftsys.com.br/api/whatsapp/webhook", {
      method: "POST", headers: { "x-hub-signature-256": assinatura(corpo, "errado") }, body: corpo,
    });
    expect((await POST(pedido)).status).toBe(401);
  });

  it("continua do consentimento ao nome e entende um SIM posterior como resposta da conversa", async () => {
    const { tx } = await bancoDeTeste();
    vi.mocked(emTransacao).mockImplementation((executar) => executar(tx));
    vi.stubEnv("WHATSAPP_ATIVO", "sim");
    vi.stubEnv("WHATSAPP_META_APP_SECRET", "segredo-de-teste");
    vi.stubEnv("WHATSAPP_META_PHONE_NUMBER_ID", "123");
    vi.stubEnv("WHATSAPP_META_ACCESS_TOKEN", "meta-teste");
    vi.stubEnv("WHATSAPP_META_GRAPH_VERSION", "v24.0");
    vi.stubEnv("ANTHROPIC_API_KEY", "ia-teste");
    vi.stubEnv("ANTHROPIC_MODEL", "modelo-de-teste");
    const enviados: string[] = [];
    const pedidosIa: string[] = [];
    vi.stubGlobal("fetch", async (url: string, opcoes: RequestInit) => {
      const corpo = JSON.parse(String(opcoes.body));
      if (url.startsWith("https://graph.facebook.com/")) {
        enviados.push(corpo.text.body);
        return Response.json({});
      }
      pedidosIa.push(corpo.messages[0].content);
      return Response.json({ content: [{ type: "tool_use", name: "registrar_atendimento", input: {
        resposta: pedidosIa.length === 1 ? "Prazer, Bruno." : "Começamos entendendo o processo que você quer melhorar.",
        nome: pedidosIa.length === 1 ? "Bruno" : "", empresa: "", segmento: "", dor: "", prazo: "", resumo: "", passarParaHumano: false,
      } }] });
    });
    async function receber(id: string, texto: string) {
      const corpo = JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: {
        metadata: { phone_number_id: "123" }, messages: [{ from: "5554999991234", id, timestamp: Math.floor(Date.now() / 1000), type: "text", text: { body: texto } }],
      } }] }] });
      const resposta = await POST(new Request("https://crm.shiftsys.com.br/api/whatsapp/webhook", {
        method: "POST", headers: { "x-hub-signature-256": assinatura(corpo, "segredo-de-teste") }, body: corpo,
      }));
      expect(resposta.status).toBe(200);
    }
    await receber("OI1", "Oi");
    expect(pedidosIa).toHaveLength(0);
    expect(await buscarAtendimentoWhatsApp(tx, "5554999991234")).toBeNull();
    await receber("SIM1", "SIM");
    expect(enviados.at(-1)).toBe("Combinado. Como você se chama?");
    await receber("NOME1", "Bruno");
    expect(pedidosIa[0]).toContain("Como você se chama?");
    await receber("SIM2", "SIM");
    expect(pedidosIa).toHaveLength(2);
    expect(pedidosIa[1]).toContain('"nome":"Bruno"');
    expect(pedidosIa[1]).toContain("Prazer, Bruno.");
    expect(pedidosIa[1]).toContain("Qual é o nome da sua empresa?");
    expect(await buscarAtendimentoWhatsApp(tx, "5554999991234")).toMatchObject({ nome: "Bruno", modo: "agente" });
  });
});
