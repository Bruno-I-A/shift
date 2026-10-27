import Link from 'next/link';
import type {Metadata} from 'next';
import {CampanhasInstagram} from '@/componentes/campanhas-instagram';
import {exigirSessao} from '@/lib/sessao';
export const metadata:Metadata={title:'Instagram · Comentários para DM'};
export const dynamic='force-dynamic';
export default async function Campanhas(){
  await exigirSessao();
  return <div className="space-y-5"><header className="flex flex-wrap items-baseline justify-between gap-3"><div><h1 className="text-xl font-semibold">Instagram · Comentários para DM</h1><p className="mt-1 text-sm text-suave">Entregue uma mensagem a quem comentar a palavra escolhida. A IA continua depois da resposta no Direct.</p></div><Link href="/instagram/direct" className="text-sm text-suave">Conversas do Direct →</Link></header><CampanhasInstagram/></div>;
}
