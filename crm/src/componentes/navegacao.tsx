"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITENS = [
  { href: "/", rotulo: "Hoje" },
  { href: "/projetos", rotulo: "Projetos" },
  { href: "/leads", rotulo: "Leads" },
  { href: "/whatsapp", rotulo: "WhatsApp" },
  { href: "/agentes", rotulo: "Agentes" },
];

function Contador({ n, rotulo }: { n: number; rotulo: string }) {
  if (n <= 0) return null;
  return (
    <span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-destaque px-1.5 text-xs font-medium text-fundo">
      {n}
      <span className="sr-only"> {rotulo}</span>
    </span>
  );
}

export function Navegacao({ pendentes, leadsNovos }: { pendentes: number; leadsNovos: number }) {
  const caminho = usePathname();
  const ativo = (href: string) => (href === "/" ? caminho === "/" : caminho.startsWith(href));

  return (
    <nav aria-label="Principal" className="flex min-w-0 items-center gap-0.5 overflow-x-auto sm:gap-1">
      {ITENS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={ativo(item.href) ? "page" : undefined}
          className={`relative shrink-0 rounded-md px-1.5 py-1.5 text-xs transition-colors sm:px-3 sm:text-sm ${
            ativo(item.href) ? "bg-superficie-2 text-texto" : "text-suave hover:text-texto"
          }`}
        >
          {item.rotulo}
          {item.href === "/" && <Contador n={pendentes} rotulo="esperando você" />}
          {item.href === "/leads" && <Contador n={leadsNovos} rotulo="novos" />}
        </Link>
      ))}
    </nav>
  );
}
