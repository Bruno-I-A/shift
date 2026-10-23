import { emTransacao } from "@/lib/banco";
import { midiaPelaChave } from "@/lib/instagram";
import { responderArquivo } from "@/lib/midia";
import { temSessao } from "@/lib/sessao";

/**
 * O link que a Meta usa para buscar o vídeo ou a foto.
 *
 * Responde sem login só enquanto a publicação está na fila (agendada ou
 * preparando), que é quando a Meta precisa dele. Fora disso, só para quem
 * está logado no CRM — é como a tela mostra a prévia de uma publicação que
 * ainda espera aprovação. Depois de publicada, o arquivo sai do volume.
 */
export const dynamic = "force-dynamic";

async function atender(pedido: Request, { params }: RouteContext<"/api/instagram/midia/[chave]">) {
  const { chave } = await params;
  const midia = await emTransacao((tx) => midiaPelaChave(tx, chave));
  if (!midia || (!midia.liberada && !(await temSessao()))) {
    return new Response("Não encontrado.", { status: 404 });
  }
  return responderArquivo(midia.arquivo, midia.tipoMime, pedido);
}

export { atender as GET, atender as HEAD };
