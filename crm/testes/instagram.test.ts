import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { emTransacao } from "@/lib/banco";
import * as instagram from "@/lib/instagram";
import {
  cifrar,
  decifrar,
  dimensoesDoJpeg,
  formatoDoArquivo,
  lerHorario,
  precisaRenovar,
  validarArquivos,
  validarLegenda,
} from "@/lib/instagram-regras";
import { salvarArquivo } from "@/lib/midia";
import { passarAgendaInstagram } from "@/lib/processamento-instagram";

import { bancoDeTeste } from "./banco-de-teste";

vi.mock("@/lib/banco", () => ({ emTransacao: vi.fn() }));

const SEGREDO = "segredo-de-teste-com-mais-de-32-caracteres";
let pasta: string;

beforeEach(() => {
  pasta = mkdtempSync(join(tmpdir(), "midia-"));
  vi.stubEnv("PASTA_MIDIA", pasta);
  vi.stubEnv("SESSAO_SEGREDO", SEGREDO);
  vi.stubEnv("INSTAGRAM_APP_ID", "111");
  vi.stubEnv("INSTAGRAM_APP_SECRET", "segredo-do-app");
  vi.stubEnv("INSTAGRAM_GRAPH_VERSION", "v26.0");
  vi.stubEnv("APP_URL", "https://crm.exemplo.com");
  vi.stubEnv("DATABASE_URL", "postgres://teste");
  // O agendador guarda em globalThis quando renovou e limpou pela última vez.
  const global = globalThis as Record<string, unknown>;
  delete global.ultimaRenovacaoInstagram;
  delete global.ultimaLimpezaInstagram;
});

afterEach(() => {
  rmSync(pasta, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// -----------------------------------------------------------------------------
// Arquivos de mentira, com o cabeçalho que importa
// -----------------------------------------------------------------------------

function jpeg(largura: number, altura: number): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, ...Array(14).fill(0)];
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, altura >> 8, altura & 0xff, largura >> 8, largura & 0xff, 0x03, ...Array(9).fill(0)];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof0, 0xff, 0xd9, ...Array(16).fill(0)]);
}

const mp4 = () => new Uint8Array([0, 0, 0, 0x18, ...Buffer.from("ftypisom"), ...Array(32).fill(0)]);

async function salvoJpeg(largura: number, altura: number): Promise<instagram.ArquivoSalvo> {
  const dados = jpeg(largura, altura);
  return { formato: "jpeg", bytes: dados.length, largura, altura, tipoMime: "image/jpeg", arquivo: await salvarArquivo("jpg", dados) };
}

async function salvoMp4(): Promise<instagram.ArquivoSalvo> {
  const dados = mp4();
  return { formato: "mp4", bytes: dados.length, tipoMime: "video/mp4", arquivo: await salvarArquivo("mp4", dados) };
}

// -----------------------------------------------------------------------------
// Regras
// -----------------------------------------------------------------------------

describe("regras da publicação", () => {
  it("reconhece o arquivo pelo conteúdo e lê o tamanho do JPEG", () => {
    expect(formatoDoArquivo(jpeg(1080, 1350))).toBe("jpeg");
    expect(formatoDoArquivo(mp4())).toBe("mp4");
    expect(formatoDoArquivo(new Uint8Array([0, 0, 0, 0x14, ...Buffer.from("ftypqt  "), 0, 0, 0, 0]))).toBe("mov");
    expect(formatoDoArquivo(new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...Array(12).fill(0)]))).toBe("png");
    expect(formatoDoArquivo(new Uint8Array(20))).toBeNull();
    expect(dimensoesDoJpeg(jpeg(1080, 1350))).toEqual({ largura: 1080, altura: 1350 });
    expect(dimensoesDoJpeg(new Uint8Array([0xff, 0xd8, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]))).toBeNull();
  });

  it("confere o que cada tipo pede", () => {
    const video = { formato: "mp4" as const, bytes: 1000 };
    const foto = (largura: number, altura: number) => ({ formato: "jpeg" as const, bytes: 1000, largura, altura });
    expect(() => validarArquivos("reel", [video], foto(1080, 1920))).not.toThrow();
    expect(() => validarArquivos("reel", [foto(1080, 1350)])).toThrow(/vídeo/);
    expect(() => validarArquivos("foto", [{ formato: "png", bytes: 10, largura: 1080, altura: 1080 }])).toThrow(/JPEG/);
    expect(() => validarArquivos("foto", [foto(1080, 1920)])).toThrow(/não cabe no feed/);
    expect(() => validarArquivos("foto", [foto(1080, 1080)], foto(1080, 1080))).toThrow(/Só o Reel/);
    expect(() => validarArquivos("carrossel", [foto(1080, 1350)])).toThrow(/pelo menos 2/);
    expect(() => validarArquivos("carrossel", Array(21).fill(foto(1080, 1080)))).toThrow(/até 20/);
    expect(() => validarArquivos("carrossel", [foto(1080, 1350), video])).not.toThrow();
  });

  it("confere a legenda e o horário", () => {
    expect(validarLegenda("  Oi #ia  ")).toBe("Oi #ia");
    expect(() => validarLegenda(Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(" "))).toThrow(/30 hashtags/);
    expect(() => validarLegenda("a".repeat(2201))).toThrow(/2200/);

    const agora = new Date("2026-10-22T12:00:00Z");
    expect(lerHorario("2026-10-27T10:00", agora).toISOString()).toBe("2026-10-27T13:00:00.000Z");
    expect(lerHorario("", agora)).toBe(agora);
    expect(() => lerHorario("2026-10-21T10:00", agora)).toThrow(/já passou/);
    expect(() => lerHorario("27/10 10h", agora)).toThrow(/inválido/);
  });

  it("renova a permissão depois de uma semana, nunca a vencida", () => {
    const agora = new Date("2026-10-22T12:00:00Z");
    const dias = (n: number) => new Date(agora.getTime() + n * 86_400_000);
    expect(precisaRenovar(dias(-8), dias(52), agora)).toBe(true);
    expect(precisaRenovar(dias(-2), dias(58), agora)).toBe(false);
    expect(precisaRenovar(dias(-61), dias(-1), agora)).toBe(false);
  });

  it("cifra a permissão e recusa chave errada ou texto mexido", () => {
    const guardado = cifrar("IGAA-permissao", SEGREDO);
    expect(guardado).not.toContain("IGAA");
    expect(decifrar(guardado, SEGREDO)).toBe("IGAA-permissao");
    expect(() => decifrar(guardado, `${SEGREDO}-outro`)).toThrow();
    const [v, iv, etiqueta, cifrado] = guardado.split(".");
    const bytes = Buffer.from(cifrado, "base64url");
    bytes[0] ^= 1;
    const mexido = [v, iv, etiqueta, bytes.toString("base64url")].join(".");
    expect(() => decifrar(mexido, SEGREDO)).toThrow();
  });
});

// -----------------------------------------------------------------------------
// Fila no banco
// -----------------------------------------------------------------------------

const daquiA = (minutos: number) => new Date(Date.now() + minutos * 60_000);

describe("fila de publicações", () => {
  it("o que o Bruno envia entra agendado; o do agente espera aprovação", async () => {
    const { tx } = await bancoDeTeste();
    const doBruno = await instagram.criarPublicacao(
      tx, { tipo: "reel", legenda: "Oi", mostrarNoFeed: true, agendadaPara: daquiA(-1), itens: [await salvoMp4()] }, "bruno",
    );
    const doAgente = await instagram.criarPublicacao(
      tx, { tipo: "reel", legenda: "Oi", mostrarNoFeed: true, agendadaPara: daquiA(-1), itens: [await salvoMp4()] }, "agente:claude",
    );
    expect(doBruno.estado).toBe("agendada");
    expect(doAgente.estado).toBe("aguardando_aprovacao");
    expect(await instagram.contarAguardandoAprovacao(tx)).toBe(1);

    // O agendador pega a do Bruno e ignora a do agente.
    const primeira = await instagram.reservarPublicacao(tx);
    expect(primeira?.id).toBe(doBruno.id);
    expect(await instagram.reservarPublicacao(tx)).toBeNull();

    await expect(instagram.aprovarPublicacao(tx, doAgente.id, "agente:claude")).rejects.toThrow(/Só o Bruno/);
    await instagram.aprovarPublicacao(tx, doAgente.id, "bruno");
    expect((await instagram.reservarPublicacao(tx))?.id).toBe(doAgente.id);
    await expect(instagram.aprovarPublicacao(tx, doAgente.id, "bruno")).rejects.toThrow(/não está esperando/);
  });

  it("não pega antes do horário, e a reserva impede pegar duas vezes", async () => {
    const { tx } = await bancoDeTeste();
    const futura = await instagram.criarPublicacao(
      tx, { tipo: "foto", legenda: "", mostrarNoFeed: true, agendadaPara: daquiA(60), itens: [await salvoJpeg(1080, 1350)] }, "bruno",
    );
    expect(await instagram.reservarPublicacao(tx)).toBeNull();
    await instagram.publicarAgora(tx, futura.id);
    const trabalho = await instagram.reservarPublicacao(tx);
    expect(trabalho?.id).toBe(futura.id);
    expect(await instagram.reservarPublicacao(tx)).toBeNull();

    // Quem perdeu a reserva não grava por cima.
    await tx.query("update crm.publicacao set reserva = gen_random_uuid()");
    expect(await instagram.registrarAndamento(tx, trabalho!, { tipo: "falhou", mensagem: "x" })).toEqual([]);
    expect((await instagram.lerPublicacao(tx, futura.id))?.estado).toBe("agendada");
  });

  it("o link do arquivo só abre sem login enquanto está na fila", async () => {
    const { tx } = await bancoDeTeste();
    const p = await instagram.criarPublicacao(
      tx, { tipo: "reel", legenda: "", mostrarNoFeed: true, agendadaPara: daquiA(30), itens: [await salvoMp4()] }, "agente:claude",
    );
    const [midia] = (await instagram.lerPublicacao(tx, p.id))!.midias;
    expect((await instagram.midiaPelaChave(tx, midia.chave))?.liberada).toBe(false);
    await instagram.aprovarPublicacao(tx, p.id, "bruno");
    expect((await instagram.midiaPelaChave(tx, midia.chave))?.liberada).toBe(true);

    const arquivos = await instagram.cancelarPublicacao(tx, p.id);
    expect(arquivos).toHaveLength(1);
    expect(await instagram.midiaPelaChave(tx, midia.chave)).toBeNull();
    expect(await instagram.midiaPelaChave(tx, "curta")).toBeNull();
    await expect(instagram.tentarDeNovo(tx, p.id)).rejects.toThrow(/falhou/);
  });

  it("desconectar apaga a permissão guardada", async () => {
    const { tx } = await bancoDeTeste();
    await instagram.salvarConta(tx, { usuarioId: "1789", nomeUsuario: "shift_systemss", token: "IGAA-1", expiraEm: daquiA(60 * 24 * 60) });
    const { rows } = await tx.query<{ token_cifrado: string }>("select token_cifrado from crm.conta_instagram");
    expect(rows[0].token_cifrado).not.toContain("IGAA");
    expect((await instagram.acessoDaConta(tx))?.token).toBe("IGAA-1");
    await instagram.desconectarConta(tx);
    expect(await instagram.lerConta(tx)).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// Agendador, com a Meta simulada
// -----------------------------------------------------------------------------

interface Chamada { url: URL; metodo: string; corpo: unknown; autorizacao?: string }
type Resposta = { status?: number; corpo: unknown };

/** Simula a Meta: cada chamada passa por `responder`, e fica registrada. */
function meta(responder: (c: Chamada) => Resposta) {
  const chamadas: Chamada[] = [];
  vi.stubGlobal("fetch", vi.fn(async (endereco: string, opcoes: RequestInit = {}) => {
    const cabecalhos = (opcoes.headers ?? {}) as Record<string, string>;
    const corpo = typeof opcoes.body === "string" ? JSON.parse(opcoes.body) : opcoes.body ? String(opcoes.body) : undefined;
    const chamada = { url: new URL(endereco), metodo: opcoes.method ?? "GET", corpo, autorizacao: cabecalhos.Authorization };
    chamadas.push(chamada);
    const { status = 200, corpo: resposta } = responder(chamada);
    return Response.json(resposta, { status });
  }));
  return chamadas;
}

async function preparar() {
  const { tx } = await bancoDeTeste();
  vi.mocked(emTransacao).mockImplementation(async (executar) => {
    await tx.query("begin");
    try {
      const resultado = await executar(tx);
      await tx.query("commit");
      return resultado;
    } catch (erro) {
      await tx.query("rollback");
      throw erro;
    }
  });
  await instagram.salvarConta(tx, { usuarioId: "1789", nomeUsuario: "shift_systemss", token: "IGAA-atual", expiraEm: daquiA(50 * 24 * 60) });
  const proximaPassagem = () => tx.query("update crm.publicacao set proxima_verificacao = now() - interval '1 second' where proxima_verificacao is not null");
  return { tx, proximaPassagem };
}

describe("agendador do Instagram", () => {
  it("publica um Reel: contêiner, espera o processamento, publica e apaga o arquivo", async () => {
    const { tx, proximaPassagem } = await preparar();
    const video = await salvoMp4();
    const capa = await salvoJpeg(1080, 1920);
    const p = await instagram.criarPublicacao(
      tx, { tipo: "reel", legenda: "Nem tudo é agente.", mostrarNoFeed: false, agendadaPara: daquiA(-1), itens: [video], capa }, "bruno",
    );
    let situacao = "IN_PROGRESS";
    const chamadas = meta(({ url, metodo }) => {
      if (metodo === "POST" && url.pathname.endsWith("/1789/media")) return { corpo: { id: "900" } };
      if (url.pathname.endsWith("/900")) return { corpo: { status_code: situacao } };
      if (url.pathname.endsWith("/1789/media_publish")) return { corpo: { id: "777" } };
      if (url.pathname.endsWith("/777")) return { corpo: { permalink: "https://www.instagram.com/reel/abc/" } };
      return { status: 404, corpo: {} };
    });

    await passarAgendaInstagram();
    const criar = chamadas[0];
    expect(criar.url.toString()).toBe("https://graph.instagram.com/v26.0/1789/media");
    expect(criar.autorizacao).toBe("Bearer IGAA-atual");
    const { midias } = (await instagram.lerPublicacao(tx, p.id))!;
    const chaveVideo = midias.find((m) => m.papel === "item")!.chave;
    const chaveCapa = midias.find((m) => m.papel === "capa")!.chave;
    expect(criar.corpo).toEqual({
      media_type: "REELS",
      video_url: `https://crm.exemplo.com/api/instagram/midia/${chaveVideo}`,
      cover_url: `https://crm.exemplo.com/api/instagram/midia/${chaveCapa}`,
      share_to_feed: false,
      caption: "Nem tudo é agente.",
    });
    expect((await instagram.lerPublicacao(tx, p.id))?.estado).toBe("preparando");

    // Antes da hora de conferir, nada acontece.
    await passarAgendaInstagram();
    expect(chamadas).toHaveLength(1);

    await proximaPassagem();
    await passarAgendaInstagram();
    expect((await instagram.lerPublicacao(tx, p.id))?.estado).toBe("preparando");

    situacao = "FINISHED";
    await proximaPassagem();
    await passarAgendaInstagram();
    const publicada = (await instagram.lerPublicacao(tx, p.id))!;
    expect(publicada.estado).toBe("publicada");
    expect(publicada.link).toBe("https://www.instagram.com/reel/abc/");
    expect(chamadas.find((c) => c.url.pathname.endsWith("/media_publish"))?.corpo).toEqual({ creation_id: "900" });
    expect(existsSync(join(pasta, video.arquivo))).toBe(false);
    expect(existsSync(join(pasta, capa.arquivo))).toBe(false);
    expect(await instagram.midiaPelaChave(tx, chaveVideo)).toBeNull();
  });

  it("monta o carrossel só depois que todos os itens ficam prontos", async () => {
    const { tx, proximaPassagem } = await preparar();
    const p = await instagram.criarPublicacao(
      tx, { tipo: "carrossel", legenda: "Três passos", mostrarNoFeed: true, agendadaPara: daquiA(-1),
        itens: [await salvoJpeg(1080, 1350), await salvoMp4()] }, "bruno",
    );
    let proximo = 10;
    let segundoPronto = false;
    const chamadas = meta(({ url, metodo }) => {
      if (metodo === "POST" && url.pathname.endsWith("/1789/media")) return { corpo: { id: String(proximo++) } };
      if (url.pathname.endsWith("/10")) return { corpo: { status_code: "FINISHED" } };
      if (url.pathname.endsWith("/11")) return { corpo: { status_code: segundoPronto ? "FINISHED" : "IN_PROGRESS" } };
      if (url.pathname.endsWith("/12")) return { corpo: { status_code: "FINISHED" } };
      if (url.pathname.endsWith("/media_publish")) return { corpo: { id: "555" } };
      return { corpo: { permalink: "https://www.instagram.com/p/xyz/" } };
    });

    await passarAgendaInstagram();
    const criados = chamadas.filter((c) => c.metodo === "POST");
    expect(criados.map((c) => c.corpo)).toEqual([
      { image_url: expect.stringMatching(/\/api\/instagram\/midia\//), is_carousel_item: true },
      { media_type: "VIDEO", video_url: expect.stringMatching(/\/api\/instagram\/midia\//), is_carousel_item: true },
    ]);

    await proximaPassagem();
    await passarAgendaInstagram();
    expect(chamadas.filter((c) => c.metodo === "POST")).toHaveLength(2);

    segundoPronto = true;
    await proximaPassagem();
    await passarAgendaInstagram();
    expect(chamadas.filter((c) => c.metodo === "POST").at(-1)?.corpo).toEqual({
      media_type: "CAROUSEL", children: "10,11", caption: "Três passos",
    });

    await proximaPassagem();
    await passarAgendaInstagram();
    expect((await instagram.lerPublicacao(tx, p.id))?.estado).toBe("publicada");
  });

  it("arquivo recusado falha na hora; falha passageira tenta de novo e desiste na quinta", async () => {
    const { tx, proximaPassagem } = await preparar();
    const recusada = await instagram.criarPublicacao(
      tx, { tipo: "foto", legenda: "", mostrarNoFeed: true, agendadaPara: daquiA(-2), itens: [await salvoJpeg(1080, 1080)] }, "bruno",
    );
    meta(() => ({ status: 400, corpo: { error: { message: "Only photo or video can be accepted as media type.", code: 9004 } } }));
    await passarAgendaInstagram();
    const falha = (await instagram.lerPublicacao(tx, recusada.id))!;
    expect(falha.estado).toBe("falhou");
    expect(falha.erro).toMatch(/Only photo or video/);

    const passageira = await instagram.criarPublicacao(
      tx, { tipo: "foto", legenda: "", mostrarNoFeed: true, agendadaPara: daquiA(-1), itens: [await salvoJpeg(1080, 1080)] }, "bruno",
    );
    meta(() => ({ status: 500, corpo: { error: { message: "Service temporarily unavailable", is_transient: true } } }));
    for (let i = 1; i <= 4; i++) {
      await passarAgendaInstagram();
      const atual = (await instagram.lerPublicacao(tx, passageira.id))!;
      expect([atual.estado, atual.tentativas]).toEqual(["agendada", i]);
      await proximaPassagem();
    }
    await passarAgendaInstagram();
    expect((await instagram.lerPublicacao(tx, passageira.id))?.estado).toBe("falhou");

    // Tentar de novo recomeça do zero, com os arquivos ainda no volume.
    await instagram.tentarDeNovo(tx, passageira.id);
    const de_novo = (await instagram.lerPublicacao(tx, passageira.id))!;
    expect([de_novo.estado, de_novo.tentativas, de_novo.erro]).toEqual(["agendada", 0, null]);
  });

  it("não publica duas vezes o que a Meta já publicou", async () => {
    const { tx, proximaPassagem } = await preparar();
    const p = await instagram.criarPublicacao(
      tx, { tipo: "foto", legenda: "", mostrarNoFeed: true, agendadaPara: daquiA(-1), itens: [await salvoJpeg(1080, 1080)] }, "bruno",
    );
    const chamadas = meta(({ url, metodo }) =>
      metodo === "POST" ? { corpo: { id: "321" } } : { corpo: { status_code: url.pathname.endsWith("/321") ? "PUBLISHED" : "FINISHED" } },
    );
    await passarAgendaInstagram();
    await proximaPassagem();
    await passarAgendaInstagram();
    expect((await instagram.lerPublicacao(tx, p.id))?.estado).toBe("publicada");
    expect(chamadas.some((c) => c.url.pathname.endsWith("/media_publish"))).toBe(false);
  });

  it("renova a permissão de uma semana e segue com a nova", async () => {
    const { tx } = await preparar();
    await tx.query("update crm.conta_instagram set token_renovado_em = now() - interval '8 days'");
    const chamadas = meta(({ url }) =>
      url.pathname === "/refresh_access_token"
        ? { corpo: { access_token: "IGAA-renovada", token_type: "bearer", expires_in: 5_184_000 } }
        : { status: 404, corpo: {} },
    );
    await passarAgendaInstagram();
    expect(chamadas[0].url.searchParams.get("grant_type")).toBe("ig_refresh_token");
    expect((await instagram.acessoDaConta(tx))?.token).toBe("IGAA-renovada");
  });

  it("sem app configurado ou sem conta, não chama a Meta", async () => {
    const { tx } = await preparar();
    await instagram.criarPublicacao(
      tx, { tipo: "reel", legenda: "", mostrarNoFeed: true, agendadaPara: daquiA(-1), itens: [await salvoMp4()] }, "bruno",
    );
    const chamadas = meta(() => ({ corpo: { id: "1" } }));
    vi.stubEnv("INSTAGRAM_APP_SECRET", "");
    await passarAgendaInstagram();
    vi.stubEnv("INSTAGRAM_APP_SECRET", "segredo-do-app");
    await instagram.desconectarConta(tx);
    await passarAgendaInstagram();
    expect(chamadas).toHaveLength(0);
  });
});
