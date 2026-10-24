/**
 * Textos de leads usados pela página (servidor) e pela caixa do WhatsApp
 * (navegador), num módulo comum que não puxa nada do banco.
 */

/** O que a confirmação diz antes de excluir: o que some e o que acontece depois. */
export function avisoDeExclusao(nome: string): string {
  return `Excluir ${nome} e todo o histórico?\n\nA conversa do WhatsApp, o resumo do atendimento e os dados do lead são apagados de vez. Se o número mandar mensagem de novo, o atendimento recomeça do zero, com o pedido de autorização.`;
}
