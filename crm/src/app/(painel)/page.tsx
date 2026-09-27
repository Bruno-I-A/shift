import type { Metadata } from "next";
import Link from "next/link";

import { CartaoProposta } from "@/componentes/proposta";
import { Secao, Vazio } from "@/componentes/secao";
import { ItemTarefa } from "@/componentes/tarefa";
import { emTransacao } from "@/lib/banco";
import { DIAS_PARA_PARADO, painelHoje } from "@/lib/crm";
import { nomeDaEtapa } from "@/lib/dominio";
import { haQuanto, hojePorExtenso, nomeDoAtor } from "@/lib/formato";
import { listarLeads } from "@/lib/leads";
import { exigirSessao } from "@/lib/sessao";

export const metadata: Metadata = { title: "Hoje" };

export default async function Hoje() {
  await exigirSessao();
  const [{ propostas, parados, tarefas, sessoes }, leadsNovos] = await emTransacao(async (tx) =>
    Promise.all([painelHoje(tx), listarLeads(tx, "novo")]),
  );

  // Tarefas agrupadas por projeto, na ordem em que vieram (já ordenadas por nome).
  const porProjeto = new Map<string, { nome: string; slug: string; itens: typeof tarefas }>();
  for (const t of tarefas) {
    const grupo = porProjeto.get(t.projetoSlug) ?? { nome: t.projetoNome, slug: t.projetoSlug, itens: [] };
    grupo.itens.push(t);
    porProjeto.set(t.projetoSlug, grupo);
  }

  return (
    <div className="space-y-10">
      <header>
        <p className="text-sm text-apagado first-letter:uppercase">{hojePorExtenso()}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Hoje</h1>
      </header>

      <Secao titulo="Esperando você" contagem={propostas.length}>
        {propostas.length === 0 ? (
          <Vazio>Nenhum agente pediu para mudar etapa. Quando pedirem, o pedido aparece aqui.</Vazio>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {propostas.map((p) => (
              <CartaoProposta key={p.id} proposta={p} projeto={{ nome: p.projetoNome, slug: p.projetoSlug }} />
            ))}
          </div>
        )}
      </Secao>

      {leadsNovos.length > 0 && (
        <Secao
          titulo="Leads novos"
          contagem={leadsNovos.length}
          acao={
            <Link href="/leads?etapa=novo" className="text-sm text-destaque hover:underline">
              Ver todos
            </Link>
          }
        >
          <ul className="divide-y divide-linha rounded-lg border border-linha">
            {leadsNovos.slice(0, 5).map((l) => (
              <li key={l.id}>
                <Link
                  href="/leads?etapa=novo"
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-superficie"
                >
                  <span className="min-w-0">
                    <span className="text-sm font-medium">{l.nome}</span>
                    {l.empresa && <span className="text-sm text-suave"> · {l.empresa}</span>}
                    <span className="block text-xs text-apagado">
                      {[l.segmento, l.dor].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-apagado">{haQuanto(l.criadoEm)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Secao titulo="Tarefas abertas" contagem={tarefas.length}>
          {porProjeto.size === 0 ? (
            <Vazio>Nenhuma tarefa aberta.</Vazio>
          ) : (
            <div className="space-y-5">
              {[...porProjeto.values()].map((grupo) => (
                <div key={grupo.slug}>
                  <Link href={`/projetos/${grupo.slug}`} className="text-sm font-medium hover:text-destaque">
                    {grupo.nome}
                  </Link>
                  <ul className="divide-y divide-linha">
                    {grupo.itens.map((t) => (
                      <ItemTarefa key={t.id} tarefa={t} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Secao>

        <div className="space-y-10">
          <Secao titulo={`Parados há mais de ${DIAS_PARA_PARADO} dias`} contagem={parados.length}>
            {parados.length === 0 ? (
              <Vazio>Todo projeto em andamento teve movimento esta semana.</Vazio>
            ) : (
              <ul className="divide-y divide-linha rounded-lg border border-linha">
                {parados.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/projetos/${p.slug}`}
                      className="flex items-baseline justify-between gap-4 px-4 py-3 transition-colors hover:bg-superficie"
                    >
                      <span>
                        <span className="text-sm font-medium">{p.nome}</span>
                        <span className="ml-2 text-xs text-apagado">{nomeDaEtapa(p.etapa)}</span>
                      </span>
                      <span className="shrink-0 text-xs text-ouro">{haQuanto(p.ultimaAtividade)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Secao>

          <Secao titulo="Últimas sessões dos agentes">
            {sessoes.length === 0 ? (
              <Vazio>
                Nenhuma sessão registrada ainda. Depois que o Claude Code ou o Codex estiverem conectados em{" "}
                <Link href="/agentes" className="text-destaque hover:underline">
                  Agentes
                </Link>
                , o que eles fizerem aparece aqui.
              </Vazio>
            ) : (
              <ol className="space-y-4">
                {sessoes.map((s) => (
                  <li key={s.id} className="border-l-2 border-linha pl-3">
                    <p className="text-xs text-apagado">
                      <span className="text-suave">{nomeDoAtor(s.agente)}</span> em{" "}
                      <Link href={`/projetos/${s.projetoSlug}`} className="text-suave hover:text-destaque">
                        {s.projetoNome}
                      </Link>{" "}
                      · {haQuanto(s.criadaEm)}
                    </p>
                    <p className="mt-1 line-clamp-3 text-sm whitespace-pre-line">{s.resumo}</p>
                  </li>
                ))}
              </ol>
            )}
          </Secao>
        </div>
      </div>
    </div>
  );
}
