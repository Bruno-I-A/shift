import type { Metadata } from "next";
import Link from "next/link";

import { emTransacao } from "@/lib/banco";
import { configuracaoPublica, listarConexoes } from "@/lib/conexoes-whatsapp";
import { ErroDeDominio } from "@/lib/dominio";
import { exigirSessao } from "@/lib/sessao";

import { ConectarNumeros } from "./conectar";

export const metadata: Metadata = { title: "Conectar números" };
export const dynamic = "force-dynamic";

export default async function Conectar() {
  await exigirSessao();
  let configuracao: ReturnType<typeof configuracaoPublica> | null = null;
  let erro: string | undefined;
  try {
    configuracao = configuracaoPublica();
  } catch (e) {
    erro = e instanceof ErroDeDominio ? e.message : "Conexão de números não configurada.";
  }
  const conexoes = await emTransacao(listarConexoes);

  return (
    <div className="max-w-3xl space-y-8">
      <header>
        <p className="text-sm text-apagado">
          <Link href="/whatsapp" className="hover:text-texto">WhatsApp</Link>
          <span aria-hidden> / </span>
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Conectar números</h1>
        <p className="mt-1 text-sm text-suave">
          Teste de coexistência: o número continua no app WhatsApp Business do celular e também passa a responder pela
          API oficial, pelo app aprovado da Shift. As mensagens dos números de outras empresas não entram na caixa da
          Shift; aqui aparece só a contagem dos avisos que a Meta manda. O número da própria Shift continua na caixa,
          com o agente.
        </p>
      </header>
      <ConectarNumeros configuracao={configuracao} erroConfiguracao={erro} iniciais={JSON.parse(JSON.stringify(conexoes))} />
    </div>
  );
}
