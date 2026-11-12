import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "@/app/api/whatsapp/conexoes/webhook/route";
import { POST as POST_PRINCIPAL } from "@/app/api/whatsapp/webhook/route";
import { emTransacao } from "@/lib/banco";
import type { Consulta } from "@/lib/consulta";
import { conectarNumero, enviarTeste, listarConexoes, registrarAvisos, sincronizar } from "@/lib/conexoes-whatsapp";
import * as leads from "@/lib/leads";

import { bancoDeTeste } from "./banco-de-teste";

vi.mock("@/lib/banco", () => ({ emTransacao: vi.fn() }));

const TOKEN = "TOKEN-DO-CLIENTE-SIGILOSO";
let tx: Consulta;
const executar = <T,>(trabalho: (t: Consulta) => Promise<T>) => trabalho(tx);

interface Chamada { caminho: string; metodo: string; corpo: unknown; consulta: URLSearchParams; autorizacao: string | null }

/** Meta simulada: responde por caminho e guarda o que recebeu. */
function metaFalsa(respostas: Record<string, unknown> = {}) {
  const chamadas: Chamada[] = [];
  const padrao: Record<string, unknown> = {
    "oauth/access_token": { access_token: TOKEN, token_type: "bearer" },
    "111/subscribed_apps": { success: true },
    "222": { display_phone_number: "+55 54 99999-0000", verified_name: "Padaria Teste", is_on_biz_app: true, platform_type: "CLOUD_API" },
    "111/phone_numbers": { data: [{ id: "222" }] },
    "222/smb_app_data": { request_id: "pedido-1" },
    "222/messages": { messages: [{ id: "wamid.TESTE" }] },
  };
  const tabela = { ...padrao, ...respostas };
  vi.stubGlobal("fetch", vi.fn(async (url: URL, opcoes?: RequestInit) => {
    const caminho = url.pathname.replace(/^\/v\d+\.\d+\//, "");
    chamadas.push({
      caminho, metodo: opcoes?.method ?? "GET", consulta: url.searchParams,
      corpo: opcoes?.body ? JSON.parse(String(opcoes.body)) : undefined,
      autorizacao: new Headers(opcoes?.headers).get("authorization"),
    });
    const resposta = tabela[caminho];
    if (resposta instanceof Response) return resposta;
    return resposta === undefined ? Response.json({ error: { message: "caminho inesperado" } }, { status: 404 }) : Response.json(resposta);
  }));
  return chamadas;
}

beforeEach(async () => {
  vi.stubEnv("WHATSAPP_META_APP_ID", "1234567890");
  vi.stubEnv("WHATSAPP_META_APP_SECRET", "segredo-do-app");
  vi.stubEnv("WHATSAPP_META_CONFIG_ID", "555");
  vi.stubEnv("WHATSAPP_META_GRAPH_VERSION", "v24.0");
  vi.stubEnv("WHATSAPP_META_VERIFY_TOKEN", "token-de-verificacao");
  vi.stubEnv("APP_URL", "https://crm.exemplo.com/");
  vi.stubEnv("SESSAO_SEGREDO", "segredo-de-sessao-com-mais-de-32-caracteres");
  ({ tx } = await bancoDeTeste());
  vi.mocked(emTransacao).mockImplementation(((trabalho: (t: Consulta) => Promise<unknown>) => trabalho(tx)) as typeof emTransacao);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

const fimDoFluxo = { codigo: "codigo-de-trinta-segundos", wabaId: "111", phoneNumberId: "222", evento: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING" };

describe("conexão de número em coexistência", () => {
  it("troca o código primeiro, manda os avisos para o webhook separado e guarda a permissão cifrada", async () => {
    const chamadas = metaFalsa();
    const resultado = await conectarNumero(executar, fimDoFluxo);

    expect(chamadas.map((c) => c.caminho)).toEqual(["oauth/access_token", "222", "111/subscribed_apps"]);
    expect(Object.fromEntries(chamadas[0].consulta)).toEqual({ client_id: "1234567890", client_secret: "segredo-do-app", code: fimDoFluxo.codigo });
    expect(chamadas[2]).toMatchObject({
      metodo: "POST", autorizacao: `Bearer ${TOKEN}`,
      corpo: { override_callback_uri: "https://crm.exemplo.com/api/whatsapp/conexoes/webhook", verify_token: "token-de-verificacao" },
    });
    expect(resultado.numero).toMatchObject({ is_on_biz_app: true, platform_type: "CLOUD_API" });

    const { rows } = await tx.query<{ token_cifrado: string }>("select token_cifrado from crm.conexao_whatsapp");
    expect(rows[0].token_cifrado).not.toContain(TOKEN);
    const lista = await listarConexoes(tx);
    expect(lista).toMatchObject([{ phoneNumberId: "222", wabaId: "111", nomeVerificado: "Padaria Teste", coexistencia: true, eventos: {} }]);
    expect(JSON.stringify(lista)).not.toContain(TOKEN);
    expect((await tx.query("select tipo from crm.evento where tipo = 'whatsapp_numero_conectado'")).rows).toHaveLength(1);
  });

  it("acha o número pela conta quando a Meta não o informa", async () => {
    const chamadas = metaFalsa();
    await conectarNumero(executar, { ...fimDoFluxo, phoneNumberId: undefined });
    expect(chamadas.map((c) => c.caminho)).toContain("111/phone_numbers");
    expect((await listarConexoes(tx))[0].phoneNumberId).toBe("222");
  });

  it("sem o aviso da sessão, acha a conta pela permissão e confirma a coexistência no número", async () => {
    const chamadas = metaFalsa({ debug_token: { data: { granular_scopes: [
      { scope: "whatsapp_business_messaging", target_ids: ["111"] },
      { scope: "whatsapp_business_management", target_ids: ["111"] },
    ] } } });
    await conectarNumero(executar, { codigo: fimDoFluxo.codigo });
    expect(chamadas.map((c) => c.caminho)).toEqual(["oauth/access_token", "debug_token", "111/phone_numbers", "222", "111/subscribed_apps"]);
    expect(Object.fromEntries(chamadas[1].consulta)).toEqual({ input_token: TOKEN, access_token: "1234567890|segredo-do-app" });
    expect((await listarConexoes(tx))[0]).toMatchObject({ wabaId: "111", phoneNumberId: "222" });
  });

  it("sem o aviso da sessão, recusa número fora do app sem assinar a conta", async () => {
    const chamadas = metaFalsa({
      debug_token: { data: { granular_scopes: [{ scope: "whatsapp_business_management", target_ids: ["111"] }] } },
      "222": { display_phone_number: "+55 54 99999-0000", is_on_biz_app: false, platform_type: "CLOUD_API" },
    });
    await expect(conectarNumero(executar, { codigo: fimDoFluxo.codigo })).rejects.toThrow(/app WhatsApp Business/);
    expect(chamadas.map((c) => c.caminho)).not.toContain("111/subscribed_apps");
    expect(await listarConexoes(tx)).toHaveLength(0);
  });

  it("sem o aviso da sessão, não escolhe entre contas", async () => {
    metaFalsa({ debug_token: { data: { granular_scopes: [{ scope: "whatsapp_business_management", target_ids: ["111", "444"] }] } } });
    await expect(conectarNumero(executar, { codigo: fimDoFluxo.codigo })).rejects.toThrow(/qual conta/);
  });

  it("recusa número novo (fora da coexistência) sem chamar a Meta", async () => {
    const chamadas = metaFalsa();
    await expect(conectarNumero(executar, { ...fimDoFluxo, evento: "FINISH" })).rejects.toThrow(/coexistência/);
    expect(chamadas).toHaveLength(0);
  });

  it("sincroniza contatos uma vez, desfaz a marca se a Meta recusar e respeita as 24 horas", async () => {
    metaFalsa();
    const { id } = await conectarNumero(executar, fimDoFluxo);
    const chamadas = metaFalsa();
    expect(await sincronizar(executar, id, "contatos")).toBe("pedido-1");
    expect(chamadas.at(-1)).toMatchObject({ caminho: "222/smb_app_data", corpo: { messaging_product: "whatsapp", sync_type: "smb_app_state_sync" } });
    await expect(sincronizar(executar, id, "contatos")).rejects.toThrow(/Já foi pedido/);

    metaFalsa({ "222/smb_app_data": Response.json({ error: { message: "temporário" } }, { status: 500 }) });
    await expect(sincronizar(executar, id, "historico")).rejects.toThrow(/temporário/);
    metaFalsa();
    expect(await sincronizar(executar, id, "historico")).toBe("pedido-1");

    await tx.query("update crm.conexao_whatsapp set conectada_em = now() - interval '25 hours', sinc_contatos_em = null");
    await expect(sincronizar(executar, id, "contatos")).rejects.toThrow(/24 horas/);
  });

  it("envia o teste pela API com a permissão do cliente", async () => {
    metaFalsa();
    const { id } = await conectarNumero(executar, fimDoFluxo);
    const chamadas = metaFalsa();
    expect(await enviarTeste(executar, id, "+55 (54) 98888-7777", "Olá")).toBe("wamid.TESTE");
    expect(chamadas[0]).toMatchObject({
      caminho: "222/messages", autorizacao: `Bearer ${TOKEN}`,
      corpo: { messaging_product: "whatsapp", to: "5554988887777", type: "text", text: { body: "Olá", preview_url: false } },
    });
  });
});

describe("o número da própria Shift em coexistência", () => {
  it("assina a conta sem desviar os avisos, fica marcado e não sincroniza", async () => {
    const chamadas = metaFalsa();
    const { id } = await conectarNumero(executar, { ...fimDoFluxo, numeroDaShift: true });
    expect(chamadas[2]).toMatchObject({ caminho: "111/subscribed_apps", metodo: "POST", corpo: undefined });
    expect((await listarConexoes(tx))[0]).toMatchObject({ numeroDaShift: true, phoneNumberId: "222" });
    await expect(sincronizar(executar, id, "historico")).rejects.toThrow(/número da Shift/);

    metaFalsa({ "333": { display_phone_number: "+55 54 90000-0000" }, "111/subscribed_apps": { success: true } });
    await conectarNumero(executar, { ...fimDoFluxo, phoneNumberId: "333", numeroDaShift: true });
    expect((await listarConexoes(tx)).filter((c) => c.numeroDaShift).map((c) => c.phoneNumberId)).toEqual(["333"]);
  });

  it("resposta pelo app entra na conversa como humana, uma vez, e pausa o agente", async () => {
    vi.stubEnv("WHATSAPP_META_PHONE_NUMBER_ID", "222");
    const contato = await leads.iniciarAtendimentoWhatsApp(tx, "5554988887777");
    const eco = (id: string, para: string) => JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "111", changes: [{
      field: "smb_message_echoes", value: { messaging_product: "whatsapp", metadata: { phone_number_id: "222" }, message_echoes: [{
        from: "5554900000000", to: para, id, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "Oi, aqui é o Bruno!" },
      }] },
    }] }] });
    const enviar = (corpo: string) => POST_PRINCIPAL(new Request("https://crm.exemplo.com/api/whatsapp/webhook", {
      method: "POST", body: corpo,
      headers: { "x-hub-signature-256": `sha256=${createHmac("sha256", "segredo-do-app").update(corpo).digest("hex")}` },
    }));

    expect((await enviar(eco("wamid.APP1", "5554988887777"))).status).toBe(200);
    expect((await enviar(eco("wamid.APP1", "5554988887777"))).status).toBe(200);
    expect((await enviar(eco("wamid.APP2", "5554911112222"))).status).toBe(200);

    expect(await leads.listarMensagensWhatsApp(tx, contato.leadId)).toMatchObject([{ autor: "humano", texto: "Oi, aqui é o Bruno!", estado: "enviado" }]);
    expect(await leads.buscarAtendimentoWhatsApp(tx, "5554988887777")).toMatchObject({ modo: "humano" });
    expect(await leads.buscarAtendimentoWhatsApp(tx, "5554911112222")).toBeNull();
  });
});

describe("avisos dos números conectados", () => {
  const aviso = (changes: { field: string; value: unknown }[], id = "111") =>
    ({ object: "whatsapp_business_account", entry: [{ id, changes }] });

  it("conta por tipo, sem guardar conteúdo, e ignora números que não estão conectados", async () => {
    metaFalsa();
    await conectarNumero(executar, fimDoFluxo);
    const corpo = aviso([
      { field: "smb_message_echoes", value: { metadata: { phone_number_id: "222" }, message_echoes: [{ text: { body: "CONTEÚDO PRIVADO" } }] } },
      { field: "smb_message_echoes", value: { metadata: { phone_number_id: "222" } } },
      { field: "history", value: { metadata: { phone_number_id: "222" } } },
      { field: "account_update", value: { event: "PARTNER_ADDED" } },
      { field: "messages", value: { metadata: { phone_number_id: "999" } } },
    ]);
    expect(await registrarAvisos(tx, corpo)).toBe(2);
    const [conexao] = await listarConexoes(tx);
    expect(conexao.eventos).toEqual({ smb_message_echoes: 2, history: 1, account_update: 1 });
    expect(JSON.stringify(await tx.query("select * from crm.conexao_whatsapp"))).not.toContain("CONTEÚDO PRIVADO");
  });

  it("o webhook separado exige a assinatura da Meta e responde ao desafio", async () => {
    metaFalsa();
    await conectarNumero(executar, fimDoFluxo);
    const corpo = JSON.stringify(aviso([{ field: "smb_message_echoes", value: { metadata: { phone_number_id: "222" } } }]));
    const url = "https://crm.exemplo.com/api/whatsapp/conexoes/webhook";
    const assinar = (segredo: string) => `sha256=${createHmac("sha256", segredo).update(corpo).digest("hex")}`;

    expect((await POST(new Request(url, { method: "POST", headers: { "x-hub-signature-256": assinar("errado") }, body: corpo }))).status).toBe(401);
    const ok = await POST(new Request(url, { method: "POST", headers: { "x-hub-signature-256": assinar("segredo-do-app") }, body: corpo }));
    expect(await ok.json()).toEqual({ conexoes: 1 });

    const desafio = `${url}?hub.mode=subscribe&hub.verify_token=token-de-verificacao&hub.challenge=abc`;
    expect(await (await GET(new Request(desafio))).text()).toBe("abc");
    expect((await GET(new Request(desafio.replace("token-de-verificacao", "outro")))).status).toBe(403);
  });
});
