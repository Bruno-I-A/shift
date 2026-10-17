import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as leads from "@/lib/leads";
import {
  contarVariaveis, criarModeloMeta, enviarModeloMeta, listarModelosMeta, renderizarModelo, validarNovoModelo,
} from "@/lib/modelos-whatsapp";
import { enviarModeloHumano } from "@/lib/whatsapp-manual";

import { bancoDeTeste } from "./banco-de-teste";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

function configurarMeta() {
  vi.stubEnv("WHATSAPP_META_ACCESS_TOKEN", "token-de-teste");
  vi.stubEnv("WHATSAPP_META_PHONE_NUMBER_ID", "1111");
  vi.stubEnv("WHATSAPP_META_WABA_ID", "22222");
  vi.stubEnv("WHATSAPP_META_GRAPH_VERSION", "v23.0");
}

/** Guarda o que foi enviado à Meta e responde com `corpo`. */
function metaResponde(corpo: unknown, status = 200) {
  const chamadas: { url: string; corpo: unknown }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, opcoes?: RequestInit) => {
    chamadas.push({ url, corpo: opcoes?.body ? JSON.parse(String(opcoes.body)) : undefined });
    return Response.json(corpo, { status });
  }));
  return chamadas;
}

describe("regras do modelo (antes de mandar para a Meta)", () => {
  it("conta variáveis e exige a sequência sem buraco", () => {
    expect(contarVariaveis("Oi, {{1}}! Seu projeto {{2}} mudou. Até mais, {{1}}.")).toBe(2);
    expect(contarVariaveis("Sem variável.")).toBe(0);
    expect(() => contarVariaveis("Oi {{1}}, veja {{3}}.")).toThrow(/sem pular/);
  });

  it("monta o texto como o cliente recebe", () => {
    expect(renderizarModelo("Oi, {{1}}! O {{2}} está pronto.", ["Olivan", "funil"])).toBe("Oi, Olivan! O funil está pronto.");
  });

  it("aceita um modelo de utilidade bem formado", () => {
    const modelo = validarNovoModelo({
      nome: "atualizacao_projeto", categoria: "UTILITY",
      texto: "Oi, {{1}}! Seu projeto passou para a fase de testes. Quer ver como ficou?", exemplos: ["Olivan"],
    });
    expect(modelo.exemplos).toEqual(["Olivan"]);
  });

  it.each([
    [{ nome: "Atualização", categoria: "UTILITY", texto: "Oi.", exemplos: [] }, /minúsculas/],
    [{ nome: "x", categoria: "UTILITY", texto: "{{1}}, seu projeto mudou.", exemplos: ["Ana"] }, /começa ou termina/],
    [{ nome: "x", categoria: "UTILITY", texto: "Seu projeto mudou, {{1}}.", exemplos: ["Ana"] }, /começa ou termina/],
    [{ nome: "x", categoria: "UTILITY", texto: "Oi {{1}} {{2}}, tudo bem?", exemplos: ["Ana", "Silva"] }, /seguidas/],
    [{ nome: "x", categoria: "UTILITY", texto: "Oi {{1}}, tudo bem?", exemplos: [] }, /exemplo/],
    [{ nome: "x", categoria: "AUTHENTICATION", texto: "Oi.", exemplos: [] }, /categoria/],
  ])("recusa o que a Meta recusaria (%#)", (entrada, erro) => {
    expect(() => validarNovoModelo(entrada)).toThrow(erro);
  });
});

describe("chamadas à Meta", () => {
  beforeEach(configurarMeta);

  it("cria o modelo em português, com os exemplos das variáveis", async () => {
    const chamadas = metaResponde({ id: "999", status: "PENDING", category: "UTILITY" });
    expect(await criarModeloMeta({
      nome: "atualizacao_projeto", categoria: "UTILITY", texto: "Oi, {{1}}! Seu projeto mudou de fase. Quer ver?", exemplos: ["Olivan"],
    })).toEqual({ id: "999", status: "PENDING" });
    expect(chamadas[0].url).toBe("https://graph.facebook.com/v23.0/22222/message_templates");
    expect(chamadas[0].corpo).toEqual({
      name: "atualizacao_projeto", language: "pt_BR", category: "UTILITY",
      components: [{ type: "BODY", text: "Oi, {{1}}! Seu projeto mudou de fase. Quer ver?", example: { body_text: [["Olivan"]] } }],
    });
  });

  it("envia o modelo com os parâmetros na ordem", async () => {
    const chamadas = metaResponde({ messages: [{ id: "wamid.MODELO" }] });
    expect(await enviarModeloMeta("5554999991234", { nome: "atualizacao_projeto", idioma: "pt_BR" }, ["Olivan"])).toBe("wamid.MODELO");
    expect(chamadas[0].url).toBe("https://graph.facebook.com/v23.0/1111/messages");
    expect(chamadas[0].corpo).toEqual({
      messaging_product: "whatsapp", to: "5554999991234", type: "template",
      template: { name: "atualizacao_projeto", language: { code: "pt_BR" }, components: [{ type: "body", parameters: [{ type: "text", text: "Olivan" }] }] },
    });
  });

  it("lista os modelos com o texto do corpo e o número de variáveis", async () => {
    metaResponde({ data: [{
      id: "1", name: "atualizacao_projeto", status: "APPROVED", category: "UTILITY", language: "pt_BR",
      components: [{ type: "HEADER", text: "Shift" }, { type: "BODY", text: "Oi, {{1}}! O {{2}} mudou de fase." }],
    }] });
    expect(await listarModelosMeta()).toEqual([{
      id: "1", nome: "atualizacao_projeto", categoria: "UTILITY", idioma: "pt_BR", status: "APPROVED",
      texto: "Oi, {{1}}! O {{2}} mudou de fase.", variaveis: 2,
    }]);
  });

  it("explica a falta do ID da conta e a falta de permissão", async () => {
    vi.stubEnv("WHATSAPP_META_WABA_ID", "");
    await expect(listarModelosMeta()).rejects.toThrow(/WHATSAPP_META_WABA_ID/);
    configurarMeta();
    metaResponde({ error: { message: "(#200) Permissions error" } }, 403);
    await expect(listarModelosMeta()).rejects.toThrow(/whatsapp_business_management/);
  });
});

describe("envio de modelo pelo painel", () => {
  it("fora da janela registra o texto que o cliente recebe, assume a conversa e não envia duas vezes", async () => {
    const { tx } = await bancoDeTeste();
    const executar = <T,>(trabalho: (t: typeof tx) => Promise<T>) => trabalho(tx);
    const contato = await leads.autorizarAtendimentoWhatsApp(tx, "5554999991234");
    await leads.registrarMensagemRecebidaWhatsApp(tx, contato.leadId, {
      id: "ANTIGA", texto: "Oi", recebidoEm: new Date(Date.now() - 30 * 3600_000),
    });
    const enviar = vi.fn(async () => "wamid.MODELO");
    const entrada = {
      leadId: contato.leadId, pedidoId: "6f1f7b0e-3a5d-4c2b-9d8e-1a2b3c4d5e6f",
      modelo: { nome: "atualizacao_projeto", idioma: "pt_BR", texto: "Oi, {{1}}! Seu projeto mudou de fase. Quer ver?" },
      parametros: ["Olivan"],
    };

    expect(await enviarModeloHumano(executar, enviar, entrada)).toMatchObject({ estado: "enviado" });
    expect(await enviarModeloHumano(executar, enviar, entrada)).toMatchObject({ estado: "ja_registrado" });
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar).toHaveBeenCalledWith("5554999991234", { nome: "atualizacao_projeto", idioma: "pt_BR", texto: entrada.modelo.texto }, ["Olivan"]);

    const mensagens = await leads.listarMensagensWhatsApp(tx, contato.leadId);
    expect(mensagens.at(-1)).toMatchObject({ autor: "humano", texto: "Oi, Olivan! Seu projeto mudou de fase. Quer ver?", estado: "enviado" });
    expect(await leads.buscarAtendimentoWhatsApp(tx, contato.whatsapp)).toMatchObject({ modo: "humano" });
  });

  it("não envia com variável em branco nem para quem não é contato", async () => {
    const { tx } = await bancoDeTeste();
    const executar = <T,>(trabalho: (t: typeof tx) => Promise<T>) => trabalho(tx);
    const enviar = vi.fn(async () => "wamid.X");
    const modelo = { nome: "atualizacao_projeto", idioma: "pt_BR", texto: "Oi, {{1}}! Tudo certo?" };
    await expect(enviarModeloHumano(executar, enviar, {
      leadId: "6f1f7b0e-3a5d-4c2b-9d8e-1a2b3c4d5e6f", pedidoId: "7f1f7b0e-3a5d-4c2b-9d8e-1a2b3c4d5e6f", modelo, parametros: [" "],
    })).rejects.toThrow(/variáveis/);
    await expect(enviarModeloHumano(executar, enviar, {
      leadId: "6f1f7b0e-3a5d-4c2b-9d8e-1a2b3c4d5e6f", pedidoId: "7f1f7b0e-3a5d-4c2b-9d8e-1a2b3c4d5e6f", modelo, parametros: ["Ana"],
    })).rejects.toThrow(/atendimento/);
    expect(enviar).not.toHaveBeenCalled();
  });
});
