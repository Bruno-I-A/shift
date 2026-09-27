"use client";

import { useActionState } from "react";

import { entrar } from "@/app/acoes";
import { estilos } from "@/componentes/estilos";

export function FormularioEntrada() {
  const [estado, acao, pendente] = useActionState(entrar, undefined);

  return (
    <form action={acao} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm text-suave">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={estado?.valores?.email}
          className={estilos.campo}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="senha" className="block text-sm text-suave">
          Senha
        </label>
        <input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          className={estilos.campo}
        />
      </div>
      {estado?.erro && (
        <p role="alert" className="text-sm text-perigo">
          {estado.erro}
        </p>
      )}
      <button type="submit" disabled={pendente} className={`${estilos.primario} w-full disabled:opacity-60`}>
        {pendente ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
