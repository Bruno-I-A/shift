import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Consulta } from "@/lib/consulta";
import { buscarConhecimento } from "@/lib/conhecimento-shift";
import * as leads from "@/lib/leads";
import { decidirConsentimentoWhatsApp, enviarTextoEvolution, lerMensagemDaShiftEvolution, lerMensagemEvolution } from "@/lib/whatsapp";

import { bancoDeTeste } from "./banco-de-teste";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const analise = {
  resposta: "Podemos começar pelo processo mais repetitivo da sua empresa.",
  nome: "Ana", empresa: "Indústria Ana", segmento: "Indústria", dor: "Conferência de pedidos",
  prazo: "Este mês", resumo: "Quer automatizar a conferência de pedidos.", passarParaHumano: false,
};

describe("ponte Evolution e base de conhecimento", () => {
  const evento = {
    event: "messages.upsert", instance: "shift", data: {
      key: { id: "ABC1", remoteJid: "5554999991234@s.whatsapp.net", fromMe: false },
      messageTimestamp: Math.floor(Date.now() / 1000),
      message: { conversation: "Vocês atendem indústrias?" },
    },
  };

  it("aceita apenas mensagem de texto da instância e contato corretos", () => {
    expect(lerMensagemEvolution(evento, "shift")).toEqual({ id: "ABC1", whatsapp: "5554999991234", texto: "Vocês atendem indústrias?" });
    expect(lerMensagemEvolution(evento, "outra")).toBeNull();
    expect(lerMensagemEvolution({ ...evento, data: { ...evento.data, key: { ...evento.data.key, fromMe: true } } }, "shift")).toBeNull();
    expect(lerMensagemDaShiftEvolution({ ...evento, data: { ...evento.data, key: { ...evento.data.key, fromMe: true } } }, "shift")?.texto).toBe("Vocês atendem indústrias?");
    expect(lerMensagemDaShiftEvolution({ ...evento, data: { ...evento.data, key: { ...evento.data.key, fromMe: true }, message: { imageMessage: {} } } }, "shift")?.texto).toBe("");
    expect(lerMensagemEvolution({ ...evento, data: { ...evento.data, key: { ...evento.data.key, remoteJid: "123@g.us" } } }, "shift")).toBeNull();
    expect(lerMensagemEvolution({ ...evento, data: { ...evento.data, messageTimestamp: 1700000000 } }, "shift")).toBeNull();
    expect(lerMensagemEvolution({ ...evento, data: { ...evento.data, key: { ...evento.data.key, remoteJid: "123@lid", remoteJidAlt: "5554999991234@s.whatsapp.net" } } }, "shift")?.whatsapp).toBe("5554999991234");
  });

  it("encontra conteúdo publicado da Shift sobre o setor perguntado", () => {
    const trechos = buscarConhecimento("Vocês trabalham com indústria?");
    expect(trechos[0].texto).toMatch(/indústria/i);
    expect(trechos[0].fonte).toMatch(/^https:\/\/shiftsys\.com\.br/);
    expect(buscarConhecimento("Qual é o preço exato de R$ 123?", 1)).toEqual([]);
  });

  it("um SIM solto não autoriza; exige aviso anterior e ignora webhooks repetidos", () => {
    const agora = Date.now();
    const mensagem = { id: "SIM1", texto: "SIM" };
    expect(decidirConsentimentoWhatsApp(null, mensagem, agora)).toBe("avisar");
    const aviso = { mensagemId: "AVISO1", enviadoEm: new Date(agora - 1000) };
    expect(decidirConsentimentoWhatsApp(aviso, mensagem, agora)).toBe("autorizar");
    expect(decidirConsentimentoWhatsApp(aviso, { id: "AVISO1", texto: "Oi" }, agora)).toBe("ignorar");
    expect(decidirConsentimentoWhatsApp({ ...aviso, mensagemId: "SIM1" }, mensagem, agora)).toBe("ignorar");
    expect(decidirConsentimentoWhatsApp({ ...aviso, enviadoEm: new Date(agora - 2 * 86_400_000) }, mensagem, agora)).toBe("avisar");
  });

  it("envia texto à instância configurada com tempo de digitação", async () => {
    vi.stubEnv("EVOLUTION_URL", "http://evolution:8080");
    vi.stubEnv("EVOLUTION_API_KEY", "teste");
    vi.stubEnv("EVOLUTION_INSTANCIA", "shift");
    const chamadas: { url: string | URL; opcoes: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string | URL, opcoes: RequestInit) => {
      chamadas.push({ url, opcoes });
      return new Response("{}", { status: 200 });
    });
    await enviarTextoEvolution("5554999991234", "Olá, Shift!");
    expect(String(chamadas[0].url)).toBe("http://evolution:8080/message/sendText/shift");
    expect(JSON.parse(String(chamadas[0].opcoes.body))).toMatchObject({ number: "5554999991234", text: "Olá, Shift!", delay: 440 });
  });
});

describe("qualificação pelo WhatsApp", () => {
  let tx: Consulta;
  beforeEach(async () => { ({ tx } = await bancoDeTeste()); });

  it("registra somente uma chave pseudonimizada do aviso antes da autorização", async () => {
    const chave = "a".repeat(64);
    expect(await leads.buscarAvisoWhatsApp(tx, chave)).toBeNull();
    await leads.registrarAvisoWhatsApp(tx, chave, "ABC0");
    expect(await leads.buscarAvisoWhatsApp(tx, chave)).toMatchObject({ mensagemId: "ABC0" });
    expect(await leads.listarLeads(tx)).toHaveLength(0);
    await leads.apagarAvisoWhatsApp(tx, chave);
    expect(await leads.buscarAvisoWhatsApp(tx, chave)).toBeNull();
  });

  it("cria lead só após autorização, qualifica e não processa o mesmo evento duas vezes", async () => {
    expect(await leads.buscarAtendimentoWhatsApp(tx, "5554999991234")).toBeNull();
    const atendimento = await leads.autorizarAtendimentoWhatsApp(tx, "5554999991234");
    expect(await leads.autorizarAtendimentoWhatsApp(tx, "5554999991234")).toMatchObject({ leadId: atendimento.leadId });
    expect(await leads.registrarRespostaWhatsApp(tx, atendimento, "ABC1", analise)).toBe(true);
    expect(await leads.registrarRespostaWhatsApp(tx, atendimento, "ABC1", analise)).toBe(false);
    await leads.marcarEnvioWhatsApp(tx, "ABC1", true);
    const [lead] = await leads.listarLeads(tx);
    expect(lead).toMatchObject({ nome: "Ana", empresa: "Indústria Ana", dor: "Conferência de pedidos", etapa: "qualificado", enviosPendentes: 0 });
    expect(lead.respostas.prazo).toBe("Este mês");
    expect((await leads.listarLeads(tx)).length).toBe(1);
  });

  it("permite a tomada humana e mostra falha de envio para acompanhamento", async () => {
    const atendimento = await leads.autorizarAtendimentoWhatsApp(tx, "5554999991234");
    await leads.registrarRespostaWhatsApp(tx, atendimento, "ABC2", { ...analise, passarParaHumano: true });
    await leads.marcarEnvioWhatsApp(tx, "ABC2", false);
    expect(await leads.buscarAtendimentoWhatsApp(tx, atendimento.whatsapp)).toMatchObject({ modo: "humano" });
    expect((await leads.listarLeads(tx))[0].enviosPendentes).toBe(1);
    await leads.mudarModoAtendimentoWhatsApp(tx, atendimento.leadId, "agente");
    expect(await leads.buscarAtendimentoWhatsApp(tx, atendimento.whatsapp)).toMatchObject({ modo: "agente" });
  });

  it("pausa ao detectar resposta manual, mas ignora o eco de uma resposta do agente", async () => {
    const atendimento = await leads.autorizarAtendimentoWhatsApp(tx, "5554999991234");
    await leads.registrarRespostaWhatsApp(tx, atendimento, "ABC3", analise);
    expect(await leads.pausarSeRespostaHumana(tx, atendimento.whatsapp, analise.resposta)).toBe(false);
    expect(await leads.pausarSeRespostaHumana(tx, atendimento.whatsapp, "Vou verificar isso para você.")).toBe(true);
    expect(await leads.buscarAtendimentoWhatsApp(tx, atendimento.whatsapp)).toMatchObject({ modo: "humano" });
  });

  it("um contato que volta após Ganho inicia novo lead com novo consentimento", async () => {
    const primeiro = await leads.autorizarAtendimentoWhatsApp(tx, "5554999991234");
    await leads.mudarEtapaDoLead(tx, primeiro.leadId, "ganho", "bruno");
    const anterior = await leads.buscarAtendimentoWhatsApp(tx, primeiro.whatsapp);
    expect(anterior?.etapa).toBe("ganho");
    const segundo = await leads.autorizarAtendimentoWhatsApp(tx, primeiro.whatsapp);
    expect(segundo.leadId).not.toBe(primeiro.leadId);
    expect((await leads.listarLeads(tx)).map((lead) => lead.etapa).sort()).toEqual(["ganho", "novo"]);
  });
});
