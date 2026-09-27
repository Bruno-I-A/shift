import { beforeEach, describe, expect, it } from "vitest";

import * as crm from "@/lib/crm";
import type { Consulta } from "@/lib/consulta";
import { ErroDeDominio } from "@/lib/dominio";

import { bancoDeTeste } from "./banco-de-teste";

let tx: Consulta;

beforeEach(async () => {
  ({ tx } = await bancoDeTeste());
});

describe("carga inicial", () => {
  it("traz os três projetos escolhidos, cada um com o evento de criação", async () => {
    const projetos = await crm.listarProjetos(tx);
    expect(projetos.map((p) => p.slug)).toEqual(["beto-galina", "guilda", "reforma-tributaria"]);
    expect(projetos.find((p) => p.slug === "beto-galina")?.cliente).toBe("Beto Galina");

    const guilda = projetos.find((p) => p.slug === "guilda")!;
    expect((await crm.historico(tx, guilda.id)).map((e) => e.tipo)).toEqual(["projeto_criado"]);
  });
});

describe("projetos", () => {
  it("cria com slug derivado do nome e cliente novo", async () => {
    const p = await crm.criarProjeto(
      tx,
      { nome: "Padaria São João", tipo: "ai_first", cliente: "Padaria São João", repositorio: "git@github.com:Bruno-I-A/Padaria.git" },
      "bruno",
    );
    expect(p.slug).toBe("padaria-sao-joao");
    expect(p.etapa).toBe("descoberta");
    expect(p.repositorio).toBe("github.com/bruno-i-a/padaria");
    expect(p.cliente).toBe("Padaria São João");
  });

  it("recusa repositório que já é de outro projeto, em qualquer grafia", async () => {
    await expect(
      crm.criarProjeto(tx, { nome: "Outra", tipo: "site", repositorio: "https://GitHub.com/Bruno-I-A/guilda/" }, "bruno"),
    ).rejects.toThrow(/já pertence ao projeto "guilda"/);
  });

  it("acha o projeto pelo remote do git", async () => {
    const achado = await crm.acharPorRepositorio(tx, "git@github.com:Bruno-I-A/reforma-tributaria.git");
    expect(achado?.slug).toBe("reforma-tributaria");
  });

  it("edição registra só os campos que mudaram", async () => {
    const antes = await crm.exigirProjeto(tx, "guilda");
    await crm.atualizarProjeto(
      tx,
      "guilda",
      { nome: antes.nome, tipo: antes.tipo, repositorio: antes.repositorio, stack: "Next.js 16", notaCerebro: antes.notaCerebro },
      "bruno",
    );
    const [ultimo] = await crm.historico(tx, antes.id);
    expect(ultimo.tipo).toBe("projeto_editado");
    expect(ultimo.dados).toEqual({ campos: ["stack"] });
  });
});

describe("o agente propõe, o Bruno decide", () => {
  it("proposta aceita muda a etapa e deixa o rastro dos dois lados", async () => {
    const proposta = await crm.proporEtapa(
      tx,
      "reforma-tributaria",
      { para: "validacao", motivo: "Sprint entregue e publicada na prévia." },
      "agente:claude",
    );
    expect((await crm.exigirProjeto(tx, "reforma-tributaria")).etapa).toBe("construcao");

    await crm.decidirProposta(tx, proposta.id, "aceita", "bruno");

    const projeto = await crm.exigirProjeto(tx, "reforma-tributaria");
    expect(projeto.etapa).toBe("validacao");
    expect(await crm.propostaPendente(tx, projeto.id)).toBeNull();
    const tipos = (await crm.historico(tx, projeto.id)).map((e) => `${e.ator} ${e.tipo}`);
    expect(tipos.slice(0, 3)).toEqual(["bruno etapa_mudou", "bruno proposta_aceita", "agente:claude etapa_proposta"]);
  });

  it("recusada não mexe na etapa", async () => {
    const proposta = await crm.proporEtapa(tx, "guilda", { para: "entregue", motivo: "Acho que acabou." }, "agente:codex");
    await crm.decidirProposta(tx, proposta.id, "recusada", "bruno");
    expect((await crm.exigirProjeto(tx, "guilda")).etapa).toBe("construcao");
    await expect(crm.decidirProposta(tx, proposta.id, "aceita", "bruno")).rejects.toThrow(/já foi decidida/);
  });

  it("uma proposta nova substitui a pendente em vez de empilhar", async () => {
    const primeira = await crm.proporEtapa(tx, "guilda", { para: "validacao", motivo: "a" }, "agente:claude");
    await crm.proporEtapa(tx, "guilda", { para: "entregue", motivo: "b" }, "agente:codex");
    const pendente = await crm.propostaPendente(tx, (await crm.exigirProjeto(tx, "guilda")).id);
    expect(pendente?.para).toBe("entregue");
    await expect(crm.decidirProposta(tx, primeira.id, "aceita", "bruno")).rejects.toThrow(/já foi decidida/);
  });

  it("não aceita propor a etapa em que o projeto já está", async () => {
    await expect(
      crm.proporEtapa(tx, "guilda", { para: "construcao", motivo: "x" }, "agente:claude"),
    ).rejects.toBeInstanceOf(ErroDeDominio);
  });

  it("mudança manual para onde o agente pedia encerra a proposta como aceita", async () => {
    await crm.proporEtapa(tx, "guilda", { para: "validacao", motivo: "x" }, "agente:claude");
    await crm.mudarEtapa(tx, "guilda", "validacao", "bruno");
    const projeto = await crm.exigirProjeto(tx, "guilda");
    expect(await crm.propostaPendente(tx, projeto.id)).toBeNull();
    expect(projeto.etapa).toBe("validacao");
  });
});

describe("tarefas e sessões", () => {
  it("o agente cria e conclui; a lista de abertas acompanha", async () => {
    const tarefa = await crm.criarTarefa(tx, "beto-galina", "Publicar a página de imóveis", "agente:claude");
    const projeto = await crm.exigirProjeto(tx, "beto-galina");
    expect((await crm.listarTarefas(tx, projeto.id)).map((t) => t.titulo)).toEqual(["Publicar a página de imóveis"]);

    await crm.concluirTarefa(tx, tarefa.id, "agente:codex");
    expect(await crm.listarTarefas(tx, projeto.id)).toEqual([]);
    const [concluida] = await crm.listarTarefas(tx, projeto.id, { abertas: false });
    expect(concluida.concluidaPor).toBe("agente:codex");
  });

  it("identificador de tarefa malformado vira erro legível, não erro de SQL", async () => {
    await expect(crm.concluirTarefa(tx, "123", "agente:claude")).rejects.toThrow(/não é um identificador/);
  });

  it("o contexto junta etapa, tarefas, sessões e proposta", async () => {
    await crm.registrarSessao(
      tx,
      "guilda",
      { resumo: "Corrigi o login.", proximosPassos: "Testar no celular." },
      "agente:claude",
    );
    await crm.criarTarefa(tx, "guilda", "Testar no celular", "agente:claude");
    const contexto = await crm.contextoDoProjeto(tx, "guilda");
    expect(contexto.projeto.notaCerebro).toBe("Projetos/Guilda/Guilda.md");
    expect(contexto.ultimasSessoes[0].resumo).toBe("Corrigi o login.");
    expect(contexto.tarefasAbertas).toHaveLength(1);
    expect(contexto.propostaPendente).toBeNull();
  });
});

describe("histórico é só de escrita", () => {
  it("o papel da aplicação não consegue apagar nem alterar eventos e sessões", async () => {
    await expect(tx.query("update crm.evento set ator = 'x'", [])).rejects.toThrow(/permission denied/);
    await expect(tx.query("delete from crm.sessao", [])).rejects.toThrow(/permission denied/);
    await expect(tx.query("delete from crm.projeto", [])).rejects.toThrow(/permission denied/);
    await expect(tx.query("drop table crm.tarefa", [])).rejects.toThrow(/must be owner/);
  });
});

describe("chaves do MCP", () => {
  it("guarda só o hash, autentica e deixa de autenticar depois de revogada", async () => {
    const { agente, token } = await crm.criarAgente(tx, "claude");
    const { rows } = await tx.query<{ token_hash: string }>("select token_hash from crm.agente", []);
    expect(rows[0].token_hash).not.toContain(token);

    expect(await crm.autenticarAgente(tx, token)).toMatchObject({ nome: "claude" });
    expect(await crm.autenticarAgente(tx, token + "x")).toBeNull();

    await crm.revogarAgente(tx, agente.id);
    expect(await crm.autenticarAgente(tx, token)).toBeNull();
  });
});

describe("limite de login", () => {
  it("bloqueia o IP depois de cinco falhas", async () => {
    for (let i = 0; i < crm.MAX_FALHAS_POR_IP; i++) {
      expect(await crm.entradaBloqueada(tx, "1.1.1.1")).toBe(false);
      await crm.registrarFalhaDeEntrada(tx, "1.1.1.1");
    }
    expect(await crm.entradaBloqueada(tx, "1.1.1.1")).toBe(true);
    expect(await crm.entradaBloqueada(tx, "2.2.2.2")).toBe(false);
  });
});

describe("painel de hoje", () => {
  it("mostra como parado o projeto ativo sem atividade há uma semana", async () => {
    const daquiADezDias = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const { parados } = await crm.painelHoje(tx, daquiADezDias);
    expect(parados.map((p) => p.slug).sort()).toEqual(["beto-galina", "guilda", "reforma-tributaria"]);

    const { parados: hoje } = await crm.painelHoje(tx);
    expect(hoje).toEqual([]);
  });
});
