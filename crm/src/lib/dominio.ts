/**
 * Vocabulário do CRM e regras que não dependem de banco.
 *
 * Fica separado de `crm.ts` para que tela, MCP e testes usem os mesmos nomes
 * sem puxar conexão nenhuma junto.
 */

export const ETAPAS = [
  { id: "descoberta", nome: "Descoberta" },
  { id: "desenho", nome: "Desenho" },
  { id: "construcao", nome: "Construção" },
  { id: "validacao", nome: "Validação com o cliente" },
  { id: "entregue", nome: "Entregue" },
  { id: "acompanhamento", nome: "Acompanhamento" },
] as const;

export type Etapa = (typeof ETAPAS)[number]["id"];
export const IDS_ETAPA = ETAPAS.map((e) => e.id) as [Etapa, ...Etapa[]];

export const TIPOS = [
  { id: "ai_first", nome: "Transformação AI first" },
  { id: "site", nome: "Site" },
  { id: "software", nome: "Software" },
] as const;

export type Tipo = (typeof TIPOS)[number]["id"];
export const IDS_TIPO = TIPOS.map((t) => t.id) as [Tipo, ...Tipo[]];

export const nomeDaEtapa = (id: string) => ETAPAS.find((e) => e.id === id)?.nome ?? id;
export const nomeDoTipo = (id: string) => TIPOS.find((t) => t.id === id)?.nome ?? id;

/**
 * Etapas em que o projeto está sendo trabalhado. Um projeto nelas sem
 * atividade há dias aparece em "Parados"; em "Entregue" e "Acompanhamento" o
 * silêncio é o esperado.
 */
export const ETAPAS_ATIVAS: readonly Etapa[] = ["descoberta", "desenho", "construcao", "validacao"];

/** Erro que pode ser mostrado como está, na tela ou para o agente. */
export class ErroDeDominio extends Error {}

/**
 * Leva qualquer forma de endereço de repositório a "github.com/dono/nome".
 *
 * O agente manda o que o `git remote get-url origin` devolver, e isso varia:
 * `git@github.com:Dono/Nome.git`, `https://github.com/Dono/Nome`, com barra no
 * fim, com usuário embutido. O GitHub não distingue maiúsculas em dono e
 * nome, então comparar sem normalizar faria o mesmo projeto parecer dois.
 */
export function normalizarRepositorio(entrada: string): string | null {
  let texto = entrada.trim();
  if (!texto) return null;

  // git@github.com:dono/nome.git  →  github.com/dono/nome.git
  const ssh = /^[\w.-]+@([\w.-]+):(.+)$/.exec(texto);
  if (ssh) texto = `${ssh[1]}/${ssh[2]}`;

  texto = texto
    .replace(/^[a-z+]+:\/\//i, "")
    .replace(/^[^@/]+@/, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "")
    .toLowerCase();

  const partes = texto.split("/").filter(Boolean);
  if (partes.length < 3) return null;
  const [host, dono, nome] = partes;
  if (!/^[a-z0-9.-]+$/.test(host) || !host.includes(".")) return null;
  return `${host}/${dono}/${nome}`;
}

/** "Reforma Tributária" → "reforma-tributaria". */
export function gerarSlug(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}
