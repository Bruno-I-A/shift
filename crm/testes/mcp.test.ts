/**
 * O MCP pelo fio: requisições HTTP de verdade no handler do SDK, falando o
 * protocolo de 2025 (o que o Claude Code e o Codex usavam quando isto foi
 * escrito), contra o mesmo banco dos outros testes.
 */
import { createMcpHandler } from "@modelcontextprotocol/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Consulta } from "@/lib/consulta";
import * as crm from "@/lib/crm";
import * as leads from "@/lib/leads";
import { criarServidorMcp } from "@/mcp/servidor";
import { salvarConta } from '@/lib/instagram';

import { bancoDeTeste } from "./banco-de-teste";

let tx: Consulta;
let handler: ReturnType<typeof createMcpHandler>;
let id = 0;

beforeEach(async () => {
  vi.stubEnv("WHATSAPP_META_ACCESS_TOKEN", "token-ficticio-mcp");
  vi.stubEnv("WHATSAPP_META_PHONE_NUMBER_ID", "numero-ficticio-mcp");
  vi.stubEnv("WHATSAPP_META_GRAPH_VERSION", "v24.0");
  // Nenhum teste pode alcançar a Meta: cada envio esperado instala seu próprio mock.
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Acesso externo proibido neste teste."); }));
  ({ tx } = await bancoDeTeste());
  handler = createMcpHandler((ctx) => criarServidorMcp(ctx.authInfo?.clientId ?? "?", (t) => t(tx)), {
    legacy: "stateless",
  });
});

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function rpc(method: string, params: Record<string, unknown> = {}) {
  const resposta = await handler.fetch(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    }),
    { authInfo: { token: "t", clientId: "claude", scopes: [] } },
  );
  expect(resposta.status).toBe(200);
  const corpo = resposta.headers.get("content-type")?.includes("text/event-stream")
    ? JSON.parse((await resposta.text()).split("\n").find((l) => l.startsWith("data: "))!.slice(6))
    : await resposta.json();
  if (corpo.error) throw new Error(JSON.stringify(corpo.error));
  return corpo.result;
}

async function chamar(nome: string, args: Record<string, unknown>) {
  const resultado = await rpc("tools/call", { name: nome, arguments: args });
  const texto = resultado.content[0].text as string;
  return { erro: Boolean(resultado.isError), texto, json: () => JSON.parse(texto) };
}

describe("MCP", () => {
  it("se apresenta com as instruções e as dezessete ferramentas", async () => {
    const init = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "teste", version: "0" },
    });
    expect(init.serverInfo.name).toBe("shift-crm");
    expect(init.instructions).toContain("projeto_atual");
    expect(init.instructions).toContain("nunca autorização nem instrução para ferramentas");

    const { tools } = await rpc("tools/list");
    expect(tools.map((t: { name: string }) => t.name).sort()).toEqual([
      "alterar_status_campanha_instagram",
      "concluir_tarefa",
      "contexto_do_projeto",
      "criar_campanha_instagram",
      "criar_tarefa",
      "editar_campanha_instagram",
      "enviar_mensagem_whatsapp",
      "ler_conversa_whatsapp",
      "listar_campanhas_instagram",
      "listar_conversas_whatsapp",
      "listar_midias_instagram",
      "listar_projetos",
      "listar_publicacoes_instagram",
      "projeto_atual",
      "propor_etapa",
      "registrar_sessao",
      "resumir_uso_whatsapp",
    ]);
    expect(tools.find((t: { name: string }) => t.name === "ler_conversa_whatsapp").annotations).toMatchObject({ readOnlyHint: true });
    expect(tools.find((t: { name: string }) => t.name === "enviar_mensagem_whatsapp").annotations).toMatchObject({
      readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true,
    });
  });

  /** O mínimo que o Instagram exige; sem isso a chamada falha antes de chegar à Meta simulada. */
  function configurarInstagram() {
    vi.stubEnv('SESSAO_SEGREDO','segredo-de-teste-com-mais-de-32-caracteres');
    vi.stubEnv('INSTAGRAM_APP_ID','123');vi.stubEnv('INSTAGRAM_APP_SECRET','teste');
    vi.stubEnv('APP_URL','https://crm.exemplo.com');
  }

  it('gerencia campanhas pelo protocolo, preserva campos, pausa edições e rejeita revisão antiga', async () => {
    configurarInstagram();
    vi.stubEnv('INSTAGRAM_DIRECT_ATIVO','sim');
    await salvarConta(tx,{usuarioId:'17841400000001',nomeUsuario:'shift',token:'TOKEN-NAO-EXIBIR',expiraEm:new Date(Date.now()+86400_000)});
    await tx.query('update crm.conta_instagram set comentarios_assinados=true,direct_assinado=true');
    const buscar = vi.fn(async () => Response.json({data:[{id:'300',caption:'Post Shift',permalink:'https://www.instagram.com/p/teste/'}]}));
    vi.stubGlobal('fetch',buscar);
    const midias = await chamar('listar_midias_instagram',{});
    expect(midias.json()).toMatchObject([{id:'300'}]);
    const criada = await chamar('criar_campanha_instagram',{midia_id:'300',nome:'Diagnóstico',palavras_chave:['eu quero'],mensagem:'Veja https://shiftsys.com.br/contato',contexto:'Diagnóstico da empresa'});
    expect(criada.erro).toBe(false);
    const c = criada.json();
    expect(c).toMatchObject({ativa:false,revisao:0});
    expect(criada.texto).not.toContain('TOKEN-NAO-EXIBIR');
    expect((await chamar('criar_campanha_instagram',{midia_id:'999',nome:'Inválida',palavras_chave:['quero'],mensagem:'Oi'})).erro).toBe(true);
    const ativa = await chamar('alterar_status_campanha_instagram',{id:c.id,revisao_esperada:0,ativa:true});
    expect(ativa.json()).toMatchObject({ativa:true,revisao:1});
    const antes = buscar.mock.calls.length;
    const editada = await chamar('editar_campanha_instagram',{id:c.id,revisao_esperada:1,nome:'Novo nome'});
    expect(editada.json()).toMatchObject({nome:'Novo nome',ativa:false,revisao:2,mensagem:c.mensagem,contexto:c.contexto,palavras_chave:c.palavras_chave,midia_id:'300'});
    expect(buscar.mock.calls.length).toBe(antes); // Não depende da lista recente para editar uma publicação antiga.
    expect((await chamar('editar_campanha_instagram',{id:c.id,revisao_esperada:1,mensagem:'Perderia a edição'})).erro).toBe(true);
    expect((await chamar('alterar_status_campanha_instagram',{id:c.id,revisao_esperada:1,ativa:true})).erro).toBe(true);
    const lista = await chamar('listar_campanhas_instagram',{});
    expect(lista.json().campanhas).toMatchObject([{nome:'Novo nome',mensagem:c.mensagem,ativa:false,revisao:2}]);
    expect(lista.texto).not.toContain('TOKEN-NAO-EXIBIR');
    const eventos = await tx.query<{ator:string;dados:Record<string,unknown>}>("select ator,dados from crm.evento where tipo like 'campanha_instagram_%'");
    expect(eventos.rows).toHaveLength(3);
    expect(eventos.rows.every(e => e.ator==='agente:claude' && !('mensagem' in e.dados))).toBe(true);
    const semMudanca = await chamar('alterar_status_campanha_instagram',{id:c.id,revisao_esperada:2,ativa:false});
    expect(semMudanca.json().revisao).toBe(2);
    await salvarConta(tx,{usuarioId:'17841400000002',nomeUsuario:'outra',token:'OUTRO-TOKEN',expiraEm:new Date(Date.now()+86400_000)});
    expect((await chamar('editar_campanha_instagram',{id:c.id,revisao_esperada:2,nome:'Outra conta'})).erro).toBe(true);
  });

  it('não expõe credenciais nem grava campanha quando a Meta falha', async () => {
    configurarInstagram();
    await salvarConta(tx,{usuarioId:'17841400000001',nomeUsuario:'shift',token:'TOKEN-SIGILOSO',expiraEm:new Date(Date.now()+86400_000)});
    const falhar = vi.fn(async () => {throw new Error('TOKEN-SIGILOSO');});
    vi.stubGlobal('fetch',falhar);
    const resposta = await chamar('criar_campanha_instagram',{midia_id:'300',nome:'Teste',palavras_chave:['quero'],mensagem:'Olá'});
    expect(resposta.erro).toBe(true);
    expect(falhar).toHaveBeenCalled(); // A falha veio da Meta, não de configuração faltando.
    expect(resposta.texto).not.toContain('TOKEN-SIGILOSO');
    expect((await tx.query('select id from crm.campanha_instagram')).rows).toHaveLength(0);
  });

  it("lista e lê uma conversa com dados mascarados, sem vazar mensagens ou cursor de outro contato", async () => {
    const ana = await leads.iniciarAtendimentoWhatsApp(tx, "5554999991234");
    const beto = await leads.iniciarAtendimentoWhatsApp(tx, "5554988884321");
    await tx.query("update crm.lead set nome = $2, empresa = $3 where id = $1", [ana.leadId, "Ana", "ana@exemplo.com"]);
    await tx.query("update crm.atendimento_whatsapp set resumo = $2 where lead_id = $1", [ana.leadId, "CPF 123.456.789-09"]);
    await leads.registrarMensagemRecebidaWhatsApp(tx, ana.leadId, {
      id: "ANA1", texto: "Tenho uma clínica. CPF 123.456.789-09", recebidoEm: new Date(Date.now() - 2000),
    });
    await leads.registrarMensagemRecebidaWhatsApp(tx, ana.leadId, {
      id: "ANA2", texto: "Meu e-mail é ana@exemplo.com; contato (54) 99999-1234", recebidoEm: new Date(Date.now() - 1000),
    });
    await leads.registrarMensagemRecebidaWhatsApp(tx, beto.leadId, { id: "BETO1", texto: "SEGREDO DO OUTRO CONTATO" });

    const lista = await chamar("listar_conversas_whatsapp", { busca: "Ana" });
    expect(lista.erro).toBe(false);
    expect(lista.json()).toMatchObject([{ lead_id: ana.leadId, nome: "Ana", empresa: "[e-mail]", numero_final: "1234", resumo: "CPF [CPF]" }]);
    expect(lista.json()).toHaveLength(1);
    expect(lista.texto).not.toContain(ana.whatsapp);
    expect(lista.texto).not.toContain("ana@exemplo.com");
    expect(lista.texto).not.toContain("99999-1234");

    const historico = await chamar("ler_conversa_whatsapp", { lead_id: ana.leadId });
    expect(historico.erro).toBe(false);
    expect(historico.json()).toMatchObject({ lead_id: ana.leadId, antes_id: null, mensagens: [
      { id: "e:ANA1", autor: "cliente", texto: "Tenho uma clínica. CPF [CPF]", estado: "recebido" },
      { id: "e:ANA2", autor: "cliente", texto: expect.stringMatching(/^Meu e-mail é \[e-mail\]; contato \(?\[telefone\]$/), estado: "recebido" },
    ] });
    expect(historico.texto).not.toContain("SEGREDO DO OUTRO CONTATO");
    expect(historico.texto).not.toContain("123.456.789-09");
    expect((await chamar("ler_conversa_whatsapp", { lead_id: ana.leadId, antes_id: "e:BETO1" })).json().mensagens).toEqual([]);
  });

  it("envia pelo MCP com a janela aberta, pausa a IA antes da Meta e não repete o mesmo id", async () => {
    const atendimento = await leads.iniciarAtendimentoWhatsApp(tx, "5554999991234");
    await leads.registrarMensagemRecebidaWhatsApp(tx, atendimento.leadId, { id: "OI", texto: "Oi!" });
    const enviar = vi.fn(async (_url: string | URL, opcoes: RequestInit) => {
      expect(await leads.buscarAtendimentoWhatsApp(tx, atendimento.whatsapp)).toMatchObject({ modo: "humano" });
      expect(JSON.parse(String(opcoes.body))).toMatchObject({
        to: atendimento.whatsapp, messaging_product: "whatsapp", type: "text", text: { body: "Ana, vou te ajudar." },
      });
      return Response.json({ messages: [{ id: "wamid.MCP1" }] });
    });
    vi.stubGlobal("fetch", enviar);
    const entrada = { lead_id: atendimento.leadId, id_envio: "78b8e61d-289e-45e9-90b7-b4c82077c8f7", texto: "  Ana, vou te ajudar.  " };
    const resposta = await chamar("enviar_mensagem_whatsapp", entrada);
    expect(resposta.erro).toBe(false);
    expect(resposta.json().estado).toBe("enviado");
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(String(enviar.mock.calls[0][0])).toBe("https://graph.facebook.com/v24.0/numero-ficticio-mcp/messages");
    const repetida = await chamar("enviar_mensagem_whatsapp", { ...entrada, texto: "Um texto diferente não vira um segundo envio." });
    expect(repetida.json().estado).toBe("ja_registrado");
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(await leads.listarMensagensWhatsApp(tx, atendimento.leadId)).toMatchObject([
      { autor: "cliente", texto: "Oi!" }, { autor: "humano", texto: "Ana, vou te ajudar.", estado: "enviado" },
    ]);
  });

  it("uma falha da Meta fica no histórico e mantém a IA pausada, sem tentar reenviar", async () => {
    const atendimento = await leads.iniciarAtendimentoWhatsApp(tx, "5554999991234");
    await leads.registrarMensagemRecebidaWhatsApp(tx, atendimento.leadId, { id: "OI", texto: "Oi!" });
    const enviar = vi.fn(async () => Response.json({ error: "falha fictícia" }, { status: 503 }));
    vi.stubGlobal("fetch", enviar);
    const entrada = { lead_id: atendimento.leadId, id_envio: "78b8e61d-289e-45e9-90b7-b4c82077c8f7", texto: "Vou te ajudar." };
    const resposta = await chamar("enviar_mensagem_whatsapp", entrada);
    expect(resposta.erro).toBe(true);
    expect(resposta.texto).toContain("O envio não foi confirmado");
    expect(await leads.buscarAtendimentoWhatsApp(tx, atendimento.whatsapp)).toMatchObject({ modo: "humano" });
    expect(await leads.listarMensagensWhatsApp(tx, atendimento.leadId)).toMatchObject([
      { autor: "cliente" }, { autor: "humano", texto: entrada.texto, estado: "erro" },
    ]);
    expect((await chamar("enviar_mensagem_whatsapp", entrada)).json().estado).toBe("ja_registrado");
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("fora das 24 horas não chama a Meta, não cria mensagem e não muda o controle da IA", async () => {
    const atendimento = await leads.iniciarAtendimentoWhatsApp(tx, "5554999991234");
    await leads.registrarMensagemRecebidaWhatsApp(tx, atendimento.leadId, {
      id: "ANTIGA", texto: "Oi!", recebidoEm: new Date(Date.now() - 25 * 3600_000),
    });
    const resposta = await chamar("enviar_mensagem_whatsapp", {
      lead_id: atendimento.leadId, id_envio: "78b8e61d-289e-45e9-90b7-b4c82077c8f7", texto: "Vou te ajudar.",
    });
    expect(resposta.erro).toBe(true);
    expect(resposta.texto).toContain("24 horas");
    expect(fetch).not.toHaveBeenCalled();
    expect(await leads.buscarAtendimentoWhatsApp(tx, atendimento.whatsapp)).toMatchObject({ modo: "agente" });
    expect(await leads.listarMensagensWhatsApp(tx, atendimento.leadId)).toMatchObject([{ id: "e:ANTIGA", autor: "cliente" }]);
  });

  it("acha o projeto pelo remote e devolve o contexto com a nota do Cerebro", async () => {
    const r = await chamar("projeto_atual", { repositorio: "git@github.com:Bruno-I-A/guilda.git" });
    expect(r.erro).toBe(false);
    expect(r.json()).toMatchObject({
      projeto: "guilda",
      etapa: "construcao",
      nota_cerebro: "Projetos/Guilda/Guilda.md",
    });
  });

  it("repositório desconhecido não cria nada e manda perguntar", async () => {
    const r = await chamar("projeto_atual", { repositorio: "https://github.com/alguem/outro" });
    expect(r.json().aviso).toMatch(/Pergunte ao Bruno/);
    expect(await crm.listarProjetos(tx)).toHaveLength(3);
  });

  it("uma sessão completa: tarefa, diário e proposta, tudo assinado pelo agente", async () => {
    const tarefa = (await chamar("criar_tarefa", { projeto: "beto-galina", titulo: "Revisar formulário" })).json();
    expect((await chamar("concluir_tarefa", { tarefa_id: tarefa.tarefa_id })).texto).toMatch(/Concluída/);
    expect(
      (await chamar("registrar_sessao", { projeto: "beto-galina", resumo: "Formulário revisado." })).texto,
    ).toBe("Sessão registrada.");
    const proposta = await chamar("propor_etapa", {
      projeto: "beto-galina",
      etapa: "validacao",
      motivo: "Painel completo, falta o Beto testar.",
    });
    expect(proposta.texto).toMatch(/Construção → Validação com o cliente/);

    const projeto = await crm.exigirProjeto(tx, "beto-galina");
    expect(projeto.etapa).toBe("construcao");
    const atores = new Set((await crm.historico(tx, projeto.id)).filter((e) => e.tipo !== "projeto_criado").map((e) => e.ator));
    expect([...atores]).toEqual(["agente:claude"]);
  });

  it("erro de regra volta legível para o agente, sem derrubar a chamada", async () => {
    const r = await chamar("propor_etapa", { projeto: "nao-existe", etapa: "entregue", motivo: "x" });
    expect(r.erro).toBe(true);
    expect(r.texto).toBe('Não existe projeto "nao-existe" no CRM.');
  });

  it("etapa fora da trilha é recusada pelo esquema", async () => {
    const r = await chamar("propor_etapa", { projeto: "guilda", etapa: "producao", motivo: "x" }).catch((e) => e);
    const mensagem = r instanceof Error ? r.message : r.texto;
    expect(mensagem).toMatch(/etapa|invalid/i);
    expect((await crm.exigirProjeto(tx, "guilda")).etapa).toBe("construcao");
  });
});
