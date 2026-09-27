"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITENS = [
  { href: "/", rotulo: "Hoje" },
  { href: "/projetos", rotulo: "Projetos" },
  { href: "/agentes", rotulo: "Agentes" },
];

export function Navegacao({ pendentes }: { pendentes: number }) {
  const caminho = usePathname();
  const ativo = (href: string) => (href === "/" ? caminho === "/" : caminho.startsWith(href));

  return (
    <nav aria-label="Principal" className="flex items-center gap-0.5 sm:gap-1">
      {ITENS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={ativo(item.href) ? "page" : undefined}
          className={`relative rounded-md px-2 py-1.5 text-sm transition-colors sm:px-3 ${
            ativo(item.href) ? "bg-superficie-2 text-texto" : "text-suave hover:text-texto"
          }`}
        >
          {item.rotulo}
          {item.href === "/" && pendentes > 0 && (
            <span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-destaque px-1.5 text-xs font-medium text-fundo">
              {pendentes}
              <span className="sr-only"> esperando você</span>
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
