import type { Metadata } from "next";
import Link from "next/link";

import { Secao, Vazio } from "@/componentes/secao";
import { ErroDeDominio } from "@/lib/dominio";
import { listarModelosMeta, type ModeloWhatsApp } from "@/lib/modelos-whatsapp";
import { NOME_CATEGORIA, NOME_STATUS } from "@/lib/rotulos-modelos";
import { exigirSessao } from "@/lib/sessao";

import { FormularioModelo } from "./formulario";

export const metadata: Metadata = { title: "Modelos do WhatsApp" };
export const dynamic = "force-dynamic";

const CORES_STATUS: Record<string, string> = {
  APPROVED: "text-sucesso",
  REJECTED: "text-perigo",
  PAUSED: "text-perigo",
  DISABLED: "text-perigo",
};

export default async function ModelosWhatsApp() {
  await exigirSessao();
  let modelos: ModeloWhatsApp[] = [];
  let erro: string | undefined;
  try {
    modelos = await listarModelosMeta();
  } catch (e) {
    erro = e instanceof ErroDeDominio ? e.message : "Não foi possível consultar os modelos na Meta.";
  }

  return (
    <div className="max-w-3xl space-y-10">
      <header>
        <p className="text-sm text-apagado">
          <Link href="/whatsapp" className="hover:text-texto">
            WhatsApp
          </Link>
          <span aria-hidden> / </span>
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Modelos</h1>
        <p className="mt-1 text-sm text-suave">
          Fora da janela de 24 horas, a Shift só fala com um contato por um modelo aprovado pela Meta. Aqui você cria
          os modelos e acompanha a aprovação.
        </p>
      </header>

      <Secao titulo="Seus modelos" contagem={modelos.length}>
        {erro ? (
          <p role="alert" className="rounded-lg border border-perigo/40 px-4 py-3 text-sm text-perigo">
            {erro}
          </p>
        ) : modelos.length === 0 ? (
          <Vazio>Nenhum modelo ainda. Crie o primeiro abaixo.</Vazio>
        ) : (
          <ul className="divide-y divide-linha rounded-lg border border-linha">
            {modelos.map((m) => (
              <li key={m.id} className="space-y-1.5 px-4 py-3">
                <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-mono text-sm">{m.nome}</span>
                  <span className="text-xs text-apagado">
                    {NOME_CATEGORIA[m.categoria] ?? m.categoria} · {m.idioma} ·{" "}
                    <span className={CORES_STATUS[m.status] ?? "text-ouro"}>{NOME_STATUS[m.status] ?? m.status}</span>
                  </span>
                </p>
                <p className="text-sm whitespace-pre-wrap text-suave">{m.texto}</p>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao titulo="Novo modelo">
        <FormularioModelo />
      </Secao>
    </div>
  );
}
