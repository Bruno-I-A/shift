/**
 * Rótulos dos modelos de WhatsApp, num módulo comum: a tela do navegador
 * também usa, e não pode importar `modelos-whatsapp.ts`, que só roda no servidor.
 */
export const NOME_CATEGORIA: Record<string, string> = {
  UTILITY: "Utilidade",
  MARKETING: "Marketing",
  AUTHENTICATION: "Autenticação",
};

export const NOME_STATUS: Record<string, string> = {
  APPROVED: "Aprovado",
  PENDING: "Em análise",
  REJECTED: "Recusado",
  PAUSED: "Pausado",
  DISABLED: "Desativado",
  IN_APPEAL: "Em recurso",
};

/** O que a categoria significa no bolso, sem cravar valor que a Meta muda por trimestre. */
export const CUSTO_CATEGORIA: Record<string, string> = {
  UTILITY: "Utilidade: aviso ligado a algo que o cliente pediu. É a categoria mais barata.",
  MARKETING: "Marketing: oferta ou prospecção. Custa cerca de R$ 0,40 por mensagem.",
};
