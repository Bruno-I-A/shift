import { CaixaWhatsApp } from '@/componentes/caixa-whatsapp';
import { emTransacao } from '@/lib/banco';
import { listarConversasWhatsApp } from '@/lib/leads';
import { exigirSessao } from '@/lib/sessao';

export default async function WhatsApp() {
  await exigirSessao();
  const conversas = await emTransacao(tx => listarConversasWhatsApp(tx));
  return <CaixaWhatsApp iniciais={conversas} agenteAtivo={process.env.WHATSAPP_ATIVO === 'sim'} />;
}
