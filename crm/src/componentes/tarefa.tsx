import { alternarTarefa } from "@/app/acoes";
import type { Tarefa } from "@/lib/crm";
import { haQuanto, nomeDoAtor } from "@/lib/formato";

import { BotaoAcao } from "./botao-acao";

export function ItemTarefa({ tarefa }: { tarefa: Tarefa }) {
  const concluida = Boolean(tarefa.concluidaEm);
  return (
    <li className="group flex items-start gap-3 py-2">
      <BotaoAcao
        acao={alternarTarefa.bind(null, tarefa.id, !concluida)}
        aria-label={concluida ? `Reabrir: ${tarefa.titulo}` : `Concluir: ${tarefa.titulo}`}
        className={`mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded border transition-colors ${
          concluida
            ? "border-sucesso bg-sucesso text-fundo"
            : "border-linha-forte hover:border-destaque"
        }`}
      >
        {concluida && (
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
            <path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        )}
      </BotaoAcao>
      <div className="min-w-0">
        <p className={`text-sm ${concluida ? "text-apagado line-through" : ""}`}>{tarefa.titulo}</p>
        <p className="text-xs text-apagado">
          {concluida
            ? `${nomeDoAtor(tarefa.concluidaPor ?? "")} concluiu ${haQuanto(tarefa.concluidaEm!)}`
            : `${nomeDoAtor(tarefa.criadaPor)} · ${haQuanto(tarefa.criadaEm)}`}
        </p>
      </div>
    </li>
  );
}
