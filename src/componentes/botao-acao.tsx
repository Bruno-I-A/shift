"use client";

import { useState, useTransition } from "react";

import type { Resultado } from "@/app/acoes";

/**
 * Botão que chama uma Server Action já com os argumentos presos (`.bind`),
 * mostra que está trabalhando e, se a ação devolver erro, mostra o erro ao
 * lado — em vez de engolir a falha como um `<form action>` simples faria.
 */
export function BotaoAcao({
  acao,
  children,
  className = "",
  titulo,
  confirmar,
  ...resto
}: {
  acao: () => Promise<Resultado>;
  children: React.ReactNode;
  className?: string;
  titulo?: string;
  confirmar?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "title">) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        title={titulo}
        disabled={pendente}
        aria-busy={pendente}
        className={`${className} disabled:cursor-wait disabled:opacity-60`}
        onClick={() => {
          if (confirmar && !window.confirm(confirmar)) return;
          setErro(null);
          iniciar(async () => {
            const resultado = await acao();
            if (resultado?.erro) setErro(resultado.erro);
          });
        }}
        {...resto}
      >
        {children}
      </button>
      {erro && (
        <span role="alert" className="text-sm text-perigo">
          {erro}
        </span>
      )}
    </>
  );
}
