"use client";

import { useActionState, useState } from "react";

import { criarModeloWhatsApp } from "@/app/acoes";
import { estilos } from "@/componentes/estilos";
import { CUSTO_CATEGORIA } from "@/lib/rotulos-modelos";

/** Quantas variáveis o texto usa, contando o maior {{n}} (a validação de sequência fica no servidor). */
function variaveisDoTexto(texto: string): number {
  return Math.max(0, ...[...texto.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Math.min(Number(m[1]), 10)));
}

export function FormularioModelo() {
  const [estado, criar, pendente] = useActionState(criarModeloWhatsApp, undefined);
  const [texto, setTexto] = useState(estado?.valores?.texto ?? "");
  const [categoria, setCategoria] = useState(estado?.valores?.categoria ?? "UTILITY");
  const [exemplos, setExemplos] = useState<string[]>([]);
  const quantas = variaveisDoTexto(texto);
  const previa = texto.replace(/\{\{(\d+)\}\}/g, (_, n) => exemplos[Number(n) - 1] || `{{${n}}}`);

  return (
    <form action={criar} className="max-w-2xl space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="nome-modelo" className="block text-sm text-suave">
          Nome
        </label>
        <input
          id="nome-modelo"
          name="nome"
          required
          maxLength={512}
          pattern="[a-z0-9_]+"
          defaultValue={estado?.valores?.nome}
          placeholder="atualizacao_projeto"
          aria-describedby="nome-modelo-dica"
          className={estilos.campo}
        />
        <p id="nome-modelo-dica" className="text-xs text-apagado">
          Só letras minúsculas, números e _. É como o modelo aparece na Meta; o cliente não vê.
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm text-suave">Categoria</legend>
        {(["UTILITY", "MARKETING"] as const).map((valor) => (
          <label key={valor} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="categoria"
              value={valor}
              checked={categoria === valor}
              onChange={() => setCategoria(valor)}
              className="mt-1"
            />
            <span>{CUSTO_CATEGORIA[valor]}</span>
          </label>
        ))}
        <p className="text-xs text-apagado">
          A Meta muda para marketing o modelo de utilidade que tiver tom de venda.
        </p>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="texto-modelo" className="block text-sm text-suave">
          Texto
        </label>
        <textarea
          id="texto-modelo"
          name="texto"
          required
          maxLength={1024}
          rows={4}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Oi, {{1}}! O seu projeto passou para a fase de testes. Quer ver como ficou?"
          aria-describedby="texto-modelo-dica"
          className={estilos.campo}
        />
        <p id="texto-modelo-dica" className="text-xs text-apagado">
          Use {"{{1}}"}, {"{{2}}"}… para o que muda em cada envio, como o nome do cliente. A variável não pode
          abrir nem fechar o texto, nem ficar colada em outra.
        </p>
      </div>

      {quantas > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-suave">Exemplos para a Meta aprovar</p>
          {Array.from({ length: quantas }, (_, i) => (
            <div key={i} className="flex items-center gap-2">
              <label htmlFor={`exemplo-${i}`} className="w-10 shrink-0 font-mono text-xs text-apagado">
                {`{{${i + 1}}}`}
              </label>
              <input
                id={`exemplo-${i}`}
                name="exemplo"
                required
                maxLength={200}
                value={exemplos[i] ?? ""}
                onChange={(e) => {
                  const novos = [...exemplos];
                  novos[i] = e.target.value;
                  setExemplos(novos);
                }}
                placeholder={i === 0 ? "Olivan" : ""}
                className={estilos.campo}
              />
            </div>
          ))}
        </div>
      )}

      {texto.trim() && (
        <div>
          <p className="mb-1 text-xs text-apagado">Como chega no WhatsApp</p>
          <p className="rounded-md bg-superficie-2 px-3 py-2 text-sm whitespace-pre-wrap">{previa}</p>
        </div>
      )}

      {estado?.erro && (
        <p role="alert" className="text-sm text-perigo">
          {estado.erro}
        </p>
      )}
      {estado?.ok && (
        <p role="status" className="text-sm text-sucesso">
          {estado.ok}
        </p>
      )}
      <button type="submit" disabled={pendente} className={`${estilos.primario} disabled:opacity-60`}>
        {pendente ? "Enviando para a Meta…" : "Criar modelo"}
      </button>
    </form>
  );
}
