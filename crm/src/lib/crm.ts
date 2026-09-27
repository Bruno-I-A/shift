/**
 * As operações do CRM. Tela e MCP chamam as mesmas funções, então uma regra
 * mora num lugar só — o agente não tem um caminho mais frouxo que o do Bruno.
 *
 * Toda função recebe uma `Consulta` já dentro de uma transação e registra em
 * `crm.evento` o que mudou e quem mudou. `ator` é "bruno" na tela e
 * "agente:<nome>" no MCP.
 */
import type { Consulta } from "./consulta";
import { ETAPAS_ATIVAS, ErroDeDominio, gerarSlug, nomeDaEtapa, normalizarRepositorio } from "./dominio";
import type { Etapa, Tipo } from "./dominio";
import { gerarToken, hashDoToken } from "./segredos";

export type Ator = "bruno" | "sistema" | `agente:${string}`;

export interface Projeto {
  id: string;
  slug: string;
  nome: string;
  clienteId: string | null;
  cliente: string | null;
  tipo: Tipo;
  etapa: Etapa;
  etapaDesde: Date;
  repositorio: string | null;
  urlProducao: string | null;
  urlPrevia: string | null;
  stack: string | null;
  notaCerebro: string | null;
  arquivadoEm: Date | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface ProjetoNoQuadro extends Projeto {
  tarefasAbertas: number;
  propostaPendente: boolean;
  ultimaAtividade: Date;
}

export interface Tarefa {
  id: string;
  projetoId: string;
  titulo: string;
  criadaPor: string;
  criadaEm: Date;
  concluidaPor: string | null;
  concluidaEm: Date | null;
}

export interface Sessao {
  id: string;
  projetoId: string;
  agente: string;
  resumo: string;
  proximosPassos: string | null;
  criadaEm: Date;
}

export interface Proposta {
  id: string;
  projetoId: string;
  de: Etapa;
  para: Etapa;
  motivo: string;
  propostaPor: string;
  criadaEm: Date;
  decisao: "aceita" | "recusada" | "substituida" | null;
  decididaEm: Date | null;
}

export interface Evento {
  ator: string;
  tipo: string;
  dados: Record<string, unknown>;
  criadoEm: Date;
}

const COLUNAS_PROJETO = `
  p.id, p.slug, p.nome, p.cliente_id as "clienteId", c.nome as cliente,
  p.tipo::text as tipo, p.etapa::text as etapa, p.etapa_desde as "etapaDesde",
  p.repositorio, p.url_producao as "urlProducao", p.url_previa as "urlPrevia",
  p.stack, p.nota_cerebro as "notaCerebro", p.arquivado_em as "arquivadoEm",
  p.criado_em as "criadoEm", p.atualizado_em as "atualizadoEm"`;

const DE_PROJETO = `from crm.projeto p left join crm.cliente c on c.id = p.cliente_id`;

const COLUNAS_TAREFA = `
  t.id, t.projeto_id as "projetoId", t.titulo, t.criada_por as "criadaPor",
  t.criada_em as "criadaEm", t.concluida_por as "concluidaPor", t.concluida_em as "concluidaEm"`;

const COLUNAS_SESSAO = `
  s.id, s.projeto_id as "projetoId", s.agente, s.resumo,
  s.proximos_passos as "proximosPassos", s.criada_em as "criadaEm"`;

const COLUNAS_PROPOSTA = `
  pe.id, pe.projeto_id as "projetoId", pe.de::text as de, pe.para::text as para, pe.motivo,
  pe.proposta_por as "propostaPor", pe.criada_em as "criadaEm", pe.decisao,
  pe.decidida_em as "decididaEm"`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function registrarEvento(
  tx: Consulta,
  projetoId: string | null,
  ator: Ator,
  tipo: string,
  dados: Record<string, unknown> = {},
) {
  await tx.query(
    "insert into crm.evento (projeto_id, ator, tipo, dados) values ($1, $2, $3, $4::jsonb)",
    [projetoId, ator, tipo, JSON.stringify(dados)],
  );
}

// -----------------------------------------------------------------------------
// Projetos
// -----------------------------------------------------------------------------

export async function listarProjetos(
  tx: Consulta,
  { incluirArquivados = false } = {},
): Promise<ProjetoNoQuadro[]> {
  const { rows } = await tx.query<ProjetoNoQuadro>(
    `select ${COLUNAS_PROJETO},
            (select count(*)::int from crm.tarefa t
              where t.projeto_id = p.id and t.concluida_em is null) as "tarefasAbertas",
            exists (select 1 from crm.proposta_etapa pe
                     where pe.projeto_id = p.id and pe.decisao is null) as "propostaPendente",
            greatest(p.atualizado_em,
                     (select max(e.criado_em) from crm.evento e where e.projeto_id = p.id))
              as "ultimaAtividade"
       ${DE_PROJETO}
      where $1::boolean or p.arquivado_em is null
      order by p.nome`,
    [incluirArquivados],
  );
  return rows;
}

export async function buscarProjeto(tx: Consulta, slug: string): Promise<Projeto | null> {
  const { rows } = await tx.query<Projeto>(`select ${COLUNAS_PROJETO} ${DE_PROJETO} where p.slug = $1`, [
    slug,
  ]);
  return rows[0] ?? null;
}

export async function exigirProjeto(tx: Consulta, slug: string): Promise<Projeto> {
  const projeto = await buscarProjeto(tx, slug);
  if (!projeto) throw new ErroDeDominio(`Não existe projeto "${slug}" no CRM.`);
  return projeto;
}

export async function acharPorRepositorio(tx: Consulta, repositorio: string): Promise<Projeto | null> {
  const normalizado = normalizarRepositorio(repositorio);
  if (!normalizado) return null;
  const { rows } = await tx.query<Projeto>(
    `select ${COLUNAS_PROJETO} ${DE_PROJETO} where p.repositorio = $1`,
    [normalizado],
  );
  return rows[0] ?? null;
}

async function idDoCliente(tx: Consulta, nome: string | null | undefined): Promise<string | null> {
  const limpo = nome?.trim();
  if (!limpo) return null;
  const { rows } = await tx.query<{ id: string }>(
    "select id from crm.cliente where lower(nome) = lower($1)",
    [limpo],
  );
  if (rows[0]) return rows[0].id;
  const criado = await tx.query<{ id: string }>(
    "insert into crm.cliente (nome) values ($1) returning id",
    [limpo],
  );
  return criado.rows[0].id;
}

export interface DadosProjeto {
  nome: string;
  tipo: Tipo;
  cliente?: string | null;
  repositorio?: string | null;
  urlProducao?: string | null;
  urlPrevia?: string | null;
  stack?: string | null;
  notaCerebro?: string | null;
}

function repositorioValido(entrada: string | null | undefined): string | null {
  if (!entrada?.trim()) return null;
  const normalizado = normalizarRepositorio(entrada);
  if (!normalizado) {
    throw new ErroDeDominio(`"${entrada}" não parece endereço de repositório (ex.: github.com/dono/nome).`);
  }
  return normalizado;
}

async function conferirRepositorioLivre(tx: Consulta, repositorio: string | null, exceto?: string) {
  if (!repositorio) return;
  const { rows } = await tx.query<{ slug: string }>(
    "select slug from crm.projeto where repositorio = $1 and ($2::uuid is null or id <> $2::uuid)",
    [repositorio, exceto ?? null],
  );
  if (rows[0]) throw new ErroDeDominio(`Esse repositório já pertence ao projeto "${rows[0].slug}".`);
}

const vazioParaNulo = (valor: string | null | undefined) => (valor?.trim() ? valor.trim() : null);

export async function criarProjeto(
  tx: Consulta,
  dados: DadosProjeto & { slug?: string; etapa?: Etapa },
  ator: Ator,
): Promise<Projeto> {
  const slug = dados.slug?.trim() || gerarSlug(dados.nome);
  if (!slug) throw new ErroDeDominio("Dê ao projeto um nome com pelo menos uma letra ou número.");
  if (await buscarProjeto(tx, slug)) throw new ErroDeDominio(`Já existe um projeto com o endereço "${slug}".`);

  const repositorio = repositorioValido(dados.repositorio);
  await conferirRepositorioLivre(tx, repositorio);

  const { rows } = await tx.query<{ id: string }>(
    `insert into crm.projeto
       (slug, nome, cliente_id, tipo, etapa, repositorio, url_producao, url_previa, stack, nota_cerebro)
     values ($1, $2, $3, $4::crm.tipo_projeto, $5::crm.etapa, $6, $7, $8, $9, $10)
     returning id`,
    [
      slug,
      dados.nome.trim(),
      await idDoCliente(tx, dados.cliente),
      dados.tipo,
      dados.etapa ?? "descoberta",
      repositorio,
      vazioParaNulo(dados.urlProducao),
      vazioParaNulo(dados.urlPrevia),
      vazioParaNulo(dados.stack),
      vazioParaNulo(dados.notaCerebro),
    ],
  );
  await registrarEvento(tx, rows[0].id, ator, "projeto_criado", { etapa: dados.etapa ?? "descoberta" });
  return exigirProjeto(tx, slug);
}

export async function atualizarProjeto(
  tx: Consulta,
  slug: string,
  dados: DadosProjeto,
  ator: Ator,
): Promise<Projeto> {
  const atual = await exigirProjeto(tx, slug);
  const repositorio = repositorioValido(dados.repositorio);
  await conferirRepositorioLivre(tx, repositorio, atual.id);

  const novo = {
    nome: dados.nome.trim(),
    clienteId: await idDoCliente(tx, dados.cliente),
    tipo: dados.tipo,
    repositorio,
    urlProducao: vazioParaNulo(dados.urlProducao),
    urlPrevia: vazioParaNulo(dados.urlPrevia),
    stack: vazioParaNulo(dados.stack),
    notaCerebro: vazioParaNulo(dados.notaCerebro),
  };
  const mudou = (Object.keys(novo) as (keyof typeof novo)[]).filter((campo) => novo[campo] !== atual[campo]);
  if (mudou.length === 0) return atual;

  await tx.query(
    `update crm.projeto
        set nome = $2, cliente_id = $3, tipo = $4::crm.tipo_projeto, repositorio = $5,
            url_producao = $6, url_previa = $7, stack = $8, nota_cerebro = $9, atualizado_em = now()
      where id = $1`,
    [atual.id, novo.nome, novo.clienteId, novo.tipo, novo.repositorio, novo.urlProducao, novo.urlPrevia, novo.stack, novo.notaCerebro],
  );
  await registrarEvento(tx, atual.id, ator, "projeto_editado", { campos: mudou });
  return exigirProjeto(tx, slug);
}

export async function definirArquivado(tx: Consulta, slug: string, arquivado: boolean, ator: Ator) {
  const projeto = await exigirProjeto(tx, slug);
  if (Boolean(projeto.arquivadoEm) === arquivado) return;
  await tx.query(
    "update crm.projeto set arquivado_em = case when $2 then now() end, atualizado_em = now() where id = $1",
    [projeto.id, arquivado],
  );
  await registrarEvento(tx, projeto.id, ator, arquivado ? "projeto_arquivado" : "projeto_reaberto");
}

/**
 * Troca a etapa na hora. É o caminho do Bruno, na tela; o agente só propõe
 * (`proporEtapa`). Uma proposta pendente é encerrada junto: aceita, se ele
 * moveu para onde o agente pedia; substituída, se foi para outro lugar.
 */
export async function mudarEtapa(tx: Consulta, slug: string, para: Etapa, ator: Ator) {
  const projeto = await exigirProjeto(tx, slug);
  if (projeto.etapa === para) return;

  await tx.query(
    `update crm.projeto set etapa = $2::crm.etapa, etapa_desde = now(), atualizado_em = now()
      where id = $1`,
    [projeto.id, para],
  );
  await tx.query(
    `update crm.proposta_etapa
        set decisao = case when para = $2::crm.etapa then 'aceita' else 'substituida' end,
            decidida_em = now()
      where projeto_id = $1 and decisao is null`,
    [projeto.id, para],
  );
  await registrarEvento(tx, projeto.id, ator, "etapa_mudou", { de: projeto.etapa, para });
}

// -----------------------------------------------------------------------------
// Tarefas
// -----------------------------------------------------------------------------

export async function listarTarefas(
  tx: Consulta,
  projetoId: string,
  { abertas = true } = {},
): Promise<Tarefa[]> {
  const { rows } = await tx.query<Tarefa>(
    `select ${COLUNAS_TAREFA} from crm.tarefa t
      where t.projeto_id = $1 and (t.concluida_em is null) = $2
      order by ${abertas ? "t.criada_em" : "t.concluida_em desc"}
      limit 100`,
    [projetoId, abertas],
  );
  return rows;
}

export async function criarTarefa(tx: Consulta, slug: string, titulo: string, ator: Ator): Promise<Tarefa> {
  const projeto = await exigirProjeto(tx, slug);
  const limpo = titulo.trim();
  if (!limpo) throw new ErroDeDominio("A tarefa precisa de um título.");
  const { rows } = await tx.query<Tarefa>(
    `insert into crm.tarefa as t (projeto_id, titulo, criada_por) values ($1, $2, $3)
     returning ${COLUNAS_TAREFA}`,
    [projeto.id, limpo, ator],
  );
  await registrarEvento(tx, projeto.id, ator, "tarefa_criada", { titulo: limpo });
  return rows[0];
}

async function exigirTarefa(tx: Consulta, id: string): Promise<Tarefa> {
  if (!UUID.test(id)) throw new ErroDeDominio(`"${id}" não é um identificador de tarefa.`);
  const { rows } = await tx.query<Tarefa>(`select ${COLUNAS_TAREFA} from crm.tarefa t where t.id = $1`, [id]);
  if (!rows[0]) throw new ErroDeDominio("Essa tarefa não existe.");
  return rows[0];
}

export async function concluirTarefa(tx: Consulta, id: string, ator: Ator): Promise<Tarefa> {
  const tarefa = await exigirTarefa(tx, id);
  if (tarefa.concluidaEm) return tarefa;
  const { rows } = await tx.query<Tarefa>(
    `update crm.tarefa t set concluida_em = now(), concluida_por = $2 where t.id = $1
     returning ${COLUNAS_TAREFA}`,
    [id, ator],
  );
  await registrarEvento(tx, tarefa.projetoId, ator, "tarefa_concluida", { titulo: tarefa.titulo });
  return rows[0];
}

export async function reabrirTarefa(tx: Consulta, id: string, ator: Ator): Promise<void> {
  const tarefa = await exigirTarefa(tx, id);
  if (!tarefa.concluidaEm) return;
  await tx.query("update crm.tarefa set concluida_em = null, concluida_por = null where id = $1", [id]);
  await registrarEvento(tx, tarefa.projetoId, ator, "tarefa_reaberta", { titulo: tarefa.titulo });
}

// -----------------------------------------------------------------------------
// Sessões dos agentes
// -----------------------------------------------------------------------------

export async function registrarSessao(
  tx: Consulta,
  slug: string,
  dados: { resumo: string; proximosPassos?: string | null },
  ator: Ator,
): Promise<Sessao> {
  const projeto = await exigirProjeto(tx, slug);
  const resumo = dados.resumo.trim();
  if (!resumo) throw new ErroDeDominio("O registro da sessão precisa de um resumo.");
  const { rows } = await tx.query<Sessao>(
    `insert into crm.sessao as s (projeto_id, agente, resumo, proximos_passos) values ($1, $2, $3, $4)
     returning ${COLUNAS_SESSAO}`,
    [projeto.id, ator, resumo, vazioParaNulo(dados.proximosPassos)],
  );
  await registrarEvento(tx, projeto.id, ator, "sessao_registrada", { sessao: rows[0].id });
  return rows[0];
}

export async function listarSessoes(tx: Consulta, projetoId: string, limite = 20): Promise<Sessao[]> {
  const { rows } = await tx.query<Sessao>(
    `select ${COLUNAS_SESSAO} from crm.sessao s where s.projeto_id = $1
      order by s.criada_em desc limit $2`,
    [projetoId, limite],
  );
  return rows;
}

// -----------------------------------------------------------------------------
// Propostas de etapa
// -----------------------------------------------------------------------------

export async function proporEtapa(
  tx: Consulta,
  slug: string,
  dados: { para: Etapa; motivo: string },
  ator: Ator,
): Promise<Proposta> {
  const projeto = await exigirProjeto(tx, slug);
  if (projeto.arquivadoEm) throw new ErroDeDominio("O projeto está arquivado.");
  if (projeto.etapa === dados.para) {
    throw new ErroDeDominio(`O projeto já está em "${nomeDaEtapa(dados.para)}".`);
  }
  const motivo = dados.motivo.trim();
  if (!motivo) throw new ErroDeDominio("Diga por que a etapa deve mudar: é o que o Bruno lê para decidir.");

  await tx.query(
    `update crm.proposta_etapa set decisao = 'substituida', decidida_em = now()
      where projeto_id = $1 and decisao is null`,
    [projeto.id],
  );
  const { rows } = await tx.query<Proposta>(
    `insert into crm.proposta_etapa as pe (projeto_id, de, para, motivo, proposta_por)
     values ($1, $2::crm.etapa, $3::crm.etapa, $4, $5)
     returning ${COLUNAS_PROPOSTA}`,
    [projeto.id, projeto.etapa, dados.para, motivo, ator],
  );
  await registrarEvento(tx, projeto.id, ator, "etapa_proposta", { de: projeto.etapa, para: dados.para });
  return rows[0];
}

export async function propostaPendente(tx: Consulta, projetoId: string): Promise<Proposta | null> {
  const { rows } = await tx.query<Proposta>(
    `select ${COLUNAS_PROPOSTA} from crm.proposta_etapa pe where pe.projeto_id = $1 and pe.decisao is null`,
    [projetoId],
  );
  return rows[0] ?? null;
}

export async function decidirProposta(
  tx: Consulta,
  id: string,
  decisao: "aceita" | "recusada",
  ator: Ator,
): Promise<void> {
  if (!UUID.test(id)) throw new ErroDeDominio("Proposta inválida.");
  const { rows } = await tx.query<Proposta & { etapaAtual: Etapa }>(
    `select ${COLUNAS_PROPOSTA}, p.etapa::text as "etapaAtual"
       from crm.proposta_etapa pe join crm.projeto p on p.id = pe.projeto_id
      where pe.id = $1
        for update of pe`,
    [id],
  );
  const proposta = rows[0];
  if (!proposta) throw new ErroDeDominio("Essa proposta não existe.");
  if (proposta.decisao) throw new ErroDeDominio("Essa proposta já foi decidida.");

  await tx.query("update crm.proposta_etapa set decisao = $2, decidida_em = now() where id = $1", [
    id,
    decisao,
  ]);
  await registrarEvento(tx, proposta.projetoId, ator, `proposta_${decisao}`, {
    de: proposta.de,
    para: proposta.para,
    por: proposta.propostaPor,
  });

  if (decisao === "aceita" && proposta.etapaAtual !== proposta.para) {
    await tx.query(
      `update crm.projeto set etapa = $2::crm.etapa, etapa_desde = now(), atualizado_em = now()
        where id = $1`,
      [proposta.projetoId, proposta.para],
    );
    await registrarEvento(tx, proposta.projetoId, ator, "etapa_mudou", {
      de: proposta.etapaAtual,
      para: proposta.para,
      proposta: id,
    });
  }
}

// -----------------------------------------------------------------------------
// Leituras compostas
// -----------------------------------------------------------------------------

export async function historico(tx: Consulta, projetoId: string, limite = 30): Promise<Evento[]> {
  const { rows } = await tx.query<Evento>(
    `select ator, tipo, dados, criado_em as "criadoEm" from crm.evento
      where projeto_id = $1 order by criado_em desc, id desc limit $2`,
    [projetoId, limite],
  );
  return rows;
}

/** O que o agente lê antes de começar: tudo que ajuda a não repetir trabalho. */
export async function contextoDoProjeto(tx: Consulta, slug: string) {
  const projeto = await exigirProjeto(tx, slug);
  const [tarefas, sessoes, proposta] = await Promise.all([
    listarTarefas(tx, projeto.id),
    listarSessoes(tx, projeto.id, 5),
    propostaPendente(tx, projeto.id),
  ]);
  return { projeto, tarefasAbertas: tarefas, ultimasSessoes: sessoes, propostaPendente: proposta };
}

export interface PainelHoje {
  propostas: (Proposta & { projetoNome: string; projetoSlug: string })[];
  parados: ProjetoNoQuadro[];
  tarefas: (Tarefa & { projetoNome: string; projetoSlug: string })[];
  sessoes: (Sessao & { projetoNome: string; projetoSlug: string })[];
}

export const DIAS_PARA_PARADO = 7;

export async function painelHoje(tx: Consulta, agora = new Date()): Promise<PainelHoje> {
  const [propostas, projetos, tarefas, sessoes] = await Promise.all([
    tx.query<PainelHoje["propostas"][number]>(
      `select ${COLUNAS_PROPOSTA}, p.nome as "projetoNome", p.slug as "projetoSlug"
         from crm.proposta_etapa pe join crm.projeto p on p.id = pe.projeto_id
        where pe.decisao is null and p.arquivado_em is null
        order by pe.criada_em`,
    ),
    listarProjetos(tx),
    tx.query<PainelHoje["tarefas"][number]>(
      `select ${COLUNAS_TAREFA}, p.nome as "projetoNome", p.slug as "projetoSlug"
         from crm.tarefa t join crm.projeto p on p.id = t.projeto_id
        where t.concluida_em is null and p.arquivado_em is null
        order by p.nome, t.criada_em
        limit 60`,
    ),
    tx.query<PainelHoje["sessoes"][number]>(
      `select ${COLUNAS_SESSAO}, p.nome as "projetoNome", p.slug as "projetoSlug"
         from crm.sessao s join crm.projeto p on p.id = s.projeto_id
        order by s.criada_em desc
        limit 8`,
    ),
  ]);

  const limite = agora.getTime() - DIAS_PARA_PARADO * 24 * 60 * 60 * 1000;
  const parados = projetos
    .filter((p) => ETAPAS_ATIVAS.includes(p.etapa) && new Date(p.ultimaAtividade).getTime() < limite)
    .sort((a, b) => new Date(a.ultimaAtividade).getTime() - new Date(b.ultimaAtividade).getTime());

  return { propostas: propostas.rows, parados, tarefas: tarefas.rows, sessoes: sessoes.rows };
}

// -----------------------------------------------------------------------------
// Agentes e chaves do MCP
// -----------------------------------------------------------------------------

export interface Agente {
  id: string;
  nome: string;
  tokenFinal: string;
  criadoEm: Date;
  ultimoUsoEm: Date | null;
  revogadoEm: Date | null;
}

/** Devolve a chave em claro uma única vez. Depois disso só existe o hash. */
export async function criarAgente(tx: Consulta, nome: string): Promise<{ agente: Agente; token: string }> {
  const limpo = nome.trim().toLowerCase();
  if (!/^[a-z0-9-]{2,30}$/.test(limpo)) {
    throw new ErroDeDominio("Nome do agente: de 2 a 30 letras minúsculas, números ou hífen.");
  }
  const token = gerarToken();
  const { rows } = await tx.query<Agente>(
    `insert into crm.agente (nome, token_hash, token_final) values ($1, $2, $3)
     returning id, nome, token_final as "tokenFinal", criado_em as "criadoEm",
               ultimo_uso_em as "ultimoUsoEm", revogado_em as "revogadoEm"`,
    [limpo, hashDoToken(token), token.slice(-4)],
  );
  await registrarEvento(tx, null, "bruno", "chave_criada", { agente: limpo });
  return { agente: rows[0], token };
}

export async function listarAgentes(tx: Consulta): Promise<Agente[]> {
  const { rows } = await tx.query<Agente>(
    `select id, nome, token_final as "tokenFinal", criado_em as "criadoEm",
            ultimo_uso_em as "ultimoUsoEm", revogado_em as "revogadoEm"
       from crm.agente order by revogado_em nulls first, criado_em desc`,
  );
  return rows;
}

export async function revogarAgente(tx: Consulta, id: string): Promise<void> {
  if (!UUID.test(id)) throw new ErroDeDominio("Chave inválida.");
  const { rows } = await tx.query<{ nome: string }>(
    "update crm.agente set revogado_em = now() where id = $1 and revogado_em is null returning nome",
    [id],
  );
  if (rows[0]) await registrarEvento(tx, null, "bruno", "chave_revogada", { agente: rows[0].nome });
}

export async function autenticarAgente(tx: Consulta, token: string): Promise<{ id: string; nome: string } | null> {
  const { rows } = await tx.query<{ id: string; nome: string }>(
    `update crm.agente set ultimo_uso_em = now()
      where token_hash = $1 and revogado_em is null
      returning id, nome`,
    [hashDoToken(token)],
  );
  return rows[0] ?? null;
}

// -----------------------------------------------------------------------------
// Limite de tentativas de login
// -----------------------------------------------------------------------------

export const JANELA_TENTATIVAS_MIN = 15;
export const MAX_FALHAS_POR_IP = 5;
/** Teto para todos os IPs somados: segura quem troca de IP a cada tentativa. */
export const MAX_FALHAS_TOTAL = 30;

export async function entradaBloqueada(tx: Consulta, ip: string): Promise<boolean> {
  const { rows } = await tx.query<{ doIp: number; total: number }>(
    `select count(*) filter (where ip = $1)::int as "doIp", count(*)::int as total
       from crm.tentativa_entrada
      where criada_em > now() - make_interval(mins => $2)`,
    [ip, JANELA_TENTATIVAS_MIN],
  );
  return rows[0].doIp >= MAX_FALHAS_POR_IP || rows[0].total >= MAX_FALHAS_TOTAL;
}

export async function registrarFalhaDeEntrada(tx: Consulta, ip: string): Promise<void> {
  await tx.query("insert into crm.tentativa_entrada (ip) values ($1)", [ip]);
  await tx.query("delete from crm.tentativa_entrada where criada_em < now() - interval '1 day'");
}

export async function limparFalhasDeEntrada(tx: Consulta, ip: string): Promise<void> {
  await tx.query("delete from crm.tentativa_entrada where ip = $1", [ip]);
}
