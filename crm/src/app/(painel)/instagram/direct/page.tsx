import Link from 'next/link';
import type { Metadata } from 'next';
import { CaixaInstagram } from '@/componentes/caixa-instagram';
import { exigirSessao } from '@/lib/sessao';
export const metadata:Metadata={title:'Instagram · Direct'};
export const dynamic='force-dynamic';
export default async function Direct() {
  await exigirSessao();
  return <div className="space-y-4"><header className="flex flex-wrap items-baseline justify-between gap-3"><h1 className="text-xl font-semibold">Instagram · Direct</h1><div className="flex gap-4 text-sm text-suave"><Link href="/instagram/campanhas">Comentários para DM</Link><Link href="/instagram">Publicações</Link></div></header><CaixaInstagram/></div>;
}
