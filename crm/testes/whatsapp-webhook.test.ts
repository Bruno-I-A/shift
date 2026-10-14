import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "@/app/api/whatsapp/webhook/route";

afterEach(() => vi.unstubAllEnvs());

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
});
