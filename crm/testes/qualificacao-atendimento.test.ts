import { describe, expect, it } from "vitest";
import { CONVITE_EXEMPLO } from "@/lib/ia-atendimento";
import {
  apenasAgradecimento, PERGUNTA_ENCAMINHAMENTO, prometeEncaminhamento, proximaPergunta, solicitouHumano,
} from "@/lib/qualificacao-atendimento";

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

  it.each(["Show, obrigado", "Ótimo, valeu!", "Ok, obrigado", "Até mais", "Muito obrigada"])("não trata %s como aceite de encaminhamento", (texto) => {
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

  it("o convite que o roteiro ensina é reconhecido quando o cliente aceita", () => {
    expect(solicitouHumano("Sim", CONVITE_EXEMPLO)).toBe(true);
    expect(solicitouHumano("Pode sim", CONVITE_EXEMPLO)).toBe(true);
    expect(solicitouHumano("Não, obrigado", CONVITE_EXEMPLO)).toBe(false);
  });

  it("oferta que nomeia o Bruno também vale como convite", () => {
    expect(solicitouHumano("Sim", "Quer que eu passe seu caso para o Bruno te mostrar como ficaria?")).toBe(true);
    // Citar o Bruno sem oferecer encaminhamento não transforma um "sim" em aceite.
    expect(solicitouHumano("Sim", "Você já conversou com o Bruno antes?")).toBe(false);
  });

  it.each([
    "Quer que eu encaminhe seu resumo para nossa equipe?",
    "Gostaria que eu enviasse os detalhes para um especialista?",
    "Tudo bem se encaminharmos esse resumo para a equipe?",
    "Você quer que eu envie o resumo para nossa equipe?",
    "Posso mandar o contexto para um atendente?",
    "Quer falar com uma pessoa da equipe?",
  ])("aceita sim após um convite natural de encaminhamento: %s", (oferta) => {
    expect(solicitouHumano("Sim", oferta)).toBe(true);
    expect(solicitouHumano("Show, obrigado", oferta)).toBe(false);
    expect(solicitouHumano("Não quero", oferta)).toBe(false);
  });

  it("não confunde dúvidas sobre envio de material nem sim sem convite com encaminhamento", () => {
    expect(solicitouHumano("Pode encaminhar o documento para mim?", "O material ajuda a definir o projeto.")).toBe(false);
    expect(solicitouHumano("Sim", "Você já enviou o material para sua equipe?")).toBe(false);
    expect(solicitouHumano("Sim", "Nossa equipe pode organizar o material. Você já tem fotos?")).toBe(false);
  });

  it.each([
    "Pode sim, querida",
    "SIMMMM",
    "Já falei que sim",
    "Pode sim, querida\nNem precisava ter perguntado",
    "SIMMMM\nJá falei que sim",
    "Obrigado\nPode sim, querida",
  ])("aceita uma confirmação natural ou agrupada após o convite: %s", (texto) => {
    expect(solicitouHumano(texto, PERGUNTA_ENCAMINHAMENTO)).toBe(true);
    expect(solicitouHumano(texto, "Você já tem um site?")).toBe(false);
  });

  it.each([
    "Sim, mas não quero falar com ninguém",
    "Não precisa encaminhar",
    "Show, obrigado",
    "Pode sim, querida\nNão precisa encaminhar",
    "SIMMMM\nNão",
    "Não, obrigado",
    "Sim, mas não",
    "Pode encaminhar o documento para mim?",
  ])("não interpreta recusa nem cortesia como confirmação de encaminhamento: %s", (texto) => {
    expect(solicitouHumano(texto, PERGUNTA_ENCAMINHAMENTO)).toBe(false);
  });

  it.each([
    "Sim, mas antes me diz quanto custa?",
    "Pode sim\nMas primeiro preciso tirar uma dúvida",
    "Sim, porém preciso saber os valores",
    "Sim, só depois de saber o prazo",
    "Pode sim, só se o orçamento estiver dentro do valor",
    "SIMMMM\nAntes me explica como funciona",
    "Sim, quanto custa?",
  ])("preserva a dúvida ou condição antes de aceitar o encaminhamento: %s", (texto) => {
    expect(solicitouHumano(texto, PERGUNTA_ENCAMINHAMENTO)).toBe(false);
  });

  it.each([
    "Não preciso orçamento, quero falar com atendente",
    "Quero falar com uma pessoa antes de passar meu orçamento",
  ])("preserva o pedido direto de atendente mesmo com outra ressalva: %s", (texto) => {
    expect(solicitouHumano(texto, PERGUNTA_ENCAMINHAMENTO)).toBe(true);
    expect(solicitouHumano(texto, "Você já tem um site?")).toBe(true);
  });

  it.each([
    ["Quero falar com atendente\nNão precisa encaminhar", false],
    ["Quero falar com uma pessoa\nNão", false],
    ["Não precisa encaminhar\nNa verdade quero falar com atendente", true],
    ["Quero falar com atendente\nNão preciso orçamento", true],
  ])("considera a última intenção humana relevante no lote: %s", (texto, esperado) => {
    expect(solicitouHumano(texto, PERGUNTA_ENCAMINHAMENTO)).toBe(esperado);
    expect(solicitouHumano(texto, "Você já tem um site?")).toBe(esperado);
  });
});

// As mensagens reais da conversa da Jéssica (16/10/2026), que expuseram a falha.
const OFERTA_JESSICA = 'Ótimo, Jéssica! Então posso encaminhar seu caso para a equipe da Shift desenhar esse site com você, já com as três ações (ver trabalhos, agendar e WhatsApp) e o prazo que você quer. A equipe confirma se o prazo de dois ou três dias é viável e te passa o investimento.';
const PROMESSA_JESSICA = 'Perfeito, Jéssica! Vou encaminhar seu caso para a equipe da Shift. Eles vão desenhar o site com você, com as três ações (ver trabalhos, agendar e WhatsApp), e confirmar o prazo de dois ou três dias e o investimento.';

describe("convite em forma de afirmação e concordância curta", () => {
  it("reconhece o convite sem ponto de interrogação", () => {
    expect(solicitouHumano("ok", OFERTA_JESSICA)).toBe(true);
    expect(solicitouHumano("sim", OFERTA_JESSICA)).toBe(true);
  });

  it.each(["ok", "Ok!", "beleza", "fechado", "pode ser", "bora", "claro", "ok sim"])("%s sozinho depois de um convite é aceite", (texto) => {
    expect(solicitouHumano(texto, PERGUNTA_ENCAMINHAMENTO)).toBe(true);
  });

  it("concordância sem convite antes não encaminha", () => {
    expect(solicitouHumano("sim", "Por nada. Quando quiser, podemos continuar por aqui.")).toBe(false);
    expect(solicitouHumano("ok", "Você já tem um site?")).toBe(false);
  });
});

describe("promessa de encaminhamento sem aceite", () => {
  it("detecta o anúncio do encaminhamento", () => {
    expect(prometeEncaminhamento(PROMESSA_JESSICA)).toBe(true);
    expect(prometeEncaminhamento("Já encaminhei para a equipe.")).toBe(true);
  });

  it("convite em forma de pergunta não é promessa", () => {
    expect(prometeEncaminhamento(PERGUNTA_ENCAMINHAMENTO)).toBe(false);
    expect(prometeEncaminhamento(CONVITE_EXEMPLO)).toBe(false);
    expect(prometeEncaminhamento("Vamos passar seu caso para a equipe?")).toBe(false);
  });
});
