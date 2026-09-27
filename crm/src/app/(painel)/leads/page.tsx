import type { Metadata } from "next";
import Link from "next/link";

import { Vazio } from "@/componentes/secao";
import { SeletorEtapaLead } from "@/componentes/seletor-etapa-lead";
import { emTransacao } from "@/lib/banco";
import { ETAPAS_LEAD, IDS_ETAPA_LEAD, nomeDaEtapaLead } from "@/lib/dominio";
import type { EtapaLead } from "@/lib/dominio";
import { dataCompleta, haQuanto } from "@/lib/formato";
import { contarLeadsPorEtapa, listarLeads } from "@/lib/leads";
import { exigirSessao } from "@/lib/sessao";

export const metadata: Metadata = { title: "Leads" };

const ROTULOS: Record<string, string> = {
  segmento: "Segmento",
  controle: "Controle hoje",
  dor: "Maior dor",
  ia: "Uso de IA",
  equipe: "Equipe",
  prazo: "Prazo",
};

/** "54999991234" → "(54) 99999-1234". Número fora do padrão sai como veio. */
function telefone(digitos: string): string {
  const d = digitos.replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digitos;
}

const linkWhatsApp = (digitos: string) => `https://wa.me/${digitos.length <= 11 ? `55${digitos}` : digitos}`;

export default async function Leads({ searchParams }: PageProps<"/leads">) {
  await exigirSessao();
  const { etapa: filtro } = await searchParams;
  const etapa = IDS_ETAPA_LEAD.includes(filtro as EtapaLead) ? (filtro as EtapaLead) : undefined;
  const [leads, contagem] = await emTransacao(async (tx) =>
    Promise.all([listarLeads(tx, etapa), contarLeadsPorEtapa(tx)]),
  );
  const total = Object.values(contagem).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
        <p className="mt-1 text-sm text-apagado">
          Quem fez o diagnóstico no site e autorizou o contato.
        </p>
      </header>

      <nav aria-label="Etapas do funil" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1.5">
          {[{ id: undefined, nome: "Todos", n: total }, ...ETAPAS_LEAD.map((e) => ({ ...e, n: contagem[e.id] ?? 0 }))].map(
            (item) => {
              const ativo = item.id === etapa;
              return (
                <li key={item.id ?? "todos"}>
                  <Link
                    href={item.id ? `/leads?etapa=${item.id}` : "/leads"}
                    aria-current={ativo ? "page" : undefined}
                    className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                      ativo
                        ? "border-destaque bg-destaque-fundo text-texto"
                        : "border-linha text-suave hover:border-linha-forte hover:text-texto"
                    }`}
                  >
                    {item.nome}
                    <span className="font-mono text-xs text-apagado">{item.n}</span>
                  </Link>
                </li>
              );
            },
          )}
        </ul>
      </nav>

      {leads.length === 0 ? (
        <Vazio>
          {etapa
            ? `Nenhum lead em ${nomeDaEtapaLead(etapa)}.`
            : "Nenhum lead ainda. Quando alguém fizer o diagnóstico no site e autorizar o contato, aparece aqui."}
        </Vazio>
      ) : (
        <ul className="divide-y divide-linha rounded-lg border border-linha">
          {leads.map((lead) => (
            <li key={lead.id} className="space-y-3 px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium">
                    {lead.nome}
                    {lead.empresa && <span className="font-normal text-suave"> · {lead.empresa}</span>}
                  </p>
                  <p className="mt-0.5 text-sm text-suave">
                    {[lead.segmento, lead.dor].filter(Boolean).join(" · ") || "Sem respostas"}
                  </p>
                  <p className="mt-1 text-xs text-apagado">
                    <a
                      href={linkWhatsApp(lead.whatsapp)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-destaque hover:underline"
                    >
                      {telefone(lead.whatsapp)}
                    </a>
                    {" · "}
                    <span title={dataCompleta(lead.criadoEm)}>chegou {haQuanto(lead.criadoEm)}</span>
                    {lead.atualizadoEm > lead.criadoEm && (
                      <span title={dataCompleta(lead.atualizadoEm)}> · atualizado {haQuanto(lead.atualizadoEm)}</span>
                    )}
                  </p>
                </div>
                <SeletorEtapaLead id={lead.id} etapa={lead.etapa} nome={lead.nome} />
              </div>

              <details>
                <summary className="cursor-pointer text-sm text-apagado hover:text-suave">Diagnóstico completo</summary>
                <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  {Object.entries(lead.respostas).map(([chave, valor]) => (
                    <div key={chave}>
                      <dt className="text-xs text-apagado">{ROTULOS[chave] ?? chave}</dt>
                      <dd>{valor}</dd>
                    </div>
                  ))}
                  {lead.nivel && (
                    <div>
                      <dt className="text-xs text-apagado">Nível calculado</dt>
                      <dd>{lead.nivel}</dd>
                    </div>
                  )}
                  {lead.oferta && (
                    <div>
                      <dt className="text-xs text-apagado">Oferta sugerida pelo site</dt>
                      <dd>{lead.oferta}</dd>
                    </div>
                  )}
                  {lead.processo && (
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-apagado">Processo sugerido</dt>
                      <dd>{lead.processo}</dd>
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-apagado">Consentimento</dt>
                    <dd>Autorizado em {dataCompleta(lead.consentimentoEm)}</dd>
                  </div>
                </dl>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
