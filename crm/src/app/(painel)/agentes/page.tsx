import type { Metadata } from "next";

import { revogarChave } from "@/app/acoes";
import { BotaoAcao } from "@/componentes/botao-acao";
import { estilos } from "@/componentes/estilos";
import { Secao, Vazio } from "@/componentes/secao";
import { emTransacao } from "@/lib/banco";
import { listarAgentes } from "@/lib/crm";
import { dataCompleta, haQuanto, nomeDoAtor } from "@/lib/formato";
import { exigirSessao } from "@/lib/sessao";

import { FormularioChave } from "./formulario";

export const metadata: Metadata = { title: "Agentes" };

export default async function Agentes() {
  await exigirSessao();
  const agentes = await emTransacao((tx) => listarAgentes(tx));
  const endereco = `${process.env.APP_URL ?? "https://crm.shiftsys.com.br"}/api/mcp`;

  return (
    <div className="max-w-3xl space-y-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Agentes</h1>
        <p className="mt-1 text-sm text-suave">
          Cada agente conecta no MCP com a própria chave. O histórico mostra quem fez o quê, e dá para cortar um
          sem mexer no outro.
        </p>
      </header>

      <Secao titulo="Nova chave">
        <FormularioChave endereco={endereco} />
      </Secao>

      <Secao titulo="Chaves" contagem={agentes.length}>
        {agentes.length === 0 ? (
          <Vazio>Nenhuma chave ainda. Gere uma para o Claude Code e outra para o Codex.</Vazio>
        ) : (
          <ul className="divide-y divide-linha rounded-lg border border-linha">
            {agentes.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
                <div className="min-w-40">
                  <p className={`text-sm font-medium ${a.revogadoEm ? "text-apagado line-through" : ""}`}>
                    {nomeDoAtor(`agente:${a.nome}`)}
                  </p>
                  <p className="font-mono text-xs text-apagado">scrm_…{a.tokenFinal}</p>
                </div>
                <p className="flex-1 text-xs text-apagado">
                  criada {haQuanto(a.criadoEm)} ·{" "}
                  {a.ultimoUsoEm ? (
                    <span title={dataCompleta(a.ultimoUsoEm)}>usada {haQuanto(a.ultimoUsoEm)}</span>
                  ) : (
                    "nunca usada"
                  )}
                </p>
                {a.revogadoEm ? (
                  <span className="text-xs text-apagado">revogada {haQuanto(a.revogadoEm)}</span>
                ) : (
                  <BotaoAcao
                    acao={revogarChave.bind(null, a.id)}
                    className={estilos.perigo}
                    confirmar={`Revogar a chave do ${a.nome}? Ele perde o acesso na hora.`}
                  >
                    Revogar
                  </BotaoAcao>
                )}
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </div>
  );
}
