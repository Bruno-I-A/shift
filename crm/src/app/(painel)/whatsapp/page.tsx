import { CaixaWhatsApp } from '@/componentes/caixa-whatsapp';
import type { ModeloAprovado } from '@/componentes/reabrir-com-modelo';
import { ErroDeDominio } from '@/lib/dominio';
import { listarModelosMeta } from '@/lib/modelos-whatsapp';
import { emTransacao } from '@/lib/banco';
import { listarConversasWhatsApp } from '@/lib/leads';
import { exigirSessao } from '@/lib/sessao';

export default async function WhatsApp() {
  await exigirSessao();
  const conversas = await emTransacao(tx => listarConversasWhatsApp(tx));
  // Os modelos vêm da Meta a cada abertura: a aprovação acontece lá. Se a
  // consulta falhar, a caixa abre igual e explica no lugar do envio.
  let modelos: ModeloAprovado[] = [];
  let erroModelos: string | undefined;
  try {
    modelos = (await listarModelosMeta()).filter(m => m.status === 'APPROVED')
      .map(({ nome, idioma, categoria, texto, variaveis }) => ({ nome, idioma, categoria, texto, variaveis }));
  } catch (erro) {
    erroModelos = erro instanceof ErroDeDominio ? erro.message : 'Não foi possível consultar os modelos na Meta.';
  }
  return <CaixaWhatsApp iniciais={conversas} agenteAtivo={process.env.WHATSAPP_ATIVO === 'sim'} modelos={modelos} erroModelos={erroModelos} />;
}
