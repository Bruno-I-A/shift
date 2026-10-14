export const CAMPOS_QUALIFICACAO = [
  "interesse", "objetivo", "cidade", "papel", "ferramentas", "equipe",
  "siteAtual", "materiais", "investimento", "preferenciaContato",
] as const;

export type DadosQualificacao = Partial<Record<typeof CAMPOS_QUALIFICACAO[number], string>>;

interface Contato {
  nome: string;
  empresa: string | null;
  segmento: string | null;
  dor: string | null;
  prazo: string | null;
  qualificacao?: Record<string, string>;
}

export const PERGUNTA_ENCAMINHAMENTO = "Posso encaminhar esse resumo à equipe da Shift para continuar com você?";

/** A próxima pergunta usa todos os fatos conhecidos, inclusive os desta mensagem. */
export function proximaPergunta(contato: Contato): string {
  const dados = contato.qualificacao ?? {};
  const interesse = dados.interesse ?? "";
  const site = /site|landing|presen[cç]a digital/i.test(interesse);
  const perguntas: [boolean, string][] = [
    [!contato.nome, "Como você se chama?"],
    [!contato.empresa, "Qual é o nome da sua empresa?"],
    [!interesse, "Você está buscando um site, IA nos processos ou um sistema para a empresa?"],
    [site ? !dados.objetivo : !contato.dor, site ? "O que você quer alcançar com o site?" : "Qual processo hoje dá mais trabalho ou toma mais tempo da equipe?"],
    [!contato.segmento, "Em qual área sua empresa atua?"],
    [site && !dados.cidade, "Em qual cidade sua empresa atende?"],
    [site && !dados.siteAtual, "Você já tem um site ou será o primeiro?"],
    [site && !dados.materiais, "Já tem logo, fotos e textos ou precisa organizar esse material?"],
    [!site && !dados.ferramentas && !dados.controle, "Que sistema ou ferramenta vocês usam nesse processo hoje?"],
    [!site && !dados.equipe, "Quantas pessoas participam desse trabalho hoje?"],
    [!contato.prazo, "Você tem algum prazo em mente para esse projeto?"],
    [!dados.papel, "Você decide sobre esse projeto ou há outra pessoa envolvida?"],
    [!dados.investimento, "Já tem uma faixa de investimento em mente? Se ainda não definiu, tudo bem."],
    [!dados.preferenciaContato, "Qual horário é melhor para a equipe continuar a conversa por aqui?"],
  ];
  return perguntas.find(([falta]) => falta)?.[1] ?? PERGUNTA_ENCAMINHAMENTO;
}

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** Cortesia não é autorização para encaminhar, mesmo após uma oferta do agente. */
export function apenasAgradecimento(texto: string): boolean {
  const palavras = normalizar(texto).replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean);
  return palavras.length > 0 && palavras.every((p) => ["show", "top", "legal", "beleza", "blz", "blzz", "valeu", "obrigado", "obrigada", "muito", "perfeito", "otimo", "ok", "tchau", "ate", "mais", "certo"].includes(p));
}

export function solicitouHumano(texto: string, ultimaResposta: string): boolean {
  const mensagem = normalizar(texto);
  const recusou = /\bnao (quero|queria|preciso|prefiro|gostaria|pode|chame|encaminhe|passe)\b/.test(mensagem);
  const direto = /\b(falar|conversar|cham(?:a|e|ar)|encaminh(?:a|e|ar)|pass(?:a|e|ar))\b.{0,60}\b(humano|pessoa|equipe|especialista|atendente|bruno)\b/.test(mensagem)
    || /\b(quero|preciso|prefiro)\s+(um |uma |o |a )?(humano|pessoa|atendente|especialista)\b/.test(mensagem);
  const equipePropria = /\b(minha|nossa|meu|nosso)\s+(equipe|atendente|especialista)\b/.test(mensagem);
  if (direto && !recusou && !equipePropria) return true;
  const oferta = /\b(encaminhar|conectar|passar|chamar)\b.{0,70}\b(equipe|especialista|humano|pessoa|atendente)\b/i.test(normalizar(ultimaResposta)) && ultimaResposta.includes("?");
  const confirmacao = mensagem.replace(/[,.!]+/g, " ").replace(/\s+/g, " ").trim();
  return oferta && /^(sim|pode|pode sim|sim pode|quero|quero sim|pode encaminhar|pode passar)$/.test(confirmacao);
}
