"use client";

import { useActionState, useEffect, useRef } from "react";

import { criarTarefa } from "@/app/acoes";

import { estilos } from "./estilos";

export function FormularioTarefa({ slug }: { slug: string }) {
  const [estado, enviar, pendente] = useActionState(criarTarefa.bind(null, slug), undefined);
  const formulario = useRef<HTMLFormElement>(null);

  // Limpa o campo quando a tarefa entrou, para a próxima ser digitada direto.
  useEffect(() => {
    if (estado?.ok) formulario.current?.reset();
  }, [estado]);

  return (
    <form ref={formulario} action={enviar} className="space-y-1.5">
      <div className="flex gap-2">
        <label htmlFor="nova-tarefa" className="sr-only">
          Nova tarefa
        </label>
        <input
          id="nova-tarefa"
          name="titulo"
          required
          maxLength={300}
          placeholder="Nova tarefa"
          defaultValue={estado?.valores?.titulo}
          className={estilos.campo}
        />
        <button type="submit" disabled={pendente} className={`${estilos.secundario} shrink-0 disabled:opacity-60`}>
          Adicionar
        </button>
      </div>
      {estado?.erro && (
        <p role="alert" className="text-sm text-perigo">
          {estado.erro}
        </p>
      )}
    </form>
  );
}
