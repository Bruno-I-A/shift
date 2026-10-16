/** Divide sem outra chamada de IA, preservando palavras e a pergunta final. */
export function separarRespostaAtendimento(texto: string): string[] {
  const partes: string[] = [];
  for (const paragrafo of texto.trim().split(/\n\s*\n/).filter(Boolean)) {
    let restante = paragrafo.trim();
    while (restante.length > 320) {
      const trecho = restante.slice(0, 321);
      const frases = [...trecho.matchAll(/[.!?](?:\s|$)/g)];
      const fimFrase = frases.at(-1)?.index;
      const corte = fimFrase !== undefined && fimFrase > 100 ? fimFrase + 1 : trecho.lastIndexOf(' ') > 0 ? trecho.lastIndexOf(' ') : 320;
      partes.push(restante.slice(0, corte).trim());
      restante = restante.slice(corte).trim();
    }
    if (restante) partes.push(restante);
  }
  return partes;
}
