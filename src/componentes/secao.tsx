export function Secao({
  titulo,
  contagem,
  children,
  acao,
}: {
  titulo: string;
  contagem?: number;
  children: React.ReactNode;
  acao?: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-medium text-suave">
          {titulo}
          {contagem !== undefined && <span className="ml-2 font-mono text-xs text-apagado">{contagem}</span>}
        </h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

export function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-linha px-4 py-6 text-sm text-apagado">{children}</p>;
}
