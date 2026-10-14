import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Consulta } from "@/lib/consulta";
import { buscarConhecimento } from "@/lib/conhecimento-shift";
import { analisarAtendimento } from "@/lib/ia-atendimento";
import * as leads from "@/lib/leads";
import { decidirConsentimentoWhatsApp, enviarTextoMeta, lerMensagensMeta } from "@/lib/whatsapp";

import { bancoDeTeste } from "./banco-de-teste";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const analise = {
  resposta: "Podemos começar pelo processo mais repetitivo da sua empresa.",
  nome: "Ana", empresa: "Indústria Ana", segmento: "Indústria", dor: "Conferência de pedidos",
  prazo: "Este mês", resumo: "Quer automatizar a conferência de pedidos.", passarParaHumano: false,
};

describe("ponte oficial da Meta e base de conhecimento", () => {
  const evento = {
    object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: {
      metadata: { phone_number_id: "123456" }, messages: [{
        from: "5554999991234", id: "wamid.ABC1", timestamp: Math.floor(Date.now() / 1000),
        type: "text", text: { body: "Vocês atendem indústrias?" },
      }],
    } }] }],
  };

  it("aceita apenas texto recente destinado ao número oficial", () => {
    expect(lerMensagensMeta(evento, "123456")).toEqual([{ id: "wamid.ABC1", whatsapp: "5554999991234", texto: "Vocês atendem indústrias?" }]);
    expect(lerMensagensMeta(evento, "outro")).toEqual([]);
    const imagem = structuredClone(evento);
    imagem.entry[0].changes[0].value.messages[0].type = "image";
    expect(lerMensagensMeta(imagem, "123456")).toEqual([]);
    const antiga = structuredClone(evento);
    antiga.entry[0].changes[0].value.messages[0].timestamp = 1700000000;
    expect(lerMensagensMeta(antiga, "123456")).toEqual([]);
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

  it("envia texto pela Cloud API com o número configurado", async () => {
    vi.stubEnv("WHATSAPP_META_ACCESS_TOKEN", "teste");
    vi.stubEnv("WHATSAPP_META_PHONE_NUMBER_ID", "123456");
    vi.stubEnv("WHATSAPP_META_GRAPH_VERSION", "v24.0");
    const chamadas: { url: string | URL; opcoes: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string | URL, opcoes: RequestInit) => {
      chamadas.push({ url, opcoes });
      return new Response("{}", { status: 200 });
    });
    await enviarTextoMeta("5554999991234", "Olá, Shift!");
    expect(String(chamadas[0].url)).toBe("https://graph.facebook.com/v24.0/123456/messages");
    expect(chamadas[0].opcoes.headers).toMatchObject({ Authorization: "Bearer teste" });
    expect(JSON.parse(String(chamadas[0].opcoes.body))).toMatchObject({ messaging_product: "whatsapp", to: "5554999991234", type: "text", text: { body: "Olá, Shift!" } });
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

  it("lembra os dados salvos e a última resposta entregue, sem misturar contatos", async () => {
    const atendimento = await leads.autorizarAtendimentoWhatsApp(tx, "5554999991234");
    expect(atendimento.nome).toBe("");
    await leads.registrarRespostaWhatsApp(tx, atendimento, "MEM1", {
      ...analise, nome: "Ana Maria", resposta: "Ana, em que sistema vocês conferem os pedidos?",
    });
    await leads.marcarEnvioWhatsApp(tx, "MEM1", true);
    // Uma tentativa que não foi entregue não pode virar a pergunta anterior.
    await leads.registrarRespostaWhatsApp(tx, atendimento, "MEM2", { ...analise, nome: "", resposta: "Qual o prazo?", resumo: "" });
    await leads.marcarEnvioWhatsApp(tx, "MEM2", false);
    const memoria = (await leads.buscarAtendimentoWhatsApp(tx, atendimento.whatsapp))!;
    expect(memoria).toMatchObject({
      nome: "Ana Maria", empresa: "Indústria Ana", segmento: "Indústria", dor: "Conferência de pedidos",
      prazo: "Este mês", resumo: analise.resumo, ultimaResposta: "Ana, em que sistema vocês conferem os pedidos?",
    });

    vi.stubEnv("ANTHROPIC_API_KEY", "teste");
    vi.stubEnv("ANTHROPIC_MODEL", "modelo-de-teste");
    vi.stubGlobal("fetch", async (_url: string, opcoes: RequestInit) => {
      const texto = JSON.parse(String(opcoes.body)).messages[0].content;
      expect(texto).toContain('"nome":"Ana Maria"');
      expect(texto).toContain('"empresa":"Indústria Ana"');
      expect(texto).toContain("em que sistema vocês conferem os pedidos?");
      expect(texto).not.toContain(memoria.whatsapp);
      return Response.json({ content: [{ type: "tool_use", name: "registrar_atendimento", input: {
        ...analise, nome: "", empresa: "", segmento: "", dor: "", prazo: "",
        resposta: "Entendi. Como vocês organizam essa conferência na planilha?",
        resumo: "Quer automatizar a conferência de pedidos; hoje usa Excel.",
      } }] });
    });
    const proxima = await analisarAtendimento("Usamos Excel", memoria);
    await leads.registrarRespostaWhatsApp(tx, memoria, "MEM3", proxima);
    expect(await leads.buscarAtendimentoWhatsApp(tx, memoria.whatsapp)).toMatchObject({
      nome: "Ana Maria", empresa: "Indústria Ana", resumo: proxima.resumo,
    });
    const outro = await leads.autorizarAtendimentoWhatsApp(tx, "5554988885678");
    expect(outro).toMatchObject({ nome: "", empresa: null, resumo: "", ultimaResposta: "" });
  });

  it("aceita correções explícitas e preserva campos não atualizados", async () => {
    const atendimento = await leads.autorizarAtendimentoWhatsApp(tx, "5554999991234");
    await leads.registrarRespostaWhatsApp(tx, atendimento, "COR1", analise);
    await leads.registrarRespostaWhatsApp(tx, atendimento, "COR2", {
      ...analise, nome: "Ana Maria", empresa: "Indústria Nova", dor: "Conferência de notas",
      segmento: "", prazo: "", resumo: "Quer automatizar a conferência de notas da Indústria Nova.",
    });
    expect(await leads.buscarAtendimentoWhatsApp(tx, atendimento.whatsapp)).toMatchObject({
      nome: "Ana Maria", empresa: "Indústria Nova", dor: "Conferência de notas", segmento: "Indústria", prazo: "Este mês",
    });
    await leads.registrarRespostaWhatsApp(tx, atendimento, "COR3", {
      ...analise, nome: "", empresa: "", segmento: "", dor: "", prazo: "", resumo: "",
    });
    expect(await leads.buscarAtendimentoWhatsApp(tx, atendimento.whatsapp)).toMatchObject({
      nome: "Ana Maria", empresa: "Indústria Nova", resumo: "Quer automatizar a conferência de notas da Indústria Nova.",
    });
  });

  it("reaproveita a identificação do diagnóstico ao autorizar o WhatsApp", async () => {
    const { id } = await leads.receberLead(tx, {
      nome: "Ana Maria", empresa: "Indústria Ana", whatsapp: "5554999991234", respostas: { segmento: "Indústria", prazo: "Este mês" },
      nivel: null, oferta: null, processo: null, origem: "site",
    });
    expect(await leads.autorizarAtendimentoWhatsApp(tx, "5554999991234")).toMatchObject({
      leadId: id, nome: "Ana Maria", empresa: "Indústria Ana", segmento: "Indústria", prazo: "Este mês",
    });
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
