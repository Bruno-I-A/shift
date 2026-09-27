import Link from "next/link";

import { decidirProposta } from "@/app/acoes";
import type { Proposta } from "@/lib/crm";
import { nomeDaEtapa } from "@/lib/dominio";
import { haQuanto, nomeDoAtor } from "@/lib/formato";

import { BotaoAcao } from "./botao-acao";
import { estilos } from "./estilos";

/** Um pedido de mudança de etapa esperando o Bruno. */
export function CartaoProposta({
  proposta,
  projeto,
}: {
  proposta: Proposta;
  projeto?: { nome: string; slug: string };
}) {
  return (
    <article className="rounded-lg border border-destaque/40 bg-destaque-fundo p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        {projeto ? (
          <Link href={`/projetos/${projeto.slug}`} className="font-medium hover:text-destaque">
            {projeto.nome}
          </Link>
        ) : (
          <span className="text-sm font-medium text-destaque">Proposta de mudança de etapa</span>
        )}
        <span className="text-xs text-apagado">
          {nomeDoAtor(proposta.propostaPor)} · {haQuanto(proposta.criadaEm)}
        </span>
      </div>
      <p className="mt-2 text-sm">
        <span className="text-suave">{nomeDaEtapa(proposta.de)}</span>
        <span aria-hidden className="mx-2 text-destaque">
          →
        </span>
        <span className="sr-only"> para </span>
        <span className="font-medium">{nomeDaEtapa(proposta.para)}</span>
      </p>
      <blockquote className="mt-2 border-l-2 border-linha-forte pl-3 text-sm whitespace-pre-line text-suave">
        {proposta.motivo}
      </blockquote>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <BotaoAcao acao={decidirProposta.bind(null, proposta.id, "aceita")} className={estilos.primario}>
          Aceitar
        </BotaoAcao>
        <BotaoAcao acao={decidirProposta.bind(null, proposta.id, "recusada")} className={estilos.fantasma}>
          Recusar
        </BotaoAcao>
      </div>
    </article>
  );
}
