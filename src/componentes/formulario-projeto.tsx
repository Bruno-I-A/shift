"use client";

import Link from "next/link";
import { useActionState } from "react";

import type { Resultado } from "@/app/acoes";
import type { Projeto } from "@/lib/crm";
import { ETAPAS, TIPOS } from "@/lib/dominio";

import { estilos } from "./estilos";

const COM_DICA = new Set(["cliente", "repositorio", "notaCerebro"]);

function Campo({
  rotulo,
  nome,
  dica,
  children,
}: {
  rotulo: string;
  nome: string;
  dica?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={nome} className="block text-sm text-suave">
        {rotulo}
      </label>
      {children}
      {dica && (
        <p id={`${nome}-dica`} className="text-xs text-apagado">
          {dica}
        </p>
      )}
    </div>
  );
}

export function FormularioProjeto({
  acao,
  projeto,
  cancelar,
}: {
  acao: (estado: Resultado, form: FormData) => Promise<Resultado>;
  projeto?: Projeto;
  cancelar: string;
}) {
  const [estado, enviar, pendente] = useActionState(acao, undefined);
  const texto = (nome: string, valor?: string | null, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input
      id={nome}
      name={nome}
      defaultValue={estado?.valores?.[nome] ?? valor ?? ""}
      aria-describedby={COM_DICA.has(nome) ? `${nome}-dica` : undefined}
      className={estilos.campo}
      {...extra}
    />
  );

  return (
    <form action={enviar} className="max-w-2xl space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Campo rotulo="Nome do projeto" nome="nome">
          {texto("nome", projeto?.nome, { required: true, maxLength: 200, autoFocus: !projeto })}
        </Campo>
        <Campo rotulo="Cliente" nome="cliente" dica="Se ainda não existir, é criado.">
          {texto("cliente", projeto?.cliente, { maxLength: 200 })}
        </Campo>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Campo rotulo="Tipo" nome="tipo">
          <select
            id="tipo"
            name="tipo"
            defaultValue={estado?.valores?.tipo ?? projeto?.tipo ?? "ai_first"}
            className={estilos.campo}
          >
            {TIPOS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </Campo>
        {!projeto && (
          <Campo rotulo="Etapa inicial" nome="etapa">
            <select
              id="etapa"
              name="etapa"
              defaultValue={estado?.valores?.etapa ?? "descoberta"}
              className={estilos.campo}
            >
              {ETAPAS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </Campo>
        )}
      </div>

      <Campo
        rotulo="Repositório"
        nome="repositorio"
        dica="É por ele que o agente descobre em que projeto está. Aceita qualquer forma: git@github.com:dono/nome.git, https://github.com/dono/nome…"
      >
        {texto("repositorio", projeto?.repositorio, { placeholder: "github.com/bruno-i-a/nome", spellCheck: false })}
      </Campo>

      <div className="grid gap-5 sm:grid-cols-2">
        <Campo rotulo="Link no ar" nome="urlProducao">
          {texto("urlProducao", projeto?.urlProducao, { type: "url", placeholder: "https://" })}
        </Campo>
        <Campo rotulo="Link da prévia" nome="urlPrevia">
          {texto("urlPrevia", projeto?.urlPrevia, { type: "url", placeholder: "https://" })}
        </Campo>
      </div>

      <Campo rotulo="Stack" nome="stack">
        {texto("stack", projeto?.stack, { maxLength: 300, placeholder: "Next.js · PostgreSQL · Claude" })}
      </Campo>

      <Campo
        rotulo="Nota no Cerebro"
        nome="notaCerebro"
        dica="Caminho a partir da raiz do vault. O agente recebe isso e lê a nota na sua máquina."
      >
        {texto("notaCerebro", projeto?.notaCerebro, {
          maxLength: 300,
          placeholder: "Projetos/Nome/Nome.md",
          spellCheck: false,
        })}
      </Campo>

      {estado?.erro && (
        <p role="alert" className="text-sm text-perigo">
          {estado.erro}
        </p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={pendente} className={`${estilos.primario} disabled:opacity-60`}>
          {pendente ? "Salvando…" : projeto ? "Salvar" : "Criar projeto"}
        </button>
        <Link href={cancelar} className={estilos.fantasma}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
