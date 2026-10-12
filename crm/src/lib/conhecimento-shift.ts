import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface TrechoShift { titulo: string; texto: string; fonte: string; pontuacao: number }

const PARADAS = new Set("a ao aos as com como da das de do dos e em eu na nas no nos o os ou para por que se um uma uns umas voce voces vocês sua seu suas seus tem ter quais qual quanto quanto custa é são faz fazem me minha meu empresa empresas shift sistemas sistema ia inteligência artificial".split(" "));

function termos(texto: string): string[] {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !PARADAS.has(t));
}

function fonteDe(titulo: string): string {
  if (/solu|n[ií]vel|base que/i.test(titulo)) return "https://shiftsys.com.br/solucoes.html";
  if (/implanta|comercial|piloto|opera[cç][aã]o cont[ií]nua/i.test(titulo)) return "https://shiftsys.com.br/processo.html";
  if (/setor|escrit[oó]rio|imobili/i.test(titulo)) return "https://shiftsys.com.br/segmentos.html";
  if (/diagn[oó]stico online/i.test(titulo)) return "https://shiftsys.com.br/diagnostico.html";
  if (/presen[cç]a digital/i.test(titulo)) return "https://shiftsys.com.br/sites.html";
  return "https://shiftsys.com.br/";
}

let cache: Omit<TrechoShift, "pontuacao">[] | null = null;

function base(): Omit<TrechoShift, "pontuacao">[] {
  if (cache) return cache;
  const texto = readFileSync(join(process.cwd(), "conhecimento", "shift.md"), "utf8");
  const secoes = texto.split(/(?=^## )/m).filter((s) => s.startsWith("## "));
  cache = secoes.map((secao) => {
    const [primeira, ...linhas] = secao.trim().split("\n");
    const titulo = primeira.replace(/^## /, "").trim();
    return { titulo, texto: linhas.join("\n").trim().slice(0, 3000), fonte: fonteDe(titulo) };
  });
  return cache;
}

/** Busca lexical pequena e auditável sobre o conteúdo publicado pela Shift. */
export function buscarConhecimento(pergunta: string, limite = 3): TrechoShift[] {
  const consulta = [...new Set(termos(pergunta))];
  if (consulta.length === 0) return [];
  return base().map((item) => {
    const titulo = termos(item.titulo);
    const corpo = new Set(termos(item.texto));
    const pontuacao = consulta.reduce((n, termo) => n + (titulo.includes(termo) ? 3 : 0) + (corpo.has(termo) ? 1 : 0), 0);
    return { ...item, pontuacao };
  }).filter((item) => item.pontuacao > 0)
    .sort((a, b) => b.pontuacao - a.pontuacao)
    .slice(0, limite);
}
