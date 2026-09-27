/**
 * Classes dos controles, num módulo comum e não no `botao-acao.tsx`.
 *
 * Um objeto exportado de um arquivo "use client" chega aos componentes de
 * servidor como referência de cliente, não como o objeto: `estilos.primario`
 * vira `undefined` e o botão perde todo o estilo, sem erro nenhum.
 */
export const estilos = {
  primario:
    "inline-flex items-center justify-center gap-2 rounded-md bg-destaque px-3.5 py-2 text-sm font-medium text-fundo transition-colors hover:bg-ouro",
  secundario:
    "inline-flex items-center justify-center gap-2 rounded-md border border-linha-forte px-3.5 py-2 text-sm font-medium text-texto transition-colors hover:border-suave hover:bg-superficie-2",
  fantasma:
    "inline-flex items-center justify-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-suave transition-colors hover:bg-superficie-2 hover:text-texto",
  perigo:
    "inline-flex items-center justify-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-perigo transition-colors hover:bg-perigo-fundo",
  campo:
    "w-full rounded-md border border-linha-forte bg-fundo px-3 py-2 text-sm text-texto placeholder:text-apagado focus:border-destaque focus:outline-none",
};
