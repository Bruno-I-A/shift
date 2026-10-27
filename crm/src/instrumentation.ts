/** O servidor persistente do Easypanel retoma as filas mesmo sem outro webhook. */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
    const { iniciarProcessamentoWhatsApp } = await import('./lib/processamento-whatsapp');
    iniciarProcessamentoWhatsApp();
    const { iniciarAgendaInstagram } = await import('./lib/processamento-instagram');
    iniciarAgendaInstagram();
    const { iniciarDirect } = await import('./lib/processamento-direct');
    iniciarDirect();
    const { iniciarComentariosInstagram } = await import('./lib/processamento-comentarios-instagram');
    iniciarComentariosInstagram();
  }
}
