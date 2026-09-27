"use client";

import { useState, useTransition } from "react";

import { mudarEtapaLead } from "@/app/acoes";
import { ETAPAS_LEAD } from "@/lib/dominio";

import { estilos } from "./estilos";

export function SeletorEtapaLead({ id, etapa, nome }: { id: string; etapa: string; nome: string }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`etapa-${id}`} className="sr-only">
        Etapa de {nome}
      </label>
      <select
        id={`etapa-${id}`}
        defaultValue={etapa}
        disabled={pendente}
        aria-busy={pendente}
        className={`${estilos.campo} w-44 py-1.5 disabled:opacity-60`}
        onChange={(evento) => {
          const para = evento.target.value;
          setErro(null);
          iniciar(async () => {
            const resultado = await mudarEtapaLead(id, para);
            if (resultado?.erro) setErro(resultado.erro);
          });
        }}
      >
        {ETAPAS_LEAD.map((e) => (
          <option key={e.id} value={e.id}>
            {e.nome}
          </option>
        ))}
      </select>
      {erro && (
        <span role="alert" className="text-xs text-perigo">
          {erro}
        </span>
      )}
    </div>
  );
}
