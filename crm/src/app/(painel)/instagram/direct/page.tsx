import Link from 'next/link';
import type { Metadata } from 'next';
import { CaixaInstagram } from '@/componentes/caixa-instagram';
import { exigirSessao } from '@/lib/sessao';
export const metadata:Metadata={title:'Instagram · Direct'};
export const dynamic='force-dynamic';
export default async function Direct() {
  await exigirSessao();
  return <div className="space-y-4"><header className="flex items-baseline justify-between"><h1 className="text-xl font-semibold">Instagram · Direct</h1><Link href="/instagram" className="text-sm text-suave">Publicações</Link></header><CaixaInstagram/></div>;
}
