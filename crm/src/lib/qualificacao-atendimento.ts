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
  // A recusa impede o aceite contextual mesmo se o lote também contém “sim”.
  const recusa = (trecho: string) => /\bnao\s+(quero|queria|preciso|precisa|prefiro|gostaria|pode|chame|encaminhe|encaminhar|passe)\b/.test(trecho)
    || /\b(mas|porem|so que)\s+nao\b/.test(trecho)
    || /(?:^|\n)\s*(?:agora\s+)?nao[,.! ]*(?:obrigad[oa])?\s*(?:$|\n)/.test(trecho);
  // O pedido ou revogação humana mais recente vence no lote. Uma recusa de
  // orçamento em outra frase não anula um pedido explícito de atendente.
  let direto: boolean | undefined;
  for (const trecho of mensagem.split(/[,.!?;\n]+/)) {
    const pediu = /\b(falar|conversar|cham(?:a|e|ar)|encaminh(?:a|e|ar)|pass(?:a|e|ar))\b.{0,60}\b(humano|pessoa|equipe|especialista|atendente|bruno)\b/.test(trecho)
      || /\b(quero|preciso|prefiro)\s+(um |uma |o |a )?(humano|pessoa|atendente|especialista)\b/.test(trecho);
    const equipePropria = /\b(minha|nossa|meu|nosso)\s+(equipe|atendente|especialista)\b/.test(trecho);
    const negouHumano = recusa(trecho) && (/\b(falar|conversar|cham(?:a|e|ar)|encaminh(?:a|e|ar)|pass(?:a|e|ar)|humano|pessoa|equipe|especialista|atendente|bruno)\b/.test(trecho)
      || /^\s*(?:agora\s+)?nao\s*$/.test(trecho));
    if (negouHumano) direto = false;
    else if (pediu && !recusa(trecho) && !equipePropria) direto = true;
  }
  if (direto !== undefined) return direto;
  if (recusa(mensagem)) return false;
  // “Sim, mas antes...” ainda pede esclarecimento. Não pausa o atendimento
  // nem substitui a resposta à dúvida por uma mensagem de encaminhamento.
  if (/\b(mas|porem|antes|primeiro|so depois|so se)\b/.test(mensagem) || mensagem.includes("?")) return false;
  // A pergunta agora é escrita conforme o diálogo: pode usar “encaminhe”,
  // “envie”, “encaminharmos” etc. Só um convite da própria Shift, com destino
  // humano explícito, dá contexto para aceitar um “sim”. Sem exigir “?”: em
  // 16/10 o modelo convidou em forma de afirmação (“Então posso encaminhar seu
  // caso para a equipe...”), a Jéssica respondeu “ok” e depois “sim”, e nenhum
  // dos dois foi reconhecido.
  const oferta = /\b(posso|podemos|quer|queria|prefere|gostaria|vamos|autoriza|tudo bem se)\b[^?]{0,100}\b(encaminh(?:ar|e|o|emos|armos|asse)|conect(?:ar|e|o|emos|armos|asse)|pass(?:ar|e|o|emos|armos|asse)|cham(?:ar|e|o|emos|armos|asse)|env(?:iar|ie|io|iemos|iarmos|iasse)|mand(?:ar|e|o|emos|armos|asse)|falar|conversar)\b[^?]{0,100}\b(equipe|especialista|humano|pessoa|atendente|bruno)\b/.test(normalizar(ultimaResposta));
  // Um vocativo ou comentário junto do aceite não o anula. Cada mensagem do
  // lote pode conter a confirmação, mas ela só vale após o convite acima.
  const confirmou = mensagem.split(/\n+/).some((linha) => {
    const confirmacao = linha.replace(/[,.!]+/g, " ").replace(/\s+/g, " ").trim();
    return /^(?:si+m+|pode\s+si+m+|ja\s+(?:falei|disse|confirmei)\s+que\s+(?:si+m+|pode))\b/.test(confirmacao)
      || /^(?:pode|quero|quero sim|pode encaminhar|pode passar)$/.test(confirmacao)
      // Concordâncias curtas só valem sozinhas: “ok” depois de um convite é
      // aceite; “ok, obrigado” continua sendo cortesia.
      || /^(?:ok+|okay|oks|beleza|blz|fechado|combinado|pode ser|bora|vamos|claro|com certeza|perfeito|certo|isso|positivo|manda|por favor)(?: sim)?$/.test(confirmacao);
  });
  return oferta && confirmou;
}

/**
 * A resposta anuncia um encaminhamento como feito ou certo (“vou encaminhar
 * seu caso para a equipe”) em vez de convidar. Só o sistema encaminha, depois
 * do aceite; anunciar sem aceite deixa o cliente esperando alguém que não foi
 * avisado. Frases terminadas em “?” são convite e não contam.
 */
export function prometeEncaminhamento(resposta: string): boolean {
  return normalizar(resposta).split(/(?<=[.!?\n])/).some((frase) => !frase.trim().endsWith("?") && (
    /\b(vou|vamos|irei|iremos|ja)\s+(?:te\s+)?(?:encaminh|pass|repass|envi|mand)\w*\b[^.?!]{0,80}\b(equipe|especialista|humano|pessoa|atendente|bruno)\b/.test(frase)
    || /\b(encaminhei|ja encaminhamos|passei seu caso)\b/.test(frase)
  ));
}
