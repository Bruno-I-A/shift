import { describe, expect, it } from "vitest";
import { apenasAgradecimento, PERGUNTA_ENCAMINHAMENTO, proximaPergunta, solicitouHumano } from "@/lib/qualificacao-atendimento";

const contato = {
  nome: "Bruno", empresa: "Clínica B", segmento: "Odontologia", dor: null, prazo: null,
  qualificacao: { interesse: "site" },
};

describe("organização da descoberta do projeto", () => {
  it("pergunta o objetivo do site e segue para os dados que ainda faltam", () => {
    expect(proximaPergunta(contato)).toBe("O que você quer alcançar com o site?");
    expect(proximaPergunta({ ...contato, qualificacao: { ...contato.qualificacao, objetivo: "Atrair pacientes" } })).toBe("Em qual cidade sua empresa atende?");
    expect(proximaPergunta({ ...contato, qualificacao: { ...contato.qualificacao, objetivo: "Atrair pacientes", cidade: "Passo Fundo", siteAtual: "Primeiro site" } })).toBe("Já tem logo, fotos e textos ou precisa organizar esse material?");
  });

  it("usa perguntas sobre operação para um projeto de IA", () => {
    expect(proximaPergunta({ ...contato, qualificacao: { interesse: "IA nos processos" } })).toMatch(/Qual processo/);
    expect(proximaPergunta({ ...contato, dor: "Conferir notas", qualificacao: { interesse: "IA nos processos" } })).toMatch(/Que sistema/);
  });

  it("respeita informações indefinidas e só oferece encaminhamento ao terminar a descoberta", () => {
    const completo = {
      ...contato, prazo: "Ainda não definido",
      qualificacao: { interesse: "site", objetivo: "Atrair pacientes", cidade: "Passo Fundo", siteAtual: "Não tem", materiais: "Não tem", papel: "Proprietário", investimento: "Prefere não informar", preferenciaContato: "Tarde" },
    };
    expect(proximaPergunta(completo)).toBe(PERGUNTA_ENCAMINHAMENTO);
  });

  it.each(["Show, obrigado", "Ótimo, valeu!", "Ok", "Até mais", "Muito obrigada"])("não trata %s como aceite de encaminhamento", (texto) => {
    expect(apenasAgradecimento(texto)).toBe(true);
    expect(solicitouHumano(texto, PERGUNTA_ENCAMINHAMENTO)).toBe(false);
  });

  it("encaminha por pedido direto ou confirmação, respeitando recusas", () => {
    expect(solicitouHumano("Quero falar com uma pessoa", "Como você se chama?")).toBe(true);
    expect(solicitouHumano("Não quero falar com uma pessoa", PERGUNTA_ENCAMINHAMENTO)).toBe(false);
    expect(solicitouHumano("Sim, pode", PERGUNTA_ENCAMINHAMENTO)).toBe(true);
    expect(solicitouHumano("Sim", "Você já tem um site?")).toBe(false);
    expect(solicitouHumano("Preciso conversar com minha equipe", "Você decide sobre esse projeto?")).toBe(false);
    expect(apenasAgradecimento("Obrigado, pode encaminhar para a equipe")).toBe(false);
  });
});
