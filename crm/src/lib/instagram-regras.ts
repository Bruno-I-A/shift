/**
 * Regras da publicação no Instagram que não dependem de banco nem de rede.
 *
 * Os limites são os da Meta, conferidos antes de enviar: um arquivo que ela
 * recusa só aparece como erro na hora marcada, quando já não há ninguém olhando.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

import { ErroDeDominio } from "./dominio";

export const TIPOS_PUBLICACAO = [
  { id: "reel", nome: "Reel" },
  { id: "carrossel", nome: "Carrossel" },
  { id: "foto", nome: "Foto" },
] as const;

export type TipoPublicacao = (typeof TIPOS_PUBLICACAO)[number]["id"];
export const IDS_TIPO_PUBLICACAO = TIPOS_PUBLICACAO.map((t) => t.id) as [TipoPublicacao, ...TipoPublicacao[]];
export const nomeDoTipoPublicacao = (id: string) => TIPOS_PUBLICACAO.find((t) => t.id === id)?.nome ?? id;

export const LIMITES = {
  legenda: 2200,
  hashtags: 30,
  mencoes: 20,
  itensCarrossel: 20,
  /** A Meta aceita até 8 MB por foto. */
  bytesImagem: 8 * 1024 * 1024,
  /** Teto nosso, não da Meta: o envio passa inteiro pela memória do servidor. */
  bytesVideo: 100 * 1024 * 1024,
  /** Proporção das fotos do feed: de 4:5 (em pé) a 1,91:1 (deitada). */
  proporcaoMinima: 4 / 5,
  proporcaoMaxima: 1.91,
  /** Quanto tempo a Meta tem para processar o vídeo antes de desistirmos. */
  minutosPreparando: 30,
  tentativas: 5,
  diasNoFuturo: 365,
} as const;

// -----------------------------------------------------------------------------
// Legenda
// -----------------------------------------------------------------------------

export function validarLegenda(legenda: string): string {
  const texto = legenda.replace(/\r\n/g, "\n").trim();
  if (texto.length > LIMITES.legenda) {
    throw new ErroDeDominio(`A legenda vai até ${LIMITES.legenda} caracteres (está com ${texto.length}).`);
  }
  const hashtags = texto.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0;
  if (hashtags > LIMITES.hashtags) {
    throw new ErroDeDominio(`O Instagram aceita até ${LIMITES.hashtags} hashtags (a legenda tem ${hashtags}).`);
  }
  const mencoes = texto.match(/(^|[^\w])@[\w.]+/g)?.length ?? 0;
  if (mencoes > LIMITES.mencoes) {
    throw new ErroDeDominio(`O Instagram aceita até ${LIMITES.mencoes} menções (a legenda tem ${mencoes}).`);
  }
  return texto;
}

// -----------------------------------------------------------------------------
// Arquivos
// -----------------------------------------------------------------------------

export type FormatoArquivo = "jpeg" | "png" | "webp" | "mp4" | "mov";

/** Pelo conteúdo, não pelo nome: a extensão é o que o usuário quiser que seja. */
export function formatoDoArquivo(bytes: Uint8Array): FormatoArquivo | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  const ascii = (inicio: number, fim: number) => String.fromCharCode(...bytes.subarray(inicio, fim));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (ascii(4, 8) === "ftyp") return ascii(8, 12) === "qt  " ? "mov" : "mp4";
  return null;
}

/**
 * Largura e altura de um JPEG, lidas do cabeçalho do quadro (SOF).
 *
 * Os marcadores C4 (tabela de Huffman), C8 e CC (aritmética) ocupam a faixa
 * dos SOF sem serem um; o resto de C0 a CF é quadro.
 */
export function dimensoesDoJpeg(bytes: Uint8Array): { largura: number; altura: number } | null {
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marcador = bytes[i + 1];
    if (marcador === 0xff) {
      i += 1;
      continue;
    }
    const tamanho = (bytes[i + 2] << 8) | bytes[i + 3];
    const ehQuadro = marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador);
    if (ehQuadro) {
      const altura = (bytes[i + 5] << 8) | bytes[i + 6];
      const largura = (bytes[i + 7] << 8) | bytes[i + 8];
      return largura > 0 && altura > 0 ? { largura, altura } : null;
    }
    if (tamanho < 2) return null;
    i += 2 + tamanho;
  }
  return null;
}

export interface ArquivoEnviado {
  formato: FormatoArquivo;
  bytes: number;
  largura?: number;
  altura?: number;
}

const ehVideo = (a: ArquivoEnviado) => a.formato === "mp4" || a.formato === "mov";

function conferirImagem(arquivo: ArquivoEnviado, rotulo: string, exigirProporcao: boolean) {
  if (arquivo.formato === "png" || arquivo.formato === "webp") {
    throw new ErroDeDominio(`${rotulo}: a Meta só aceita foto em JPEG. Converta e envie de novo.`);
  }
  if (arquivo.formato !== "jpeg") throw new ErroDeDominio(`${rotulo}: esperava uma foto em JPEG.`);
  if (arquivo.bytes > LIMITES.bytesImagem) throw new ErroDeDominio(`${rotulo}: a foto passa de 8 MB.`);
  if (!arquivo.largura || !arquivo.altura) throw new ErroDeDominio(`${rotulo}: não consegui ler o tamanho da foto.`);
  if (exigirProporcao) {
    const proporcao = arquivo.largura / arquivo.altura;
    if (proporcao < LIMITES.proporcaoMinima - 0.005 || proporcao > LIMITES.proporcaoMaxima + 0.005) {
      throw new ErroDeDominio(
        `${rotulo}: ${arquivo.largura}×${arquivo.altura} não cabe no feed. A proporção vai de 4:5 (em pé) a 1,91:1 (deitada).`,
      );
    }
  }
}

function conferirVideo(arquivo: ArquivoEnviado, rotulo: string) {
  if (!ehVideo(arquivo)) throw new ErroDeDominio(`${rotulo}: esperava um vídeo MP4 ou MOV.`);
  if (arquivo.bytes > LIMITES.bytesVideo) throw new ErroDeDominio(`${rotulo}: o vídeo passa de 100 MB.`);
}

/** O que cada tipo de publicação pede, conferido antes de gravar qualquer coisa. */
export function validarArquivos(tipo: TipoPublicacao, itens: ArquivoEnviado[], capa?: ArquivoEnviado | null): void {
  if (tipo === "reel") {
    if (itens.length !== 1) throw new ErroDeDominio("O Reel leva um vídeo só.");
    conferirVideo(itens[0], "Vídeo");
    if (capa) conferirImagem(capa, "Capa", false);
    return;
  }
  if (capa) throw new ErroDeDominio("Só o Reel tem capa separada.");
  if (tipo === "foto") {
    if (itens.length !== 1) throw new ErroDeDominio("A publicação de foto leva uma foto só. Para mais, use carrossel.");
    conferirImagem(itens[0], "Foto", true);
    return;
  }
  if (itens.length < 2) throw new ErroDeDominio("O carrossel precisa de pelo menos 2 itens.");
  if (itens.length > LIMITES.itensCarrossel) {
    throw new ErroDeDominio(`O carrossel vai até ${LIMITES.itensCarrossel} itens.`);
  }
  itens.forEach((item, i) =>
    ehVideo(item) ? conferirVideo(item, `Item ${i + 1}`) : conferirImagem(item, `Item ${i + 1}`, true),
  );
}

// -----------------------------------------------------------------------------
// Horário
// -----------------------------------------------------------------------------

/**
 * "2026-10-27T10:00", como sai do campo de data e hora, no fuso de São Paulo.
 * Desde 2019 o Brasil não tem horário de verão, então o deslocamento é fixo.
 * Vazio quer dizer "agora".
 */
export function lerHorario(valor: string | null | undefined, agora = new Date()): Date {
  const texto = (valor ?? "").trim();
  if (!texto) return agora;
  const casou = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(texto);
  if (!casou) throw new ErroDeDominio("Horário inválido. Use dia e hora, como 27/10 às 10:00.");
  const data = new Date(`${texto}:00-03:00`);
  if (Number.isNaN(data.getTime())) throw new ErroDeDominio("Horário inválido.");
  if (data.getTime() < agora.getTime() - 60_000) {
    throw new ErroDeDominio("Esse horário já passou. Para publicar já, deixe o horário em branco.");
  }
  if (data.getTime() > agora.getTime() + LIMITES.diasNoFuturo * 86_400_000) {
    throw new ErroDeDominio("Dá para agendar até um ano à frente.");
  }
  return data;
}

/** O inverso de `lerHorario`: a data no formato do campo, em São Paulo. */
export function paraCampoDeHorario(data = new Date()): string {
  return new Date(data.getTime() - 3 * 3_600_000).toISOString().slice(0, 16);
}

/** Espera antes da próxima tentativa, depois de uma falha passageira. */
export function esperaAposFalha(tentativas: number): number {
  const minutos = [1, 5, 15, 30, 60];
  return minutos[Math.min(Math.max(tentativas, 1), minutos.length) - 1] * 60_000;
}

/**
 * A permissão da Meta vale 60 dias e só pode ser renovada depois de 24 horas.
 * Renovar toda semana deixa sempre mais de 50 dias de folga.
 */
export function precisaRenovar(renovadoEm: Date, expiraEm: Date, agora = new Date()): boolean {
  if (expiraEm.getTime() <= agora.getTime()) return false;
  return agora.getTime() - renovadoEm.getTime() >= 7 * 86_400_000;
}

// -----------------------------------------------------------------------------
// Cifra da permissão
// -----------------------------------------------------------------------------

function chaveDaCifra(segredo: string): Buffer {
  if (!segredo || segredo.length < 32) throw new Error("SESSAO_SEGREDO ausente ou curto para cifrar a permissão.");
  return Buffer.from(hkdfSync("sha256", segredo, "shift-crm", "permissao-instagram", 32));
}

/** AES-256-GCM: `v1.<iv>.<etiqueta>.<cifrado>`, tudo em base64url. */
export function cifrar(texto: string, segredo: string): string {
  const iv = randomBytes(12);
  const cifra = createCipheriv("aes-256-gcm", chaveDaCifra(segredo), iv);
  const cifrado = Buffer.concat([cifra.update(texto, "utf8"), cifra.final()]);
  return ["v1", iv, cifra.getAuthTag(), cifrado].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decifrar(guardado: string, segredo: string): string {
  const [versao, iv, etiqueta, cifrado] = guardado.split(".");
  if (versao !== "v1" || !iv || !etiqueta || !cifrado) throw new Error("Permissão guardada em formato desconhecido.");
  const decifra = createDecipheriv("aes-256-gcm", chaveDaCifra(segredo), Buffer.from(iv, "base64url"));
  decifra.setAuthTag(Buffer.from(etiqueta, "base64url"));
  return Buffer.concat([decifra.update(Buffer.from(cifrado, "base64url")), decifra.final()]).toString("utf8");
}
