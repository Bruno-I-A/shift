/**
 * Publicações no Instagram: a conta conectada, a fila e o andamento na Meta.
 *
 * Como em `crm.ts`, toda função recebe uma `Consulta` já dentro da transação.
 * A tela, a rota de envio e o MCP chamam as mesmas funções.
 *
 * O agente propõe, o Bruno aprova: o que um agente envia entra como
 * `aguardando_aprovacao` e o agendador não toca até o Bruno aprovar na tela.
 * O que o Bruno envia pela tela já entra agendado.
 */
import { randomBytes } from "node:crypto";

import type { Consulta } from "./consulta";
import type { Ator } from "./crm";
import { ErroDeDominio } from "./dominio";
import {
  cifrar,
  decifrar,
  esperaAposFalha,
  LIMITES,
  validarArquivos,
  validarLegenda,
  type ArquivoEnviado,
  type TipoPublicacao,
} from "./instagram-regras";

export type EstadoPublicacao =
  | "aguardando_aprovacao"
  | "agendada"
  | "preparando"
  | "publicada"
  | "falhou"
  | "cancelada";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function exigirId(id: string): string {
  if (!UUID.test(id)) throw new ErroDeDominio("Publicação não encontrada.");
  return id;
}

function segredo(): string {
  const valor = process.env.SESSAO_SEGREDO;
  if (!valor) throw new Error("Falta SESSAO_SEGREDO para cifrar a permissão do Instagram.");
  return valor;
}

// -----------------------------------------------------------------------------
// Conta
// -----------------------------------------------------------------------------

export interface ContaInstagram {
  usuarioId: string;
  nomeUsuario: string;
  tokenExpiraEm: Date;
  tokenRenovadoEm: Date;
  conectadaEm: Date;
  /** A permissão ainda vale. Calculado no banco, para a tela não depender do relógio. */
  valida: boolean;
}

export async function lerConta(tx: Consulta): Promise<ContaInstagram | null> {
  const { rows } = await tx.query<ContaInstagram>(
    `select usuario_id as "usuarioId", nome_usuario as "nomeUsuario", token_expira_em as "tokenExpiraEm",
            token_renovado_em as "tokenRenovadoEm", conectada_em as "conectadaEm",
            token_expira_em > now() as valida
       from crm.conta_instagram`,
  );
  return rows[0] ?? null;
}

export async function salvarConta(
  tx: Consulta,
  conta: { usuarioId: string; nomeUsuario: string; token: string; expiraEm: Date },
): Promise<void> {
  await tx.query(
    `insert into crm.conta_instagram (usuario_id, nome_usuario, token_cifrado, token_expira_em)
     values ($1, $2, $3, $4)
     on conflict (unica) do update
        set usuario_id = excluded.usuario_id, nome_usuario = excluded.nome_usuario,
            token_cifrado = excluded.token_cifrado, token_expira_em = excluded.token_expira_em,
            direct_assinado = case when conta_instagram.usuario_id = excluded.usuario_id then conta_instagram.direct_assinado else false end,
            token_renovado_em = now(), conectada_em = now()`,
    [conta.usuarioId, conta.nomeUsuario, cifrar(conta.token, segredo()), conta.expiraEm],
  );
}

export async function acessoDaConta(
  tx: Consulta,
): Promise<{ token: string; usuarioId: string; renovadoEm: Date; expiraEm: Date } | null> {
  const { rows } = await tx.query<{ usuarioId: string; cifrado: string; renovadoEm: Date; expiraEm: Date }>(
    `select usuario_id as "usuarioId", token_cifrado as cifrado, token_renovado_em as "renovadoEm",
            token_expira_em as "expiraEm"
       from crm.conta_instagram`,
  );
  const conta = rows[0];
  if (!conta) return null;
  return { token: decifrar(conta.cifrado, segredo()), usuarioId: conta.usuarioId, renovadoEm: conta.renovadoEm, expiraEm: conta.expiraEm };
}

export async function atualizarToken(tx: Consulta, token: string, expiraEm: Date): Promise<void> {
  await tx.query(
    "update crm.conta_instagram set token_cifrado = $1, token_expira_em = $2, token_renovado_em = now()",
    [cifrar(token, segredo()), expiraEm],
  );
}

export async function desconectarConta(tx: Consulta): Promise<void> {
  await tx.query("delete from crm.conta_instagram");
}

// -----------------------------------------------------------------------------
// Publicações
// -----------------------------------------------------------------------------

export interface ArquivoSalvo extends ArquivoEnviado {
  /** Nome no volume, ex.: "3f2c….mp4". */
  arquivo: string;
  tipoMime: "image/jpeg" | "video/mp4" | "video/quicktime";
}

export interface NovaPublicacao {
  tipo: TipoPublicacao;
  legenda: string;
  mostrarNoFeed: boolean;
  agendadaPara: Date;
  itens: ArquivoSalvo[];
  capa?: ArquivoSalvo | null;
}

export async function criarPublicacao(
  tx: Consulta,
  nova: NovaPublicacao,
  ator: Ator,
): Promise<{ id: string; estado: EstadoPublicacao }> {
  validarArquivos(nova.tipo, nova.itens, nova.capa);
  const legenda = validarLegenda(nova.legenda);
  const doBruno = ator === "bruno";

  const { rows } = await tx.query<{ id: string; estado: EstadoPublicacao }>(
    `insert into crm.publicacao (tipo, legenda, mostrar_no_feed, agendada_para, estado, criada_por, aprovada_em)
     values ($1, $2, $3, $4, $5, $6, case when $7::boolean then now() end)
     returning id, estado::text as estado`,
    [nova.tipo, legenda, nova.tipo === "reel" ? nova.mostrarNoFeed : true, nova.agendadaPara,
      doBruno ? "agendada" : "aguardando_aprovacao", ator, doBruno],
  );
  const publicacao = rows[0];

  const midias = [
    ...nova.itens.map((item, ordem) => ({ ...item, papel: "item", ordem })),
    ...(nova.capa ? [{ ...nova.capa, papel: "capa", ordem: 0 }] : []),
  ];
  for (const m of midias) {
    await tx.query(
      `insert into crm.midia_publicacao (publicacao_id, papel, ordem, arquivo, tipo_mime, bytes, largura, altura, chave)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [publicacao.id, m.papel, m.ordem, m.arquivo, m.tipoMime, m.bytes, m.largura ?? null, m.altura ?? null,
        randomBytes(32).toString("base64url")],
    );
  }
  return publicacao;
}

export interface MidiaPublicacao {
  papel: "item" | "capa";
  ordem: number;
  tipoMime: string;
  largura: number | null;
  altura: number | null;
  chave: string;
  apagada: boolean;
}

export interface Publicacao {
  id: string;
  tipo: TipoPublicacao;
  legenda: string;
  mostrarNoFeed: boolean;
  agendadaPara: Date;
  estado: EstadoPublicacao;
  criadaPor: string;
  criadaEm: Date;
  aprovadaEm: Date | null;
  link: string | null;
  publicadaEm: Date | null;
  erro: string | null;
  tentativas: number;
  /** O horário marcado já chegou. */
  vencida: boolean;
  /** Passou do horário há mais de dois minutos e ainda não saiu. */
  atrasada: boolean;
  midias: MidiaPublicacao[];
}

const COLUNAS = `p.id, p.tipo::text as tipo, p.legenda, p.mostrar_no_feed as "mostrarNoFeed",
  p.agendada_para as "agendadaPara", p.estado::text as estado, p.criada_por as "criadaPor",
  p.criada_em as "criadaEm", p.aprovada_em as "aprovadaEm", p.link, p.publicada_em as "publicadaEm",
  p.erro, p.tentativas, p.agendada_para <= now() as vencida,
  p.estado in ('agendada', 'preparando') and p.agendada_para < now() - interval '2 minutes' as atrasada`;

async function comMidias(tx: Consulta, publicacoes: Omit<Publicacao, "midias">[]): Promise<Publicacao[]> {
  if (publicacoes.length === 0) return [];
  const { rows } = await tx.query<MidiaPublicacao & { publicacaoId: string }>(
    `select publicacao_id as "publicacaoId", papel, ordem, tipo_mime as "tipoMime", largura, altura, chave,
            apagada_em is not null as apagada
       from crm.midia_publicacao
      where publicacao_id = any($1::uuid[])
      order by papel desc, ordem`,
    [publicacoes.map((p) => p.id)],
  );
  return publicacoes.map((p) => ({
    ...p,
    midias: rows
      .filter((m) => m.publicacaoId === p.id)
      .map((m) => ({ papel: m.papel, ordem: m.ordem, tipoMime: m.tipoMime, largura: m.largura, altura: m.altura, chave: m.chave, apagada: m.apagada })),
  }));
}

/** A fila inteira e o que saiu nos últimos 60 dias. */
export async function listarPublicacoes(tx: Consulta): Promise<Publicacao[]> {
  const { rows } = await tx.query<Omit<Publicacao, "midias">>(
    `select ${COLUNAS} from crm.publicacao p
      where p.estado in ('aguardando_aprovacao', 'agendada', 'preparando', 'falhou')
         or (p.estado = 'publicada' and p.publicada_em > now() - interval '60 days')
      order by coalesce(p.publicada_em, p.agendada_para) desc`,
  );
  return comMidias(tx, rows);
}

export async function lerPublicacao(tx: Consulta, id: string): Promise<Publicacao | null> {
  const { rows } = await tx.query<Omit<Publicacao, "midias">>(
    `select ${COLUNAS} from crm.publicacao p where p.id = $1`,
    [exigirId(id)],
  );
  return (await comMidias(tx, rows))[0] ?? null;
}

export async function contarAguardandoAprovacao(tx: Consulta): Promise<number> {
  const { rows } = await tx.query<{ n: number }>(
    "select count(*)::int as n from crm.publicacao where estado = 'aguardando_aprovacao'",
  );
  return rows[0]?.n ?? 0;
}

/** Só o Bruno aprova: é a regra que deixa o agente propor sem publicar sozinho. */
export async function aprovarPublicacao(tx: Consulta, id: string, ator: Ator): Promise<void> {
  if (ator !== "bruno") throw new ErroDeDominio("Só o Bruno aprova publicação.");
  const { rows } = await tx.query(
    `update crm.publicacao set estado = 'agendada', aprovada_em = now(), atualizada_em = now()
      where id = $1 and estado = 'aguardando_aprovacao' returning id`,
    [exigirId(id)],
  );
  if (!rows[0]) throw new ErroDeDominio("Essa publicação não está esperando aprovação.");
}

/** Cancela e devolve os arquivos que podem sair do volume. */
export async function cancelarPublicacao(tx: Consulta, id: string): Promise<string[]> {
  const { rows } = await tx.query<{ id: string }>(
    `update crm.publicacao set estado = 'cancelada', atualizada_em = now()
      where id = $1
        and estado in ('aguardando_aprovacao', 'agendada', 'preparando', 'falhou')
        and (reserva_ate is null or reserva_ate < now())
      returning id`,
    [exigirId(id)],
  );
  if (!rows[0]) {
    const atual = await lerPublicacao(tx, id);
    if (!atual) throw new ErroDeDominio("Publicação não encontrada.");
    if (["agendada", "preparando"].includes(atual.estado)) {
      throw new ErroDeDominio("O agendador está falando com a Meta sobre esta publicação agora. Tente em um minuto.");
    }
    throw new ErroDeDominio("Essa publicação não pode mais ser cancelada.");
  }
  return marcarArquivosApagados(tx, id);
}

async function marcarArquivosApagados(tx: Consulta, publicacaoId: string): Promise<string[]> {
  const { rows } = await tx.query<{ arquivo: string }>(
    `update crm.midia_publicacao set apagada_em = now()
      where publicacao_id = $1 and apagada_em is null returning arquivo`,
    [publicacaoId],
  );
  return rows.map((r) => r.arquivo);
}

/** Depois de uma falha: recomeça do zero, no horário marcado ou já, se ele passou. */
export async function tentarDeNovo(tx: Consulta, id: string): Promise<void> {
  const { rows } = await tx.query(
    `update crm.publicacao p
        set estado = 'agendada', erro = null, tentativas = 0, filhos = '{}', conteiner_id = null,
            preparando_desde = null, proxima_verificacao = null, agendada_para = greatest(agendada_para, now()),
            atualizada_em = now()
      where id = $1 and estado = 'falhou'
        and not exists (select 1 from crm.midia_publicacao m where m.publicacao_id = p.id and m.apagada_em is not null)
      returning id`,
    [exigirId(id)],
  );
  if (!rows[0]) throw new ErroDeDominio("Só dá para tentar de novo uma publicação que falhou e ainda tem os arquivos.");
}

export async function publicarAgora(tx: Consulta, id: string): Promise<void> {
  const { rows } = await tx.query(
    `update crm.publicacao set agendada_para = now(), proxima_verificacao = null, atualizada_em = now()
      where id = $1 and estado = 'agendada' returning id`,
    [exigirId(id)],
  );
  if (!rows[0]) throw new ErroDeDominio("Só uma publicação agendada pode ser adiantada.");
}

/**
 * Os arquivos de falhas esquecidas: depois de 30 dias sem ninguém tentar de
 * novo, saem do volume. A linha continua, para o histórico.
 */
export async function liberarArquivosAntigos(tx: Consulta): Promise<string[]> {
  const { rows } = await tx.query<{ arquivo: string }>(
    `update crm.midia_publicacao m set apagada_em = now()
       from crm.publicacao p
      where p.id = m.publicacao_id and m.apagada_em is null
        and p.estado = 'falhou' and p.atualizada_em < now() - interval '30 days'
      returning m.arquivo`,
  );
  return rows.map((r) => r.arquivo);
}

// -----------------------------------------------------------------------------
// Arquivos para a Meta
// -----------------------------------------------------------------------------

/**
 * O arquivo por trás de um link. `liberada` diz se o link responde sem login:
 * só enquanto a publicação está na fila, que é quando a Meta precisa dele.
 */
export async function midiaPelaChave(
  tx: Consulta,
  chave: string,
): Promise<{ arquivo: string; tipoMime: string; liberada: boolean } | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(chave)) return null;
  const { rows } = await tx.query<{ arquivo: string; tipoMime: string; liberada: boolean }>(
    `select m.arquivo, m.tipo_mime as "tipoMime", p.estado in ('agendada', 'preparando') as liberada
       from crm.midia_publicacao m join crm.publicacao p on p.id = m.publicacao_id
      where m.chave = $1 and m.apagada_em is null`,
    [chave],
  );
  return rows[0] ?? null;
}

// -----------------------------------------------------------------------------
// Agendador
// -----------------------------------------------------------------------------

export interface TrabalhoPublicacao {
  id: string;
  reserva: string;
  tipo: TipoPublicacao;
  legenda: string;
  mostrarNoFeed: boolean;
  estado: "agendada" | "preparando";
  filhos: string[];
  conteinerId: string | null;
  preparandoDesde: Date | null;
  tentativas: number;
  itens: { chave: string; tipoMime: string }[];
  capa: { chave: string } | null;
}

/**
 * Pega uma publicação vencida e a reserva por 5 minutos. A reserva é o que
 * impede duas passagens — ou dois contêineres depois de uma implantação — de
 * publicar a mesma coisa duas vezes. Vencida, outra passagem retoma.
 */
export async function reservarPublicacao(tx: Consulta): Promise<TrabalhoPublicacao | null> {
  const { rows } = await tx.query<Omit<TrabalhoPublicacao, "itens" | "capa">>(
    `with alvo as (
       select id from crm.publicacao
        where ((estado = 'agendada' and agendada_para <= now())
            or (estado = 'preparando'))
          and (proxima_verificacao is null or proxima_verificacao <= now())
          and (reserva_ate is null or reserva_ate < now())
        order by agendada_para
        limit 1
        for update skip locked
     )
     update crm.publicacao p
        set reserva = gen_random_uuid(), reserva_ate = now() + interval '5 minutes'
       from alvo
      where p.id = alvo.id
     returning p.id, p.reserva, p.tipo::text as tipo, p.legenda, p.mostrar_no_feed as "mostrarNoFeed",
               p.estado::text as estado, p.filhos, p.conteiner_id as "conteinerId",
               p.preparando_desde as "preparandoDesde", p.tentativas`,
  );
  const trabalho = rows[0];
  if (!trabalho) return null;

  const midias = await tx.query<{ papel: string; chave: string; tipoMime: string }>(
    `select papel, chave, tipo_mime as "tipoMime" from crm.midia_publicacao
      where publicacao_id = $1 and apagada_em is null order by ordem`,
    [trabalho.id],
  );
  const capa = midias.rows.find((m) => m.papel === "capa");
  return {
    ...trabalho,
    itens: midias.rows.filter((m) => m.papel === "item").map(({ chave, tipoMime }) => ({ chave, tipoMime })),
    capa: capa ? { chave: capa.chave } : null,
  };
}

export type Andamento =
  | { tipo: "preparando"; filhos: string[]; conteinerId: string | null; esperarMs: number }
  | { tipo: "publicada"; midiaId: string | null; link: string | null }
  | { tipo: "falha_passageira"; mensagem: string }
  | { tipo: "falhou"; mensagem: string };

/**
 * Grava o que aconteceu na Meta e solta a reserva. Só vale para quem ainda
 * tem a reserva: uma passagem que demorou demais e perdeu a vez não escreve
 * por cima da que a substituiu. Devolve os arquivos que podem sair do volume.
 */
export async function registrarAndamento(
  tx: Consulta,
  trabalho: Pick<TrabalhoPublicacao, "id" | "reserva" | "tentativas">,
  andamento: Andamento,
): Promise<string[]> {
  const solta = "reserva = null, reserva_ate = null, atualizada_em = now()";
  const onde = "where id = $1 and reserva = $2 returning id";
  const chave = [trabalho.id, trabalho.reserva];
  let rows: unknown[];

  if (andamento.tipo === "preparando") {
    ({ rows } = await tx.query(
      `update crm.publicacao set estado = 'preparando', filhos = $3::text[], conteiner_id = $4, tentativas = 0, erro = null,
              preparando_desde = coalesce(preparando_desde, now()),
              proxima_verificacao = now() + ($5::int * interval '1 millisecond'), ${solta} ${onde}`,
      [...chave, andamento.filhos, andamento.conteinerId, andamento.esperarMs],
    ));
  } else if (andamento.tipo === "publicada") {
    ({ rows } = await tx.query(
      `update crm.publicacao set estado = 'publicada', midia_id = $3, link = $4, publicada_em = now(), erro = null,
              proxima_verificacao = null, ${solta} ${onde}`,
      [...chave, andamento.midiaId, andamento.link],
    ));
  } else if (andamento.tipo === "falha_passageira" && trabalho.tentativas + 1 < LIMITES.tentativas) {
    ({ rows } = await tx.query(
      `update crm.publicacao set tentativas = tentativas + 1, erro = $3,
              proxima_verificacao = now() + ($4::int * interval '1 millisecond'), ${solta} ${onde}`,
      [...chave, andamento.mensagem.slice(0, 1000), esperaAposFalha(trabalho.tentativas + 1)],
    ));
  } else {
    ({ rows } = await tx.query(
      `update crm.publicacao set estado = 'falhou', erro = $3, tentativas = tentativas + 1,
              proxima_verificacao = null, ${solta} ${onde}`,
      [...chave, andamento.mensagem.slice(0, 1000)],
    ));
  }

  if (rows.length === 0) {
    console.warn("[instagram] reserva perdida; outra passagem assumiu esta publicação.");
    return [];
  }
  return andamento.tipo === "publicada" ? marcarArquivosApagados(tx, trabalho.id) : [];
}
