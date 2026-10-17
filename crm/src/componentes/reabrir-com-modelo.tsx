"use client";

import Link from "next/link";
import { useActionState, useMemo, useRef, useState } from "react";

import { enviarModeloWhatsApp } from "@/app/acoes";
import { CUSTO_CATEGORIA, NOME_CATEGORIA } from "@/lib/rotulos-modelos";

export interface ModeloAprovado {
  nome: string;
  idioma: string;
  categoria: string;
  texto: string;
  variaveis: number;
}

/**
 * Com a janela de 24 horas fechada, a única forma de falar com o contato é um
 * modelo aprovado pela Meta. Mostra como a mensagem vai chegar e quanto a
 * categoria custa antes de enviar.
 */
export function ReabrirComModelo({
  leadId,
  nomeContato,
  modelos,
  erroModelos,
}: {
  leadId: string;
  nomeContato: string;
  modelos: ModeloAprovado[];
  erroModelos?: string;
}) {
  const [estado, enviar, pendente] = useActionState(enviarModeloWhatsApp, undefined);
  const [escolhido, setEscolhido] = useState(modelos[0] ? `${modelos[0].nome}|${modelos[0].idioma}` : "");
  const [valores, setValores] = useState<string[]>([]);
  // Um id por tentativa: repetir o clique não envia duas vezes; mudar o
  // modelo ou as variáveis é outra tentativa.
  const pedido = useRef<string | null>(null);
  const modelo = modelos.find((m) => `${m.nome}|${m.idioma}` === escolhido);
  const parametros = useMemo(
    () => Array.from({ length: modelo?.variaveis ?? 0 }, (_, i) => valores[i] ?? (i === 0 ? nomeContato : "")),
    [modelo, valores, nomeContato],
  );
  const previa = modelo?.texto.replace(/\{\{(\d+)\}\}/g, (_, n) => parametros[Number(n) - 1] || `{{${n}}}`) ?? "";

  if (erroModelos || modelos.length === 0) {
    return (
      <div className="shrink-0 border-t border-linha bg-superficie px-3 py-2 text-[11px] text-apagado">
        <p>Janela de 24 horas encerrada. Para falar com o contato, envie um modelo aprovado pela Meta.</p>
        <p className="mt-1">
          {erroModelos ?? "Nenhum modelo aprovado ainda."}{" "}
          <Link href="/whatsapp/modelos" className="text-destaque hover:underline">
            Ver modelos
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form
      action={(form) => {
        pedido.current ??= crypto.randomUUID();
        form.set("pedidoId", pedido.current);
        enviar(form);
      }}
      className="shrink-0 space-y-2 border-t border-linha bg-superficie px-3 py-2"
    >
      <p className="text-[11px] text-apagado">
        Janela de 24 horas encerrada. Reabra com um modelo; quando o cliente responder, a conversa volta ao normal.
      </p>
      <input type="hidden" name="leadId" value={leadId} />
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="modelo-whatsapp" className="sr-only">
          Modelo
        </label>
        <select
          id="modelo-whatsapp"
          name="modelo"
          value={escolhido}
          onChange={(e) => {
            setEscolhido(e.target.value);
            setValores([]);
            pedido.current = null;
          }}
          className="min-w-0 flex-1 rounded-md border border-linha-forte bg-fundo px-2 py-1.5 text-xs"
        >
          {modelos.map((m) => (
            <option key={`${m.nome}|${m.idioma}`} value={`${m.nome}|${m.idioma}`}>
              {m.nome} · {NOME_CATEGORIA[m.categoria] ?? m.categoria}
            </option>
          ))}
        </select>
      </div>
      {parametros.map((valor, i) => (
        <div key={i} className="flex items-center gap-2">
          <label htmlFor={`parametro-${i}`} className="w-10 shrink-0 font-mono text-[11px] text-apagado">
            {`{{${i + 1}}}`}
          </label>
          <input
            id={`parametro-${i}`}
            name="parametro"
            required
            maxLength={200}
            value={valor}
            onChange={(e) => {
              const novos = [...parametros];
              novos[i] = e.target.value;
              setValores(novos);
              pedido.current = null;
            }}
            className="min-w-0 flex-1 rounded-md border border-linha-forte bg-fundo px-2 py-1.5 text-xs"
          />
        </div>
      ))}
      {modelo && (
        <>
          <p className="rounded-md bg-superficie-2 px-2.5 py-1.5 text-[12px] whitespace-pre-wrap">{previa}</p>
          <p className="text-[11px] text-apagado">{CUSTO_CATEGORIA[modelo.categoria] ?? ""} Enviar assume a conversa.</p>
        </>
      )}
      <div className="flex items-center justify-between gap-2">
        <Link href="/whatsapp/modelos" className="text-[11px] text-suave hover:text-texto">
          Modelos
        </Link>
        <button
          type="submit"
          disabled={pendente || !modelo}
          className="h-8 rounded-md bg-destaque px-3 text-xs font-semibold text-fundo hover:bg-destaque-forte disabled:opacity-50"
        >
          {pendente ? "Enviando…" : "Enviar modelo"}
        </button>
      </div>
      {estado?.erro && (
        <p role="alert" className="text-xs text-perigo">
          {estado.erro}
        </p>
      )}
      {estado?.ok && (
        <p role="status" className="text-xs text-sucesso">
          {estado.ok}
        </p>
      )}
    </form>
  );
}
