/**
 * O servidor MCP do CRM: o que o Claude Code e o Codex podem fazer.
 *
 * Um servidor novo por requisição (é o que o `createMcpHandler` pede), já
 * sabendo qual agente está do outro lado — a chave foi conferida antes, na
 * rota. As ferramentas chamam as mesmas funções da tela; o agente não tem um
 * caminho próprio, mais frouxo.
 *
 * O que o agente **não** pode: mudar etapa direto, criar ou editar projeto,
 * mexer em chave. Mudança de etapa é pedido (`propor_etapa`) e só vale quando
 * o Bruno aceita na tela "Hoje".
 */
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";

import type { Consulta } from "@/lib/consulta";
import * as crm from "@/lib/crm";
import { ETAPAS, ErroDeDominio, IDS_ETAPA, nomeDaEtapa, nomeDoTipo } from "@/lib/dominio";

export type Executor = <T>(trabalho: (tx: Consulta) => Promise<T>) => Promise<T>;

const INSTRUCOES = `CRM da Shift: o quadro dos projetos de cliente, atualizado pelos agentes enquanto trabalham.

Ao começar a trabalhar num repositório: chame projeto_atual com a saída de \`git remote get-url origin\`. Se o projeto existir, você recebe a etapa, as tarefas abertas, as últimas sessões e o caminho da nota no Cerebro (relativo à raiz do vault). Leia isso antes de planejar.

Ao terminar uma sessão de trabalho que mudou algo: registrar_sessao com o que foi feito e o que falta, em português, como você contaria ao Bruno. Crie tarefas para pendências concretas e conclua as que você terminou.

Etapa: você não muda, você propõe (propor_etapa) com o motivo. O Bruno aprova. Só proponha quando o trabalho de fato mudou de fase — não a cada sessão.

Se projeto_atual não achar o repositório, não crie nada: pergunte ao Bruno qual é o projeto.`;

function texto(conteudo: unknown) {
  return {
    content: [
      { type: "text" as const, text: typeof conteudo === "string" ? conteudo : JSON.stringify(conteudo, null, 2) },
    ],
  };
}

function falha(mensagem: string) {
  return { ...texto(mensagem), isError: true };
}

const data = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);

function paraAgente(contexto: Awaited<ReturnType<typeof crm.contextoDoProjeto>>) {
  const { projeto, tarefasAbertas, ultimasSessoes, propostaPendente } = contexto;
  return {
    projeto: projeto.slug,
    nome: projeto.nome,
    cliente: projeto.cliente,
    tipo: nomeDoTipo(projeto.tipo),
    etapa: projeto.etapa,
    etapa_nome: nomeDaEtapa(projeto.etapa),
    etapa_desde: data(projeto.etapaDesde),
    arquivado: Boolean(projeto.arquivadoEm),
    repositorio: projeto.repositorio,
    producao: projeto.urlProducao,
    previa: projeto.urlPrevia,
    stack: projeto.stack,
    nota_cerebro: projeto.notaCerebro,
    trilha: ETAPAS.map((e) => e.id),
    tarefas_abertas: tarefasAbertas.map((t) => ({ id: t.id, titulo: t.titulo, criada_por: t.criadaPor })),
    ultimas_sessoes: ultimasSessoes.map((s) => ({
      quando: data(s.criadaEm),
      agente: s.agente,
      resumo: s.resumo,
      proximos_passos: s.proximosPassos,
    })),
    proposta_pendente: propostaPendente && {
      de: propostaPendente.de,
      para: propostaPendente.para,
      motivo: propostaPendente.motivo,
      por: propostaPendente.propostaPor,
    },
  };
}

export function criarServidorMcp(agente: string, executar: Executor): McpServer {
  const ator: crm.Ator = `agente:${agente}`;
  const servidor = new McpServer({ name: "shift-crm", version: "1.0.0" }, { instructions: INSTRUCOES });

  /** Erro de regra volta para o agente como está; o resto é logado e resumido. */
  async function ferramenta<T>(trabalho: (tx: Consulta) => Promise<T>, formatar: (r: T) => unknown) {
    try {
      return texto(formatar(await executar(trabalho)));
    } catch (erro) {
      if (erro instanceof ErroDeDominio) return falha(erro.message);
      console.error(`[mcp] ${agente}:`, erro);
      return falha("Erro interno no CRM. Nada foi gravado; tente de novo ou avise o Bruno.");
    }
  }

  const slug = z.string().min(1).max(80).describe('O identificador do projeto, ex.: "reforma-tributaria".');

  servidor.registerTool(
    "projeto_atual",
    {
      title: "Projeto deste repositório",
      description:
        "Descobre o projeto pelo endereço do repositório git e já devolve o contexto dele. Use no começo do trabalho.",
      inputSchema: z.object({
        repositorio: z.string().min(1).max(500).describe("A saída de `git remote get-url origin`."),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ repositorio }) =>
      ferramenta(
        async (tx) => {
          const projeto = await crm.acharPorRepositorio(tx, repositorio);
          if (projeto) return { achado: true as const, contexto: await crm.contextoDoProjeto(tx, projeto.slug) };
          return { achado: false as const, projetos: await crm.listarProjetos(tx) };
        },
        (r) =>
          r.achado
            ? paraAgente(r.contexto)
            : {
                aviso: "Nenhum projeto do CRM usa esse repositório. Pergunte ao Bruno qual é o projeto; não crie nada.",
                projetos: r.projetos.map((p) => ({ projeto: p.slug, nome: p.nome, repositorio: p.repositorio })),
              },
      ),
  );

  servidor.registerTool(
    "listar_projetos",
    {
      title: "Listar projetos",
      description: "Todos os projetos ativos, com etapa e número de tarefas abertas.",
      annotations: { readOnlyHint: true },
    },
    () =>
      ferramenta(
        (tx) => crm.listarProjetos(tx),
        (projetos) =>
          projetos.map((p) => ({
            projeto: p.slug,
            nome: p.nome,
            cliente: p.cliente,
            etapa: p.etapa,
            tarefas_abertas: p.tarefasAbertas,
            repositorio: p.repositorio,
          })),
      ),
  );

  servidor.registerTool(
    "contexto_do_projeto",
    {
      title: "Contexto do projeto",
      description: "Etapa, tarefas abertas, últimas sessões, proposta pendente e caminho da nota no Cerebro.",
      inputSchema: z.object({ projeto: slug }),
      annotations: { readOnlyHint: true },
    },
    ({ projeto }) => ferramenta((tx) => crm.contextoDoProjeto(tx, projeto), paraAgente),
  );

  servidor.registerTool(
    "registrar_sessao",
    {
      title: "Registrar sessão",
      description:
        "Anota no diário do projeto o que foi feito nesta sessão e o que ficou por fazer. Use ao terminar um trabalho que mudou algo.",
      inputSchema: z.object({
        projeto: slug,
        resumo: z.string().min(1).max(4000).describe("O que foi feito, em português, para o Bruno ler."),
        proximos_passos: z.string().max(4000).optional().describe("O que falta, se houver."),
      }),
    },
    ({ projeto, resumo, proximos_passos }) =>
      ferramenta(
        (tx) => crm.registrarSessao(tx, projeto, { resumo, proximosPassos: proximos_passos }, ator),
        () => "Sessão registrada.",
      ),
  );

  servidor.registerTool(
    "criar_tarefa",
    {
      title: "Criar tarefa",
      description: "Cria uma pendência concreta na lista do projeto.",
      inputSchema: z.object({ projeto: slug, titulo: z.string().min(1).max(300) }),
    },
    ({ projeto, titulo }) =>
      ferramenta(
        (tx) => crm.criarTarefa(tx, projeto, titulo, ator),
        (t) => ({ tarefa_id: t.id, titulo: t.titulo }),
      ),
  );

  servidor.registerTool(
    "concluir_tarefa",
    {
      title: "Concluir tarefa",
      description: "Marca como concluída uma tarefa aberta. O id vem de contexto_do_projeto.",
      inputSchema: z.object({ tarefa_id: z.string().min(1).max(64) }),
      annotations: { idempotentHint: true },
    },
    ({ tarefa_id }) =>
      ferramenta(
        (tx) => crm.concluirTarefa(tx, tarefa_id, ator),
        (t) => `Concluída: ${t.titulo}`,
      ),
  );

  servidor.registerTool(
    "propor_etapa",
    {
      title: "Propor mudança de etapa",
      description:
        "Pede ao Bruno para mover o projeto para outra etapa da trilha. Não muda nada até ele aceitar. Substitui uma proposta pendente anterior.",
      inputSchema: z.object({
        projeto: slug,
        etapa: z.enum(IDS_ETAPA).describe(ETAPAS.map((e) => `${e.id} = ${e.nome}`).join("; ")),
        motivo: z.string().min(1).max(2000).describe("Por que a fase mudou. É o que o Bruno lê para decidir."),
      }),
    },
    ({ projeto, etapa, motivo }) =>
      ferramenta(
        (tx) => crm.proporEtapa(tx, projeto, { para: etapa, motivo }, ator),
        (p) =>
          `Proposta registrada: ${nomeDaEtapa(p.de)} → ${nomeDaEtapa(p.para)}. Aguarda a decisão do Bruno na tela Hoje.`,
      ),
  );

  return servidor;
}
