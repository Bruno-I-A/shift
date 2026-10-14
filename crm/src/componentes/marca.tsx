import Image from 'next/image';
import logo from '../../public/brand/shift-logo-linho.png';

/** A mesma assinatura aprovada e aplicada no site institucional. */
export function Marca() {
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <Image src={logo} alt="Shift" className="h-auto w-28" sizes="112px" preload />
      <span className="border-l border-linha-forte pl-2 font-mono text-[10px] uppercase tracking-[0.16em] text-suave">crm</span>
    </span>
  );
}
