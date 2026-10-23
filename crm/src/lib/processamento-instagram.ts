import "server-only";

import { emTransacao } from "./banco";
import * as instagram from "./instagram";
import type { Andamento, TrabalhoPublicacao } from "./instagram";
import {
  criarConteiner,
  ErroDaMeta,
  estadoDoConteiner,
  faltandoParaInstagram,
  linkDaMidia,
  linkDoPost,
  publicarConteiner,
  renovarToken,
  type Acesso,
} from "./instagram-meta";
import { LIMITES, precisaRenovar } from "./instagram-regras";
import { apagarArquivos } from "./midia";

/**
 * O agendador do Instagram. A Meta não agenda post: quem guarda o horário e
 * dispara é o CRM, numa passagem a cada 15 segundos dentro do próprio servidor.
 *
 * Cada passagem avança uma publicação um passo só — criar o contêiner,
 * conferir se o vídeo terminou de processar, publicar — e grava onde parou.
 * Se o servidor cair no meio, a próxima subida continua dali.
 */

const estado = globalThis as unknown as {
  agendaInstagram?: ReturnType<typeof setInterval>;
  passandoInstagram?: boolean;
  ultimaRenovacaoInstagram?: number;
  ultimaLimpezaInstagram?: number;
};

const ehVideo = (tipoMime: string) => tipoMime.startsWith("video/");

/** Um passo na Meta. Não grava nada: devolve o que aconteceu. */
export async function avancarPublicacao(t: TrabalhoPublicacao, acesso: Acesso): Promise<Andamento> {
  const legenda: Record<string, string> = t.legenda ? { caption: t.legenda } : {};
  try {
    if (t.estado === "agendada") {
      if (t.tipo === "reel") {
        const conteinerId = await criarConteiner(acesso, {
          media_type: "REELS",
          video_url: linkDaMidia(t.itens[0].chave),
          share_to_feed: t.mostrarNoFeed,
          ...(t.capa ? { cover_url: linkDaMidia(t.capa.chave) } : {}),
          ...legenda,
        });
        return { tipo: "preparando", filhos: [], conteinerId, esperarMs: 30_000 };
      }
      if (t.tipo === "foto") {
        const conteinerId = await criarConteiner(acesso, { image_url: linkDaMidia(t.itens[0].chave), ...legenda });
        return { tipo: "preparando", filhos: [], conteinerId, esperarMs: 5_000 };
      }
      // Carrossel: um contêiner por item primeiro; o do carrossel só depois
      // que todos estiverem prontos.
      const filhos: string[] = [];
      for (const item of t.itens) {
        filhos.push(
          await criarConteiner(
            acesso,
            ehVideo(item.tipoMime)
              ? { media_type: "VIDEO", video_url: linkDaMidia(item.chave), is_carousel_item: true }
              : { image_url: linkDaMidia(item.chave), is_carousel_item: true },
          ),
        );
      }
      return { tipo: "preparando", filhos, conteinerId: null, esperarMs: 10_000 };
    }

    if (t.preparandoDesde && Date.now() - new Date(t.preparandoDesde).getTime() > LIMITES.minutosPreparando * 60_000) {
      return {
        tipo: "falhou",
        mensagem: `A Meta não terminou de processar em ${LIMITES.minutosPreparando} minutos. Confira o arquivo e tente de novo.`,
      };
    }

    if (!t.conteinerId) {
      const estados = await Promise.all(t.filhos.map((f) => estadoDoConteiner(acesso, f)));
      const ruim = estados.findIndex((e) => e.estado === "ERROR" || e.estado === "EXPIRED");
      if (ruim >= 0) {
        const detalhe = estados[ruim].detalhe;
        return { tipo: "falhou", mensagem: `A Meta recusou o item ${ruim + 1} do carrossel${detalhe ? `: ${detalhe}` : "."}` };
      }
      if (estados.some((e) => e.estado !== "FINISHED")) {
        return { tipo: "preparando", filhos: t.filhos, conteinerId: null, esperarMs: 30_000 };
      }
      const conteinerId = await criarConteiner(acesso, { media_type: "CAROUSEL", children: t.filhos.join(","), ...legenda });
      return { tipo: "preparando", filhos: t.filhos, conteinerId, esperarMs: 5_000 };
    }

    const { estado: situacao, detalhe } = await estadoDoConteiner(acesso, t.conteinerId);
    if (situacao === "IN_PROGRESS") {
      return { tipo: "preparando", filhos: t.filhos, conteinerId: t.conteinerId, esperarMs: 30_000 };
    }
    if (situacao === "EXPIRED") {
      return { tipo: "falhou", mensagem: "O contêiner venceu na Meta (24 horas sem publicar). Tente de novo." };
    }
    if (situacao === "ERROR") {
      return { tipo: "falhou", mensagem: `A Meta recusou o arquivo${detalhe ? `: ${detalhe}` : "."}` };
    }
    // Já publicado: a passagem anterior publicou e caiu antes de gravar.
    // Publicar de novo daria erro, e o post já está no ar.
    if (situacao === "PUBLISHED") return { tipo: "publicada", midiaId: null, link: null };

    const midiaId = await publicarConteiner(acesso, t.conteinerId);
    return { tipo: "publicada", midiaId, link: await linkDoPost(acesso, midiaId) };
  } catch (erro) {
    if (erro instanceof ErroDaMeta) {
      if (erro.precisaReconectar) {
        return { tipo: "falhou", mensagem: `${erro.message} Reconecte o Instagram e tente de novo.` };
      }
      return erro.permanente ? { tipo: "falhou", mensagem: erro.message } : { tipo: "falha_passageira", mensagem: erro.message };
    }
    console.error("[instagram] falha inesperada ao falar com a Meta.");
    return { tipo: "falha_passageira", mensagem: "Falha interna do CRM ao falar com a Meta." };
  }
}

/** A permissão válida, renovada se já tem uma semana. Sem conta, nada a fazer. */
async function acessoValido(): Promise<Acesso | null> {
  const conta = await emTransacao(instagram.acessoDaConta);
  if (!conta) return null;

  const agora = Date.now();
  const ultima = estado.ultimaRenovacaoInstagram ?? 0;
  // Uma tentativa por hora: se a Meta recusar, não insistir a cada passagem.
  if (precisaRenovar(conta.renovadoEm, conta.expiraEm) && agora - ultima > 3_600_000) {
    estado.ultimaRenovacaoInstagram = agora;
    try {
      const novo = await renovarToken(conta.token);
      await emTransacao((tx) => instagram.atualizarToken(tx, novo.token, novo.expiraEm));
      return { token: novo.token, usuarioId: conta.usuarioId };
    } catch {
      console.error("[instagram] não renovou a permissão; nova tentativa em uma hora.");
    }
  }
  if (new Date(conta.expiraEm).getTime() <= agora) return null;
  return { token: conta.token, usuarioId: conta.usuarioId };
}

/** Uma passagem. Exportada para o teste ensaiar sem relógio. */
export async function passarAgendaInstagram(): Promise<void> {
  if (!process.env.DATABASE_URL || faltandoParaInstagram().length > 0) return;

  const agora = Date.now();
  if (agora - (estado.ultimaLimpezaInstagram ?? 0) > 3_600_000) {
    estado.ultimaLimpezaInstagram = agora;
    const antigos = await emTransacao(instagram.liberarArquivosAntigos);
    if (antigos.length) await apagarArquivos(antigos).catch(() => {});
  }

  const acesso = await acessoValido();
  if (!acesso) return;

  // Algumas por passagem: um carrossel processando não segura o resto da fila.
  for (let i = 0; i < 3; i++) {
    const trabalho = await emTransacao(instagram.reservarPublicacao);
    if (!trabalho) break;
    const andamento = await avancarPublicacao(trabalho, acesso);
    const arquivos = await emTransacao((tx) => instagram.registrarAndamento(tx, trabalho, andamento));
    if (andamento.tipo === "publicada") console.info(`[instagram] publicada ${trabalho.id}`);
    if (andamento.tipo === "falhou") console.warn(`[instagram] falhou ${trabalho.id}`);
    if (arquivos.length) {
      await apagarArquivos(arquivos).catch(() => console.error("[instagram] arquivos publicados ficaram no volume."));
    }
  }
}

export function iniciarAgendaInstagram(): void {
  if (estado.agendaInstagram) return;
  const executar = async () => {
    if (estado.passandoInstagram) return;
    estado.passandoInstagram = true;
    try {
      await passarAgendaInstagram();
    } catch {
      console.error("[instagram] agenda temporariamente indisponível; nova tentativa em breve.");
    } finally {
      estado.passandoInstagram = false;
    }
  };
  // Só o despertador é local. Horários, andamento e reservas moram no banco.
  estado.agendaInstagram = setInterval(() => void executar(), 15_000);
  estado.agendaInstagram.unref();
  void executar();
}
