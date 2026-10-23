import * as z from "zod";

import { emTransacao } from "@/lib/banco";
import { autenticarAgente, type Ator } from "@/lib/crm";
import { ErroDeDominio } from "@/lib/dominio";
import { criarPublicacao, type ArquivoSalvo } from "@/lib/instagram";
import {
  dimensoesDoJpeg,
  formatoDoArquivo,
  IDS_TIPO_PUBLICACAO,
  lerHorario,
  LIMITES,
  validarArquivos,
  type ArquivoEnviado,
} from "@/lib/instagram-regras";
import { apagarArquivos, EXTENSAO, salvarArquivo } from "@/lib/midia";
import { PREFIXO_TOKEN } from "@/lib/segredos";
import { temSessao } from "@/lib/sessao";

/**
 * Recebe uma publicação nova, com os arquivos. É rota e não Server Action
 * porque Server Action lê o corpo inteiro antes de qualquer conferência, e
 * aqui o corpo é um vídeo.
 *
 * Dois jeitos de entrar:
 * - a tela, com a sessão do Bruno: a publicação já entra agendada;
 * - um agente, com a chave do MCP (`Authorization: Bearer scrm_…`): entra
 *   esperando a aprovação do Bruno.
 *
 * Campos (multipart): `tipo` (reel | carrossel | foto), `legenda`,
 * `horario` ("2026-10-27T10:00", São Paulo; vazio = agora), `mostrar_no_feed`
 * ("sim" | "nao", só Reel), `item` (um ou mais arquivos, em ordem) e `capa`
 * (opcional, só Reel). Fotos em JPEG; vídeo em MP4 ou MOV.
 */
export const dynamic = "force-dynamic";

const TETO_DO_PEDIDO = LIMITES.bytesVideo + 25 * 1024 * 1024;

const erro = (mensagem: string, status = 400) => Response.json({ erro: mensagem }, { status });

async function quemEnvia(pedido: Request): Promise<Ator | null> {
  const token = /^Bearer\s+(\S+)$/i.exec(pedido.headers.get("authorization") ?? "")?.[1];
  if (token?.startsWith(PREFIXO_TOKEN)) {
    const agente = await emTransacao((tx) => autenticarAgente(tx, token));
    return agente ? `agente:${agente.nome}` : null;
  }
  if (!(await temSessao())) return null;
  // Com cookie, só do próprio CRM: o SameSite=Lax já barra POST de outro
  // site, e a origem conferida é a segunda trava.
  const origem = pedido.headers.get("origin");
  const app = process.env.APP_URL ? new URL(process.env.APP_URL).origin : null;
  if (origem && origem !== new URL(pedido.url).origin && origem !== app) return null;
  return "bruno";
}

const esquemaCampos = z.object({
  tipo: z.enum(IDS_TIPO_PUBLICACAO, { error: "Escolha Reel, carrossel ou foto." }),
  legenda: z.string().max(LIMITES.legenda + 200).default(""),
  horario: z.string().max(40).default(""),
  mostrar_no_feed: z.enum(["sim", "nao"]).default("sim"),
});

async function lerArquivo(arquivo: File, rotulo: string): Promise<{ dados: Uint8Array; enviado: ArquivoEnviado }> {
  const dados = new Uint8Array(await arquivo.arrayBuffer());
  const formato = formatoDoArquivo(dados);
  if (!formato) throw new ErroDeDominio(`${rotulo}: formato não reconhecido. Envie JPEG, MP4 ou MOV.`);
  const enviado: ArquivoEnviado = { formato, bytes: dados.length };
  if (formato === "jpeg") Object.assign(enviado, dimensoesDoJpeg(dados) ?? {});
  return { dados, enviado };
}

const MIME = { jpeg: "image/jpeg", mp4: "video/mp4", mov: "video/quicktime" } as const;

export async function POST(pedido: Request) {
  const ator = await quemEnvia(pedido);
  if (!ator) return erro("Entre no CRM ou use a chave do agente.", 401);

  const tamanho = Number(pedido.headers.get("content-length") ?? NaN);
  if (!Number.isFinite(tamanho)) return erro("Envio sem tamanho declarado.", 411);
  if (tamanho > TETO_DO_PEDIDO) return erro("O envio passa de 100 MB.", 413);

  const salvos: string[] = [];
  try {
    const form = await pedido.formData();
    const campos = esquemaCampos.safeParse({
      tipo: form.get("tipo") ?? undefined,
      legenda: form.get("legenda") ?? undefined,
      horario: form.get("horario") ?? undefined,
      mostrar_no_feed: form.get("mostrar_no_feed") ?? undefined,
    });
    if (!campos.success) return erro(campos.error.issues[0]?.message ?? "Dados inválidos.");

    const arquivos = form.getAll("item").filter((a): a is File => a instanceof File && a.size > 0);
    const capaEnviada = form.get("capa");
    const capaArquivo = capaEnviada instanceof File && capaEnviada.size > 0 ? capaEnviada : null;
    if (arquivos.length === 0) return erro("Envie o vídeo ou as fotos.");
    if (arquivos.length > LIMITES.itensCarrossel) return erro(`Até ${LIMITES.itensCarrossel} arquivos.`);

    const agendadaPara = lerHorario(campos.data.horario);
    const itens = await Promise.all(arquivos.map((a, i) => lerArquivo(a, arquivos.length > 1 ? `Item ${i + 1}` : "Arquivo")));
    const capa = capaArquivo ? await lerArquivo(capaArquivo, "Capa") : null;

    // Confere tudo antes de gravar o primeiro byte no volume.
    validarArquivos(campos.data.tipo, itens.map((i) => i.enviado), capa?.enviado);

    const guardar = async ({ dados, enviado }: { dados: Uint8Array; enviado: ArquivoEnviado }): Promise<ArquivoSalvo> => {
      const formato = enviado.formato as keyof typeof EXTENSAO;
      const arquivo = await salvarArquivo(EXTENSAO[formato], dados);
      salvos.push(arquivo);
      return { ...enviado, arquivo, tipoMime: MIME[formato] };
    };
    const itensSalvos: ArquivoSalvo[] = [];
    for (const item of itens) itensSalvos.push(await guardar(item));
    const capaSalva = capa ? await guardar(capa) : null;

    const criada = await emTransacao((tx) =>
      criarPublicacao(
        tx,
        {
          tipo: campos.data.tipo,
          legenda: campos.data.legenda,
          mostrarNoFeed: campos.data.mostrar_no_feed === "sim",
          agendadaPara,
          itens: itensSalvos,
          capa: capaSalva,
        },
        ator,
      ),
    );
    return Response.json({ id: criada.id, estado: criada.estado, agendada_para: agendadaPara.toISOString() }, { status: 201 });
  } catch (falha) {
    await apagarArquivos(salvos).catch(() => {});
    if (falha instanceof ErroDeDominio) return erro(falha.message);
    console.error("[instagram] envio de publicação falhou:", falha instanceof Error ? falha.message : "erro");
    return erro("Algo deu errado do nosso lado. Nada foi gravado.", 500);
  }
}
