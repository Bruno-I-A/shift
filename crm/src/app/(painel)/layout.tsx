import Link from "next/link";

import { sair } from "@/app/acoes";
import { Marca } from "@/componentes/marca";
import { Navegacao } from "@/componentes/navegacao";
import { emTransacao } from "@/lib/banco";
import { exigirSessao } from "@/lib/sessao";

export default async function LayoutPainel({ children }: LayoutProps<"/">) {
  await exigirSessao();
  const { rows } = await emTransacao((tx) =>
    tx.query<{ n: number }>("select count(*)::int as n from crm.proposta_etapa where decisao is null"),
  );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-linha bg-fundo/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
          <Link href="/" aria-label="Shift CRM, início">
            <Marca />
          </Link>
          <Navegacao pendentes={rows[0]?.n ?? 0} />
          <form action={sair} className="ml-auto">
            <button type="submit" className="text-sm text-apagado transition-colors hover:text-texto">
              Sair
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
