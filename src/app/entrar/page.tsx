import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Marca } from "@/componentes/marca";
import { temSessao } from "@/lib/sessao";

import { FormularioEntrada } from "./formulario";

export const metadata: Metadata = { title: "Entrar" };

export default async function PaginaEntrar() {
  if (await temSessao()) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <Marca />
          <p className="mt-2 text-sm text-suave">Projetos e clientes da Shift.</p>
        </div>
        <FormularioEntrada />
      </div>
    </main>
  );
}
