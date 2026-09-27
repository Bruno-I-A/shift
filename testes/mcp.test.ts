/**
 * O MCP pelo fio: requisições HTTP de verdade no handler do SDK, falando o
 * protocolo de 2025 (o que o Claude Code e o Codex usavam quando isto foi
 * escrito), contra o mesmo banco dos outros testes.
 */
import { createMcpHandler } from "@modelcontextprotocol/server";
import { beforeEach, describe, expect, it } from "vitest";

import type { Consulta } from "@/lib/consulta";
import * as crm from "@/lib/crm";
import { criarServidorMcp } from "@/mcp/servidor";

import { bancoDeTeste } from "./banco-de-teste";

let tx: Consulta;
let handler: ReturnType<typeof createMcpHandler>;
let id = 0;

beforeEach(async () => {
  ({ tx } = await bancoDeTeste());
  handler = createMcpHandler((ctx) => criarServidorMcp(ctx.authInfo?.clientId ?? "?", (t) => t(tx)), {
    legacy: "stateless",
  });
});

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
  it("se apresenta com as instruções e as sete ferramentas", async () => {
    const init = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "teste", version: "0" },
    });
    expect(init.serverInfo.name).toBe("shift-crm");
    expect(init.instructions).toContain("projeto_atual");

    const { tools } = await rpc("tools/list");
    expect(tools.map((t: { name: string }) => t.name).sort()).toEqual([
      "concluir_tarefa",
      "contexto_do_projeto",
      "criar_tarefa",
      "listar_projetos",
      "projeto_atual",
      "propor_etapa",
      "registrar_sessao",
    ]);
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
