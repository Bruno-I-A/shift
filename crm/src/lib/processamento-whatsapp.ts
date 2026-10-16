import 'server-only';

import { emTransacao } from './banco';
import { analisarAtendimento, ErroFormatoAtendimento, type AnaliseAtendimento } from './ia-atendimento';
import {
  concluirLoteWhatsApp, enviarLotePreparadoWhatsApp, liberarLoteWhatsApp, marcarEnvioWhatsApp,
  mudarModoAtendimentoWhatsApp, reservarLoteWhatsApp, type LoteWhatsApp,
} from './leads';
import { registrarUsoAtendimento } from './uso-atendimento';
import { enviarTextoMeta } from './whatsapp';

function motivoSeguroDaIa(erro: unknown): string {
  if (erro instanceof ErroFormatoAtendimento) return `${erro.message} ${erro.diagnostico}`;
  if (!(erro instanceof Error)) return 'falha de rede ou timeout.';
  if (/^IA indisponível \(\d{3}\)\.$/.test(erro.message)) return erro.message;
  if (['Configuração de IA ausente.', 'Configuração de IA ausente ou inválida.', 'Resposta da IA fora do formato esperado.'].includes(erro.message)) return erro.message;
  return 'falha de rede ou timeout.';
}

async function processar(lote: LoteWhatsApp): Promise<void> {
  try {
    const analise: AnaliseAtendimento = lote.temMidia ? {
      resposta: 'Recebi sua mensagem. Vou deixar para uma pessoa da Shift conferir e continuar por aqui.',
      nome: '', empresa: '', segmento: '', dor: '', prazo: '', resumo: '', passarParaHumano: true,
    } : await analisarAtendimento(lote.texto, {
      ...lote.atendimento,
      // Inclui também chamadas cuja resposta ficou obsoleta: o custo já ocorreu.
      onUso: uso => emTransacao(tx => registrarUsoAtendimento(tx, lote.leadId, uso)),
    }).catch(erro => {
      console.error(`[whatsapp] IA indisponível: ${motivoSeguroDaIa(erro)}`);
      return {
        resposta: 'O atendimento automático está indisponível no momento. Vou deixar seu contato para uma pessoa da Shift continuar por aqui.',
        nome: '', empresa: '', segmento: '', dor: '', prazo: '', resumo: lote.atendimento.resumo, passarParaHumano: true,
      };
    });
    const envio = await emTransacao(tx => concluirLoteWhatsApp(tx, lote, analise));
    if (typeof envio === 'string') return;
    // A tentativa já está confirmada no banco e o lote foi consumido. Nem uma
    // queda após a Meta receber o HTTP recoloca esta resposta na fila.
    try {
      await emTransacao(tx => enviarLotePreparadoWhatsApp(tx, lote, envio, enviarTextoMeta));
    } catch {
      console.error('[whatsapp] envio sem confirmação; confira a conversa no CRM antes de responder novamente.');
      await emTransacao(async tx => {
        await marcarEnvioWhatsApp(tx, envio.id, false);
        await mudarModoAtendimentoWhatsApp(tx, lote.leadId, 'humano');
      }).catch(() => {});
    }
  } catch {
    console.error('[whatsapp] processamento interrompido; a fila tentará recuperar o atendimento.');
    await emTransacao(tx => liberarLoteWhatsApp(tx, lote)).catch(() => {});
  }
}

/** Uma passagem é exportada para ensaiar reinício/concorrência sem timers no teste. */
export async function processarFilaWhatsApp(): Promise<void> {
  if (process.env.WHATSAPP_ATIVO !== 'sim' || !process.env.DATABASE_URL) return;
  const lotes: LoteWhatsApp[] = [];
  // Dois contatos podem conversar em paralelo; cada contato tem sua reserva no banco.
  for (let i = 0; i < 2; i++) {
    const lote = await emTransacao(reservarLoteWhatsApp);
    if (!lote) break;
    lotes.push(lote);
  }
  await Promise.all(lotes.map(processar));
}

const estado = globalThis as unknown as { processamentoWhatsApp?: ReturnType<typeof setInterval>; processandoWhatsApp?: boolean };

export function iniciarProcessamentoWhatsApp(): void {
  if (estado.processamentoWhatsApp) return;
  const executar = async () => {
    if (estado.processandoWhatsApp) return;
    estado.processandoWhatsApp = true;
    try { await processarFilaWhatsApp(); }
    catch { console.error('[whatsapp] fila temporariamente indisponível; nova tentativa em breve.'); }
    finally { estado.processandoWhatsApp = false; }
  };
  // Só o despertador é local. Mensagens, janela de silêncio e reservas são duráveis.
  estado.processamentoWhatsApp = setInterval(() => { void executar(); }, 1000);
  estado.processamentoWhatsApp.unref();
  void executar();
}
