/** O servidor persistente do Easypanel retoma a fila mesmo sem outro webhook. */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
    const { iniciarProcessamentoWhatsApp } = await import('./lib/processamento-whatsapp');
    iniciarProcessamentoWhatsApp();
  }
}
