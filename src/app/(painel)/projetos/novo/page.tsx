import type { Metadata } from "next";

import { criarProjeto } from "@/app/acoes";
import { FormularioProjeto } from "@/componentes/formulario-projeto";
import { exigirSessao } from "@/lib/sessao";

export const metadata: Metadata = { title: "Novo projeto" };

export default async function NovoProjeto() {
  await exigirSessao();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Novo projeto</h1>
      <FormularioProjeto acao={criarProjeto} cancelar="/projetos" />
    </div>
  );
}
