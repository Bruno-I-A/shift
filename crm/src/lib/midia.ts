import "server-only";

import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import { Readable } from "node:stream";

/**
 * Os arquivos das publicações: vídeos, fotos e capas, até a Meta buscá-los.
 *
 * Moram num volume do Easypanel (`PASTA_MIDIA`, `/app/midia` na imagem). Sem
 * volume eles sumiriam na implantação seguinte — e uma publicação agendada
 * para depois dela falharia sem que nada avisasse antes. Por isso a rota de
 * saúde confere se a pasta é mesmo um ponto de montagem.
 */

export function pastaDeMidia(): string {
  return process.env.PASTA_MIDIA || join(/*turbopackIgnore: true*/ process.cwd(), ".midia-local");
}

const NOME = /^[0-9a-f-]{36}\.(jpg|mp4|mov)$/;

function caminho(arquivo: string): string {
  if (!NOME.test(arquivo)) throw new Error("nome de arquivo inesperado");
  return join(pastaDeMidia(), arquivo);
}

export const EXTENSAO = { jpeg: "jpg", mp4: "mp4", mov: "mov" } as const;

export async function salvarArquivo(extensao: (typeof EXTENSAO)[keyof typeof EXTENSAO], dados: Uint8Array): Promise<string> {
  const arquivo = `${randomUUID()}.${extensao}`;
  await mkdir(/*turbopackIgnore: true*/ pastaDeMidia(), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ caminho(arquivo), dados, { flag: "wx" });
  return arquivo;
}

export async function apagarArquivos(arquivos: string[]): Promise<void> {
  await Promise.all(arquivos.map((a) => rm(/*turbopackIgnore: true*/ caminho(a), { force: true })));
}

/**
 * Resposta HTTP com o arquivo, aceitando um intervalo (`Range: bytes=a-b`):
 * é como o navegador pede vídeo para poder pular, e a Meta pode pedir assim.
 */
export async function responderArquivo(
  arquivo: string,
  tipoMime: string,
  pedido: Request,
): Promise<Response> {
  const local = caminho(arquivo);
  let tamanho: number;
  try {
    tamanho = (await stat(/*turbopackIgnore: true*/ local)).size;
  } catch {
    return new Response("Não encontrado.", { status: 404 });
  }

  const cabecalhos: Record<string, string> = {
    "Content-Type": tipoMime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
  };
  const cabeca = pedido.method === "HEAD";

  const intervalo = /^bytes=(\d*)-(\d*)$/.exec(pedido.headers.get("range") ?? "");
  if (intervalo && (intervalo[1] || intervalo[2])) {
    const inicio = intervalo[1] ? Number(intervalo[1]) : Math.max(0, tamanho - Number(intervalo[2]));
    const fim = intervalo[1] && intervalo[2] ? Math.min(Number(intervalo[2]), tamanho - 1) : tamanho - 1;
    if (inicio > fim || inicio >= tamanho) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${tamanho}` } });
    }
    const corpo = cabeca ? null : (Readable.toWeb(createReadStream(local, { start: inicio, end: fim })) as ReadableStream);
    return new Response(corpo, {
      status: 206,
      headers: { ...cabecalhos, "Content-Range": `bytes ${inicio}-${fim}/${tamanho}`, "Content-Length": String(fim - inicio + 1) },
    });
  }

  const corpo = cabeca ? null : (Readable.toWeb(createReadStream(local)) as ReadableStream);
  return new Response(corpo, { status: 200, headers: { ...cabecalhos, "Content-Length": String(tamanho) } });
}

/**
 * Um volume montado tem `dev` diferente do diretório que o contém: são
 * sistemas de arquivos distintos. Mesmo teste do `mountpoint(1)` — e do Beto
 * Galina, onde a pasta existia, gravava, e não era volume.
 */
async function ehMontagem(pasta: string): Promise<boolean> {
  try {
    const [aqui, acima] = await Promise.all([
      stat(/*turbopackIgnore: true*/ pasta),
      stat(/*turbopackIgnore: true*/ dirname(pasta)),
    ]);
    return aqui.dev !== acima.dev;
  } catch {
    return false;
  }
}

/** Para a rota de saúde: a pasta grava, e sobrevive à próxima implantação? */
export async function conferirPastaDeMidia(): Promise<{ ok: boolean; detalhe: string }> {
  const pasta = pastaDeMidia();
  try {
    await mkdir(/*turbopackIgnore: true*/ pasta, { recursive: true });
    const teste = join(pasta, `.escrita-${randomUUID()}`);
    await writeFile(/*turbopackIgnore: true*/ teste, "ok");
    await rm(/*turbopackIgnore: true*/ teste, { force: true });
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    return { ok: false, detalhe: `não grava em ${pasta}${sep === "\\" ? "" : " — confira o dono do volume"}: ${motivo}` };
  }
  if (process.env.NODE_ENV !== "production") return { ok: true, detalhe: pasta };
  return (await ehMontagem(pasta))
    ? { ok: true, detalhe: `${pasta}, em volume montado` }
    : { ok: false, detalhe: `${pasta} grava, mas NÃO é volume: os arquivos somem na próxima implantação.` };
}
