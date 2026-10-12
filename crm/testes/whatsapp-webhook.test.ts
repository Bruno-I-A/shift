import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/whatsapp/webhook/route";

afterEach(() => vi.unstubAllEnvs());

describe("proteção do webhook do WhatsApp", () => {
  it("fica desligado por padrão", async () => {
    vi.stubEnv("WHATSAPP_ATIVO", "não");
    expect((await POST(new Request("https://crm.shiftsys.com.br/api/whatsapp/webhook", { method: "POST" }))).status).toBe(503);
  });

  it("recusa pedidos sem o segredo correto antes de ler o corpo", async () => {
    vi.stubEnv("WHATSAPP_ATIVO", "sim");
    vi.stubEnv("WHATSAPP_WEBHOOK_SEGREDO", "segredo-de-teste");
    const pedido = new Request("https://crm.shiftsys.com.br/api/whatsapp/webhook", {
      method: "POST", headers: { "x-shift-webhook-token": "errado" }, body: "{}",
    });
    expect((await POST(pedido)).status).toBe(401);
  });
});
