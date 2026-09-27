import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { arquivar, mudarEtapa } from "@/app/acoes";
import { BotaoAcao } from "@/componentes/botao-acao";
import { estilos } from "@/componentes/estilos";
import { FormularioTarefa } from "@/componentes/formulario-tarefa";
import { CartaoProposta } from "@/componentes/proposta";
import { Secao, Vazio } from "@/componentes/secao";
import { ItemTarefa } from "@/componentes/tarefa";
import { emTransacao } from "@/lib/banco";
import * as crm from "@/lib/crm";
import { ETAPAS, nomeDoTipo } from "@/lib/dominio";
import { dataCompleta, descreverEvento, haQuanto, nomeDoAtor } from "@/lib/formato";
import { exigirSessao } from "@/lib/sessao";

export async function generateMetadata({ params }: PageProps<"/projetos/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: slug };
}

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-2 text-sm">
      <dt className="text-apagado">{rotulo}</dt>
      <dd className="min-w-0 break-words">{children ?? <span className="text-apagado">—</span>}</dd>
    </div>
  );
}

function LinkExterno({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-destaque hover:underline">
      {children}
    </a>
  );
}

export default async function PaginaProjeto({ params }: PageProps<"/projetos/[slug]">) {
  await exigirSessao();
  const { slug } = await params;

  const dados = await emTransacao(async (tx) => {
    const projeto = await crm.buscarProjeto(tx, slug);
    if (!projeto) return null;
    const [abertas, concluidas, sessoes, proposta, eventos] = await Promise.all([
      crm.listarTarefas(tx, projeto.id),
      crm.listarTarefas(tx, projeto.id, { abertas: false }),
      crm.listarSessoes(tx, projeto.id, 20),
      crm.propostaPendente(tx, projeto.id),
      crm.historico(tx, projeto.id, 25),
    ]);
    return { projeto, abertas, concluidas, sessoes, proposta, eventos };
  });
  if (!dados) notFound();
  const { projeto, abertas, concluidas, sessoes, proposta, eventos } = dados;
  const indiceAtual = ETAPAS.findIndex((e) => e.id === projeto.etapa);

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <p className="text-sm text-apagado">
          <Link href="/projetos" className="hover:text-texto">
            Projetos
          </Link>
          <span aria-hidden> / </span>
        </p>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {projeto.nome}
              {projeto.arquivadoEm && (
                <span className="ml-3 align-middle text-xs font-normal text-ouro">arquivado</span>
              )}
            </h1>
            <p className="mt-1 text-sm text-suave">
              {[projeto.cliente, nomeDoTipo(projeto.tipo)].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/projetos/${projeto.slug}/editar`} className={estilos.secundario}>
              Editar
            </Link>
            <BotaoAcao
              acao={arquivar.bind(null, projeto.slug, !projeto.arquivadoEm)}
              className={estilos.fantasma}
              confirmar={projeto.arquivadoEm ? undefined : `Arquivar ${projeto.nome}? Ele sai do quadro, mas nada é apagado.`}
            >
              {projeto.arquivadoEm ? "Tirar do arquivo" : "Arquivar"}
            </BotaoAcao>
          </div>
        </div>

        {/* A trilha. Cada etapa é um botão: é o caminho do Bruno para mover direto. */}
        <nav aria-label="Etapa do projeto">
          <ol className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
            {ETAPAS.map((etapa, i) => {
              const atual = i === indiceAtual;
              const passada = i < indiceAtual;
              return (
                <li key={etapa.id}>
                  <BotaoAcao
                    acao={mudarEtapa.bind(null, projeto.slug, etapa.id)}
                    disabled={atual}
                    aria-current={atual ? "step" : undefined}
                    titulo={atual ? `Etapa atual desde ${dataCompleta(projeto.etapaDesde)}` : `Mover para ${etapa.nome}`}
                    className={`flex w-full flex-col items-start rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                      atual
                        ? "border-destaque bg-destaque-fundo text-texto disabled:cursor-default disabled:opacity-100"
                        : passada
                          ? "border-linha bg-superficie text-suave hover:border-linha-forte"
                          : "border-dashed border-linha text-apagado hover:border-linha-forte hover:text-suave"
                    }`}
                  >
                    <span className="font-mono text-[11px] text-apagado">{String(i + 1).padStart(2, "0")}</span>
                    <span className={atual ? "font-medium" : ""}>{etapa.nome}</span>
                    {atual && <span className="text-xs text-destaque">desde {haQuanto(projeto.etapaDesde)}</span>}
                  </BotaoAcao>
                </li>
              );
            })}
          </ol>
        </nav>
      </header>

      {proposta && <CartaoProposta proposta={proposta} />}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-10">
          <Secao titulo="Tarefas" contagem={abertas.length}>
            <FormularioTarefa slug={projeto.slug} />
            {abertas.length > 0 ? (
              <ul className="mt-3 divide-y divide-linha">
                {abertas.map((t) => (
                  <ItemTarefa key={t.id} tarefa={t} />
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-apagado">Nenhuma tarefa aberta.</p>
            )}
            {concluidas.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-apagado hover:text-suave">
                  Concluídas ({concluidas.length})
                </summary>
                <ul className="mt-2 divide-y divide-linha">
                  {concluidas.map((t) => (
                    <ItemTarefa key={t.id} tarefa={t} />
                  ))}
                </ul>
              </details>
            )}
          </Secao>

          <Secao titulo="Sessões dos agentes" contagem={sessoes.length}>
            {sessoes.length === 0 ? (
              <Vazio>
                Nenhuma sessão ainda. Quando um agente trabalhar neste repositório e registrar, aparece aqui.
              </Vazio>
            ) : (
              <ol className="space-y-5">
                {sessoes.map((s) => (
                  <li key={s.id} className="border-l-2 border-linha pl-4">
                    <p className="text-xs text-apagado">
                      <span className="text-suave">{nomeDoAtor(s.agente)}</span> ·{" "}
                      <time dateTime={new Date(s.criadaEm).toISOString()} title={dataCompleta(s.criadaEm)}>
                        {haQuanto(s.criadaEm)}
                      </time>
                    </p>
                    <p className="mt-1 text-sm whitespace-pre-line">{s.resumo}</p>
                    {s.proximosPassos && (
                      <p className="mt-2 text-sm whitespace-pre-line text-suave">
                        <span className="text-apagado">Falta: </span>
                        {s.proximosPassos}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Secao>
        </div>

        <aside className="space-y-10">
          <Secao titulo="Dados">
            <dl className="divide-y divide-linha rounded-lg border border-linha px-4">
              <Dado rotulo="Repositório">
                {projeto.repositorio && (
                  <LinkExterno href={`https://${projeto.repositorio}`}>
                    <span className="font-mono text-xs">{projeto.repositorio}</span>
                  </LinkExterno>
                )}
              </Dado>
              <Dado rotulo="No ar">
                {projeto.urlProducao && <LinkExterno href={projeto.urlProducao}>{projeto.urlProducao}</LinkExterno>}
              </Dado>
              <Dado rotulo="Prévia">
                {projeto.urlPrevia && <LinkExterno href={projeto.urlPrevia}>{projeto.urlPrevia}</LinkExterno>}
              </Dado>
              <Dado rotulo="Stack">{projeto.stack}</Dado>
              <Dado rotulo="Cerebro">
                {projeto.notaCerebro && <span className="font-mono text-xs text-suave">{projeto.notaCerebro}</span>}
              </Dado>
              <Dado rotulo="Endereço">
                <span className="font-mono text-xs text-suave">{projeto.slug}</span>
              </Dado>
            </dl>
          </Secao>

          <Secao titulo="Histórico">
            <ol className="space-y-2.5">
              {eventos.map((e, i) => (
                <li key={i} className="text-sm">
                  <span className="text-suave">{nomeDoAtor(e.ator)}</span>{" "}
                  <span>{descreverEvento(e.tipo, e.dados)}</span>
                  <span className="block text-xs text-apagado" title={dataCompleta(e.criadoEm)}>
                    {haQuanto(e.criadoEm)}
                  </span>
                </li>
              ))}
            </ol>
          </Secao>
        </aside>
      </div>
    </div>
  );
}
