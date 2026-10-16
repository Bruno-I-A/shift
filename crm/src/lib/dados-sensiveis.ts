/** Reduz exposição de dados pessoais comuns ao enviar perguntas à IA. */
export function mascararDados(texto: string, limite = 1500): string {
  // A máscara vem antes do corte para não expor o começo de um documento ou
  // endereço de e-mail que atravesse o limite enviado ao modelo.
  return texto
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[e-mail]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF]")
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[CNPJ]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[número]")
    .replace(/(?<!\w)(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, "[telefone]")
    .slice(0, limite);
}
