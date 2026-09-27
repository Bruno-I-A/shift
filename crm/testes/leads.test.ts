import { beforeEach, describe, expect, it } from "vitest";

import type { Consulta } from "@/lib/consulta";
import * as crm from "@/lib/crm";
import * as leads from "@/lib/leads";

import { bancoDeTeste } from "./banco-de-teste";

/** O corpo que `site/diagnostico.html` monta em `sendLead`. */
function envioDoSite(extra: Record<string, unknown> = {}) {
  return {
    respostas: {
      segmento: "Escritório contábil",
      controle: "Planilhas",
      dor: "Conferência de documentos",
      ia: "Não usamos",
      equipe: "6 a 15 pessoas",
      prazo: "Agora",
    },
    nivelCalculado: "Nível 2",
    ofertaRecomendada: "Operação assistida",
    processoSugerido: "Triagem de documentos",
    nome: "Maria",
    empresa: "Contábil Maria",
    whatsapp: "(54) 99999-1234",
    consentimento: { autorizado: true, dataHora: "2026-09-27T12:00:00.000Z" },
    origem: "diagnostico-site",
    ...extra,
  };
}

describe("leitura do envio do site", () => {
  it("aceita o formato do quiz e guarda o WhatsApp só com dígitos", () => {
    const dados = leads.lerEnvioDoSite(envioDoSite());
    expect(dados.whatsapp).toBe("54999991234");
    expect(dados.respostas.segmento).toBe("Escritório contábil");
    expect(dados.oferta).toBe("Operação assistida");
  });

  it.each([
    ["sem consentimento", { consentimento: { autorizado: false } }, /consentimento/],
    ["sem nome", { nome: "  " }, /nome/],
    ["WhatsApp sem DDD", { whatsapp: "99999-12" }, /DDD/],
  ])("recusa %s", (_, extra, erro) => {
    expect(() => leads.lerEnvioDoSite(envioDoSite(extra))).toThrow(erro);
  });
});

describe("leads no banco", () => {
  let tx: Consulta;
  beforeEach(async () => {
    ({ tx } = await bancoDeTeste());
  });

  it("recebe, lista e registra quem trouxe", async () => {
    const { novo, id } = await leads.receberLead(tx, leads.lerEnvioDoSite(envioDoSite()));
    expect(novo).toBe(true);
    const [lead] = await leads.listarLeads(tx);
    expect(lead).toMatchObject({ id, nome: "Maria", segmento: "Escritório contábil", etapa: "novo" });
    const { rows } = await tx.query<{ ator: string; tipo: string }>(
      "select ator, tipo from crm.evento where lead_id = $1",
      [id],
    );
    expect(rows).toEqual([{ ator: "site", tipo: "lead_recebido" }]);
  });

  it("quem refaz o diagnóstico não vira um segundo lead", async () => {
    await leads.receberLead(tx, leads.lerEnvioDoSite(envioDoSite()));
    const segunda = await leads.receberLead(
      tx,
      leads.lerEnvioDoSite(envioDoSite({ whatsapp: "54 99999 1234", empresa: "Outra" })),
    );
    expect(segunda.novo).toBe(false);
    const todos = await leads.listarLeads(tx);
    expect(todos).toHaveLength(1);
    expect(todos[0].empresa).toBe("Outra");
  });

  it("anda no funil e registra a mudança", async () => {
    const { id } = await leads.receberLead(tx, leads.lerEnvioDoSite(envioDoSite()));
    await leads.mudarEtapaDoLead(tx, id, "qualificado", "bruno");
    expect((await leads.listarLeads(tx, "qualificado")).map((l) => l.id)).toEqual([id]);
    expect(await leads.contarLeadsPorEtapa(tx)).toEqual({ qualificado: 1 });
  });

  it("limita cinco envios por IP por hora", async () => {
    for (let i = 0; i < leads.MAX_ENVIOS_POR_IP_HORA; i++) {
      expect(await leads.registrarEnvio(tx, "ip-a")).toBe(true);
    }
    expect(await leads.registrarEnvio(tx, "ip-a")).toBe(false);
    expect(await leads.registrarEnvio(tx, "ip-b")).toBe(true);
  });

  it("o papel da aplicação não apaga lead", async () => {
    await leads.receberLead(tx, leads.lerEnvioDoSite(envioDoSite()));
    await expect(tx.query("delete from crm.lead", [])).rejects.toThrow(/permission denied/);
  });

  it("não mistura leads com o histórico dos projetos", async () => {
    await leads.receberLead(tx, leads.lerEnvioDoSite(envioDoSite()));
    const guilda = await crm.exigirProjeto(tx, "guilda");
    expect((await crm.historico(tx, guilda.id)).map((e) => e.tipo)).toEqual(["projeto_criado"]);
  });
});
