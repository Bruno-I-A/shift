/**
 * A logo da Shift está sendo redesenhada (set/2026) e o Bruno pediu para não
 * aplicar nada até escolher a versão final. Até lá, o nome em texto.
 */
export function Marca() {
  return (
    <span className="inline-flex items-baseline gap-1.5 select-none">
      <span className="text-lg font-semibold tracking-tight text-texto">Shift</span>
      <span className="font-mono text-xs uppercase tracking-[0.18em] text-destaque">crm</span>
    </span>
  );
}
