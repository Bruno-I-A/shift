import type { Metadata } from "next";
import Link from "next/link";

import { estilos } from "@/componentes/estilos";
import { emTransacao } from "@/lib/banco";
import { listarProjetos } from "@/lib/crm";
import { ETAPAS, nomeDoTipo } from "@/lib/dominio";
import { haQuanto } from "@/lib/formato";
import { exigirSessao } from "@/lib/sessao";

export const metadata: Metadata = { title: "Projetos" };

export default async function Quadro({ searchParams }: PageProps<"/projetos">) {
  await exigirSessao();
  const { arquivados } = await searchParams;
  const verArquivados = arquivados === "1";
  const todos = await emTransacao((tx) => listarProjetos(tx, { incluirArquivados: true }));
  const projetos = todos.filter((p) => Boolean(p.arquivadoEm) === verArquivados);
  const totalArquivados = todos.filter((p) => p.arquivadoEm).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{verArquivados ? "Arquivados" : "Projetos"}</h1>
          <p className="mt-1 text-sm text-apagado">
            {verArquivados ? (
              <Link href="/projetos" className="hover:text-texto">
                ← Voltar ao quadro
              </Link>
            ) : (
              <>
                {projetos.length} {projetos.length === 1 ? "projeto" : "projetos"} em andamento
                {totalArquivados > 0 && (
                  <>
                    {" · "}
                    <Link href="/projetos?arquivados=1" className="hover:text-texto">
                      {totalArquivados} arquivado{totalArquivados > 1 ? "s" : ""}
                    </Link>
                  </>
                )}
              </>
            )}
          </p>
        </div>
        <Link href="/projetos/novo" className={estilos.primario}>
          Novo projeto
        </Link>
      </header>

      {verArquivados ? (
        <ul className="divide-y divide-linha rounded-lg border border-linha">
          {projetos.map((p) => (
            <li key={p.id}>
              <Link href={`/projetos/${p.slug}`} className="block px-4 py-3 text-sm hover:bg-superficie">
                {p.nome} <span className="text-apagado">· arquivado {haQuanto(p.arquivadoEm!)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        // O quadro rola na horizontal dentro da própria caixa; a página não.
        <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
          <ol className="grid min-w-[1180px] grid-cols-6 gap-3">
            {ETAPAS.map((etapa) => {
              const daEtapa = projetos.filter((p) => p.etapa === etapa.id);
              return (
                <li key={etapa.id} className="flex min-h-64 flex-col rounded-lg bg-superficie/60 p-2">
                  <h2 className="flex items-baseline justify-between px-2 pt-1 pb-3 text-xs font-medium tracking-wide text-suave uppercase">
                    {etapa.nome}
                    <span className="font-mono text-apagado">{daEtapa.length}</span>
                  </h2>
                  <ul className="space-y-2">
                    {daEtapa.map((p) => (
                      <li key={p.id}>
                        <Link
                          href={`/projetos/${p.slug}`}
                          className="block rounded-md border border-linha bg-superficie p-3 transition-colors hover:border-linha-forte hover:bg-superficie-2"
                        >
                          <p className="text-sm leading-snug font-medium">{p.nome}</p>
                          <p className="mt-0.5 truncate text-xs text-apagado">
                            {[p.cliente, nomeDoTipo(p.tipo)].filter(Boolean).join(" · ")}
                          </p>
                          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-apagado">
                            {p.propostaPendente && (
                              <span className="inline-flex items-center gap-1 text-destaque">
                                <span aria-hidden className="size-1.5 rounded-full bg-destaque" />
                                proposta
                              </span>
                            )}
                            {p.tarefasAbertas > 0 && (
                              <span>
                                {p.tarefasAbertas} tarefa{p.tarefasAbertas > 1 ? "s" : ""}
                              </span>
                            )}
                            <span className="ml-auto">{haQuanto(p.ultimaAtividade)}</span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
