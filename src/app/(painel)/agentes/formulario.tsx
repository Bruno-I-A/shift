"use client";

import { useActionState, useState } from "react";

import { gerarChave } from "@/app/acoes";
import { estilos } from "@/componentes/estilos";

/**
 * Gera a chave e mostra **uma vez**. Os comandos de conexão logo abaixo não
 * levam a chave dentro: leem de uma variável de ambiente. Comando pronto para
 * copiar com segredo dentro viaja para onde a linha for (Cerebro: "Segredo que
 * o script gera não entra em comando copiável").
 */
export function FormularioChave({ endereco }: { endereco: string }) {
  const [estado, enviar, pendente] = useActionState(gerarChave, undefined);
  const [copiado, setCopiado] = useState(false);
  const variavel = estado?.nome ? `SHIFT_CRM_TOKEN_${estado.nome.toUpperCase().replaceAll("-", "_")}` : "";

  return (
    <div className="space-y-4">
      <form action={enviar} className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <label htmlFor="nome-agente" className="block text-sm text-suave">
            Para qual agente?
          </label>
          <input
            id="nome-agente"
            name="nome"
            list="agentes-conhecidos"
            required
            pattern="[a-z0-9\-]{2,30}"
            placeholder="claude"
            className={`${estilos.campo} w-56`}
          />
          <datalist id="agentes-conhecidos">
            <option value="claude" />
            <option value="codex" />
          </datalist>
        </div>
        <button type="submit" disabled={pendente} className={`${estilos.primario} disabled:opacity-60`}>
          {pendente ? "Gerando…" : "Gerar chave"}
        </button>
      </form>

      {estado?.erro && (
        <p role="alert" className="text-sm text-perigo">
          {estado.erro}
        </p>
      )}

      {estado?.token && (
        <div className="space-y-4 rounded-lg border border-destaque/40 bg-destaque-fundo p-4">
          <div>
            <p className="text-sm font-medium">Chave do {estado.nome}. Ela aparece só agora.</p>
            <p className="mt-1 text-sm text-suave">
              Guarde numa variável de ambiente do Windows chamada{" "}
              <code className="font-mono text-xs text-texto">{variavel}</code>. Se perder, revogue e gere outra.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-md border border-linha-forte bg-fundo px-3 py-2 font-mono text-xs whitespace-nowrap">
              {estado.token}
            </code>
            <button
              type="button"
              className={estilos.secundario}
              onClick={async () => {
                await navigator.clipboard.writeText(estado.token!);
                setCopiado(true);
              }}
            >
              {copiado ? "Copiada" : "Copiar"}
            </button>
          </div>

          <div className="space-y-2 text-sm text-suave">
            <p>1. No PowerShell, crie a variável colando a chave no lugar de COLE_A_CHAVE:</p>
            <pre className="overflow-x-auto rounded-md bg-fundo p-3 font-mono text-xs text-texto">
              {`[Environment]::SetEnvironmentVariable("${variavel}", "COLE_A_CHAVE", "User")`}
            </pre>
            <p>2. Feche o terminal, abra outro e conecte:</p>
            <pre className="overflow-x-auto rounded-md bg-fundo p-3 font-mono text-xs text-texto">
              {estado.nome === "codex"
                ? `codex mcp add shift-crm --url ${endereco} --bearer-token-env-var ${variavel}`
                : `claude mcp add --transport http --scope user shift-crm ${endereco} --header "Authorization: Bearer $env:${variavel}"`}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
