import type { Metadata } from "next";

import {
  aprovarPublicacao,
  cancelarPublicacao,
  desconectarInstagram,
  publicarAgora,
  tentarPublicacaoDeNovo,
} from "@/app/acoes";
import { BotaoAcao } from "@/componentes/botao-acao";
import { estilos } from "@/componentes/estilos";
import { Secao, Vazio } from "@/componentes/secao";
import { emTransacao } from "@/lib/banco";
import { dataCompleta, haQuanto, nomeDoAtor } from "@/lib/formato";
import { lerConta, listarPublicacoes, type Publicacao } from "@/lib/instagram";
import { faltandoParaInstagram } from "@/lib/instagram-meta";
import { nomeDoTipoPublicacao, paraCampoDeHorario } from "@/lib/instagram-regras";
import { exigirSessao } from "@/lib/sessao";

import { FormularioPublicacao } from "./formulario";

export const metadata: Metadata = { title: "Instagram" };
export const dynamic = "force-dynamic";

const AVISOS: Record<string, { texto: string; bom?: boolean }> = {
  conectado: { texto: "Instagram conectado.", bom: true },
  recusado: { texto: "O login foi cancelado no Instagram. Nada mudou." },
  estado: { texto: "O retorno do Instagram não bateu com o pedido de login. Conecte de novo." },
  falhou: { texto: "O Instagram não concluiu o login. Tente de novo; se repetir, confira o app na Meta." },
  configuracao: { texto: "Falta configurar o app da Meta no Ambiente do Easypanel." },
};

const NOME_ESTADO: Record<string, string> = {
  aguardando_aprovacao: "Esperando sua aprovação",
  agendada: "Agendada",
  preparando: "Na Meta, processando",
  publicada: "Publicada",
  falhou: "Falhou",
  cancelada: "Cancelada",
};

function Previa({ publicacao }: { publicacao: Publicacao }) {
  const itens = publicacao.midias.filter((m) => m.papel === "item");
  const capa = publicacao.midias.find((m) => m.papel === "capa");
  if (itens.every((m) => m.apagada)) {
    return <p className="w-28 shrink-0 text-xs text-apagado">Arquivo já saiu do CRM.</p>;
  }
  const link = (chave: string) => `/api/instagram/midia/${chave}`;
  return (
    <div className="flex shrink-0 gap-1.5 overflow-x-auto sm:max-w-80">
      {itens.map((m) =>
        m.tipoMime.startsWith("video/") ? (
          <video
            key={m.chave}
            src={link(m.chave)}
            poster={capa && !capa.apagada ? link(capa.chave) : undefined}
            controls
            preload="metadata"
            className="h-48 w-27 rounded-md bg-superficie-2 object-cover"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- arquivo privado, servido pela própria rota
          <img
            key={m.chave}
            src={link(m.chave)}
            alt=""
            className="h-32 w-auto rounded-md bg-superficie-2 object-cover"
          />
        ),
      )}
    </div>
  );
}

function Cartao({ publicacao, conectado }: { publicacao: Publicacao; conectado: boolean }) {
  const p = publicacao;
  const quando = p.publicadaEm ?? p.agendadaPara;

  return (
    <li className="flex flex-col gap-4 px-4 py-4 sm:flex-row">
      <Previa publicacao={p} />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="text-sm font-medium">
            {nomeDoTipoPublicacao(p.tipo)} · {dataCompleta(quando)}
          </span>
          <span className={`text-xs ${p.estado === "falhou" ? "text-perigo" : p.estado === "publicada" ? "text-sucesso" : "text-ouro"}`}>
            {NOME_ESTADO[p.estado] ?? p.estado}
          </span>
        </p>
        <p className="text-xs text-apagado">
          Enviada por {p.criadaPor === "bruno" ? "você" : nomeDoAtor(p.criadaPor)} {haQuanto(p.criadaEm)}
          {p.tipo === "reel" && !p.mostrarNoFeed && " · só na aba de Reels"}
        </p>
        {p.legenda ? (
          <p className="line-clamp-6 text-sm whitespace-pre-wrap text-suave">{p.legenda}</p>
        ) : (
          <p className="text-sm text-apagado">Sem legenda.</p>
        )}
        {p.atrasada && !conectado && (
          <p className="text-sm text-perigo">Atrasada: o Instagram não está conectado.</p>
        )}
        {p.erro && (
          <p role={p.estado === "falhou" ? "alert" : undefined} className="text-sm text-perigo">
            {p.estado === "falhou" ? p.erro : `Última tentativa: ${p.erro} Tentando de novo sozinho.`}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {p.estado === "aguardando_aprovacao" && (
            <BotaoAcao acao={aprovarPublicacao.bind(null, p.id)} className={estilos.primario}>
              {p.vencida ? "Aprovar e publicar já" : "Aprovar"}
            </BotaoAcao>
          )}
          {p.estado === "agendada" && (
            <BotaoAcao
              acao={publicarAgora.bind(null, p.id)}
              confirmar="Publicar agora, em vez de esperar o horário marcado?"
              className={estilos.secundario}
            >
              Publicar agora
            </BotaoAcao>
          )}
          {p.estado === "falhou" && (
            <BotaoAcao acao={tentarPublicacaoDeNovo.bind(null, p.id)} className={estilos.secundario}>
              Tentar de novo
            </BotaoAcao>
          )}
          {["aguardando_aprovacao", "agendada", "preparando", "falhou"].includes(p.estado) && (
            <BotaoAcao
              acao={cancelarPublicacao.bind(null, p.id)}
              confirmar="Cancelar esta publicação? Os arquivos saem do CRM."
              className={estilos.perigo}
            >
              Cancelar
            </BotaoAcao>
          )}
          {p.link && (
            <a href={p.link} target="_blank" rel="noreferrer noopener" className={estilos.fantasma}>
              Ver no Instagram ↗
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

function Lista({ publicacoes, conectado, vazio }: { publicacoes: Publicacao[]; conectado: boolean; vazio: string }) {
  if (publicacoes.length === 0) return <Vazio>{vazio}</Vazio>;
  return (
    <ul className="divide-y divide-linha rounded-lg border border-linha">
      {publicacoes.map((p) => (
        <Cartao key={p.id} publicacao={p} conectado={conectado} />
      ))}
    </ul>
  );
}

export default async function Instagram({ searchParams }: PageProps<"/instagram">) {
  await exigirSessao();
  const { aviso } = await searchParams;
  const avisoAtual = typeof aviso === "string" ? AVISOS[aviso] : undefined;
  const faltando = faltandoParaInstagram();
  const [conta, publicacoes] = await emTransacao((tx) => Promise.all([lerConta(tx), listarPublicacoes(tx)]));

  const porHorario = (a: Publicacao, b: Publicacao) => new Date(a.agendadaPara).getTime() - new Date(b.agendadaPara).getTime();
  const aguardando = publicacoes.filter((p) => p.estado === "aguardando_aprovacao").sort(porHorario);
  const fila = publicacoes.filter((p) => p.estado === "agendada" || p.estado === "preparando").sort(porHorario);
  const falhas = publicacoes.filter((p) => p.estado === "falhou");
  const publicadas = publicacoes.filter((p) => p.estado === "publicada");
  const conectado = conta?.valida ?? false;

  return (
    <div className="max-w-4xl space-y-10">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Instagram</h1>
          <p className="mt-1 text-sm text-suave">
            Reels, carrosséis e fotos da Shift, publicados na hora marcada. O que um agente propõe só vai ao ar depois
            que você aprova.
          </p>
        </div>

        {avisoAtual && (
          <p
            role="status"
            className={`rounded-lg border px-4 py-3 text-sm ${avisoAtual.bom ? "border-sucesso/40 text-sucesso" : "border-perigo/40 text-perigo"}`}
          >
            {avisoAtual.texto}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-linha px-4 py-3 text-sm">
          {faltando.length > 0 ? (
            <p className="text-suave">
              Falta no Ambiente do Easypanel: <span className="font-mono text-xs">{faltando.join(", ")}</span>. Os
              valores saem do app na Meta, em Instagram → Configuração da API com login do Instagram.
            </p>
          ) : conta ? (
            <>
              <p className="min-w-0 flex-1">
                <span className="font-medium">@{conta.nomeUsuario}</span>
                <span className="text-apagado">
                  {" "}
                  · conectado {haQuanto(conta.conectadaEm)} ·{" "}
                  {conectado
                    ? `permissão até ${dataCompleta(conta.tokenExpiraEm)}, renovada sozinha toda semana`
                    : "a permissão venceu: conecte de novo"}
                </span>
              </p>
              <a href="/api/instagram/conectar" className={estilos.secundario}>
                Conectar de novo
              </a>
              <BotaoAcao
                acao={desconectarInstagram}
                confirmar="Desconectar o Instagram? As publicações agendadas ficam esperando até conectar de novo."
                className={estilos.perigo}
              >
                Desconectar
              </BotaoAcao>
            </>
          ) : (
            <>
              <p className="min-w-0 flex-1 text-suave">Nenhuma conta conectada.</p>
              <a href="/api/instagram/conectar" className={estilos.primario}>
                Conectar o Instagram
              </a>
            </>
          )}
        </div>
      </header>

      {aguardando.length > 0 && (
        <Secao titulo="Esperando sua aprovação" contagem={aguardando.length}>
          <Lista publicacoes={aguardando} conectado={conectado} vazio="" />
        </Secao>
      )}

      <Secao titulo="Na fila" contagem={fila.length}>
        <Lista publicacoes={fila} conectado={conectado} vazio="Nada agendado. Agende a próxima abaixo." />
      </Secao>

      {falhas.length > 0 && (
        <Secao titulo="Com problema" contagem={falhas.length}>
          <Lista publicacoes={falhas} conectado={conectado} vazio="" />
        </Secao>
      )}

      <Secao titulo="Nova publicação">
        <FormularioPublicacao minimo={paraCampoDeHorario()} />
      </Secao>

      <Secao titulo="Publicadas nos últimos 60 dias" contagem={publicadas.length}>
        <Lista publicacoes={publicadas} conectado={conectado} vazio="Nada publicado pelo CRM ainda." />
      </Secao>
    </div>
  );
}
