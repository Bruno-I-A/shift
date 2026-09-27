/** Formatação para a tela, em português e no fuso de Getúlio Vargas. */
import { nomeDaEtapa } from "./dominio";

const FUSO = "America/Sao_Paulo";
const relativo = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

export function haQuanto(data: Date | string, agora = new Date()): string {
  const segundos = (new Date(data).getTime() - agora.getTime()) / 1000;
  const abs = Math.abs(segundos);
  if (abs < 60) return "agora";
  if (abs < 3600) return relativo.format(Math.round(segundos / 60), "minute");
  if (abs < 86400) return relativo.format(Math.round(segundos / 3600), "hour");
  if (abs < 86400 * 30) return relativo.format(Math.round(segundos / 86400), "day");
  if (abs < 86400 * 365) return relativo.format(Math.round(segundos / (86400 * 30)), "month");
  return relativo.format(Math.round(segundos / (86400 * 365)), "year");
}

export function dataCompleta(data: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(data));
}

export function hojePorExtenso(agora = new Date()): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(agora);
}

/** "agente:claude" → "Claude"; "bruno" → "Você". */
export function nomeDoAtor(ator: string): string {
  if (ator === "bruno") return "Você";
  if (ator === "sistema") return "Carga inicial";
  const nome = ator.replace(/^agente:/, "");
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

const CAMPOS: Record<string, string> = {
  nome: "o nome",
  clienteId: "o cliente",
  tipo: "o tipo",
  repositorio: "o repositório",
  urlProducao: "o link de produção",
  urlPrevia: "o link de prévia",
  stack: "a stack",
  notaCerebro: "a nota do Cerebro",
};

/** Uma linha de histórico em português, sem o ator (que vem à parte). */
export function descreverEvento(tipo: string, dados: Record<string, unknown>): string {
  const etapa = (chave: string) => nomeDaEtapa(String(dados[chave] ?? ""));
  const titulo = typeof dados.titulo === "string" ? `“${dados.titulo}”` : "";
  switch (tipo) {
    case "projeto_criado":
      return "criou o projeto";
    case "projeto_editado": {
      const lista = Array.isArray(dados.campos) ? dados.campos.map((c) => CAMPOS[String(c)] ?? c) : [];
      return lista.length ? `editou ${lista.join(", ")}` : "editou o projeto";
    }
    case "etapa_mudou":
      return `moveu de ${etapa("de")} para ${etapa("para")}`;
    case "etapa_proposta":
      return `propôs mover para ${etapa("para")}`;
    case "proposta_aceita":
      return `aceitou a proposta de ${nomeDoAtor(String(dados.por ?? ""))}`;
    case "proposta_recusada":
      return `recusou a proposta de ${nomeDoAtor(String(dados.por ?? ""))}`;
    case "tarefa_criada":
      return `criou a tarefa ${titulo}`;
    case "tarefa_concluida":
      return `concluiu ${titulo}`;
    case "tarefa_reaberta":
      return `reabriu ${titulo}`;
    case "sessao_registrada":
      return "registrou uma sessão";
    case "projeto_arquivado":
      return "arquivou o projeto";
    case "projeto_reaberto":
      return "tirou o projeto do arquivo";
    default:
      return tipo.replaceAll("_", " ");
  }
}
