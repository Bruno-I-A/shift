import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { editarProjeto } from "@/app/acoes";
import { FormularioProjeto } from "@/componentes/formulario-projeto";
import { emTransacao } from "@/lib/banco";
import { buscarProjeto } from "@/lib/crm";
import { exigirSessao } from "@/lib/sessao";

export const metadata: Metadata = { title: "Editar projeto" };

export default async function EditarProjeto({ params }: PageProps<"/projetos/[slug]/editar">) {
  await exigirSessao();
  const { slug } = await params;
  const projeto = await emTransacao((tx) => buscarProjeto(tx, slug));
  if (!projeto) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Editar {projeto.nome}</h1>
      <FormularioProjeto
        acao={editarProjeto.bind(null, projeto.slug)}
        projeto={projeto}
        cancelar={`/projetos/${projeto.slug}`}
      />
    </div>
  );
}
