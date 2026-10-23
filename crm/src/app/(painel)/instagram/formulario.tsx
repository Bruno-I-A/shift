"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { estilos } from "@/componentes/estilos";

type Tipo = "reel" | "carrossel" | "foto";

const ACEITA: Record<Tipo, string> = {
  reel: "video/mp4,video/quicktime",
  foto: "image/jpeg,image/png,image/webp",
  carrossel: "image/jpeg,image/png,image/webp,video/mp4,video/quicktime",
};

/**
 * A Meta só aceita foto em JPEG, e a arte sai do Remotion e do Canva em PNG.
 * A conversão é aqui, no navegador, para o servidor não precisar de
 * biblioteca de imagem. Transparência vira fundo branco, como no Instagram.
 */
async function paraJpeg(arquivo: File): Promise<File> {
  if (!arquivo.type.startsWith("image/") || arquivo.type === "image/jpeg") return arquivo;
  const imagem = await createImageBitmap(arquivo);
  const tela = document.createElement("canvas");
  tela.width = imagem.width;
  tela.height = imagem.height;
  const pincel = tela.getContext("2d");
  if (!pincel) throw new Error("Este navegador não converteu a imagem. Envie em JPEG.");
  pincel.fillStyle = "#ffffff";
  pincel.fillRect(0, 0, tela.width, tela.height);
  pincel.drawImage(imagem, 0, 0);
  const blob = await new Promise<Blob | null>((resolver) => tela.toBlob(resolver, "image/jpeg", 0.92));
  if (!blob) throw new Error("Não consegui converter a imagem para JPEG.");
  return new File([blob], `${arquivo.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
}

const contar = (texto: string, padrao: RegExp) => texto.match(padrao)?.length ?? 0;

export function FormularioPublicacao({ minimo }: { minimo: string }) {
  const router = useRouter();
  const formulario = useRef<HTMLFormElement>(null);
  const [tipo, setTipo] = useState<Tipo>("reel");
  const [quando, setQuando] = useState<"agendar" | "agora">("agendar");
  const [legenda, setLegenda] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const hashtags = contar(legenda, /#[\p{L}\p{N}_]+/gu);

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setOk(null);
    const lido = new FormData(evento.currentTarget);
    const envio = new FormData();
    envio.set("tipo", tipo);
    envio.set("legenda", legenda);
    envio.set("horario", quando === "agora" ? "" : String(lido.get("horario") ?? ""));
    envio.set("mostrar_no_feed", lido.get("mostrar_no_feed") ? "sim" : "nao");

    setEnviando(true);
    try {
      for (const arquivo of lido.getAll("item")) {
        if (arquivo instanceof File && arquivo.size > 0) envio.append("item", await paraJpeg(arquivo));
      }
      const capa = lido.get("capa");
      if (capa instanceof File && capa.size > 0) envio.set("capa", await paraJpeg(capa));

      const resposta = await fetch("/api/instagram/publicacoes", { method: "POST", body: envio });
      const corpo = (await resposta.json().catch(() => ({}))) as { erro?: string };
      if (!resposta.ok) {
        setErro(corpo.erro ?? "Não deu para enviar. Nada foi gravado.");
        return;
      }
      setOk(quando === "agora" ? "Enviada. Vai para o Instagram em até um minuto." : "Agendada.");
      formulario.current?.reset();
      setLegenda("");
      router.refresh();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não deu para enviar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form ref={formulario} onSubmit={enviar} className="max-w-2xl space-y-5">
      <fieldset className="space-y-2">
        <legend className="text-sm text-suave">Tipo</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {(["reel", "carrossel", "foto"] as const).map((valor) => (
            <label key={valor} className="flex items-center gap-2 text-sm">
              <input type="radio" name="tipo" value={valor} checked={tipo === valor} onChange={() => setTipo(valor)} />
              {{ reel: "Reel", carrossel: "Carrossel", foto: "Foto" }[valor]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="itens-publicacao" className="block text-sm text-suave">
          {tipo === "reel" ? "Vídeo" : tipo === "foto" ? "Foto" : "Fotos e vídeos"}
        </label>
        <input
          key={tipo}
          id="itens-publicacao"
          name="item"
          type="file"
          required
          multiple={tipo === "carrossel"}
          accept={ACEITA[tipo]}
          aria-describedby="itens-publicacao-dica"
          className="block w-full text-sm text-suave file:mr-3 file:rounded-md file:border file:border-linha-forte file:bg-fundo file:px-3 file:py-1.5 file:text-sm file:text-texto"
        />
        <p id="itens-publicacao-dica" className="text-xs text-apagado">
          {tipo === "reel"
            ? "MP4 ou MOV, em pé (9:16), até 100 MB."
            : tipo === "foto"
              ? "De 4:5 (em pé) a 1,91:1 (deitada). PNG vira JPEG no envio."
              : "De 2 a 20, na ordem em que você escolher. Todos são cortados pela proporção do primeiro."}
        </p>
      </div>

      {tipo === "reel" && (
        <>
          <div className="space-y-1.5">
            <label htmlFor="capa-publicacao" className="block text-sm text-suave">
              Capa <span className="text-apagado">(opcional)</span>
            </label>
            <input
              id="capa-publicacao"
              name="capa"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="block w-full text-sm text-suave file:mr-3 file:rounded-md file:border file:border-linha-forte file:bg-fundo file:px-3 file:py-1.5 file:text-sm file:text-texto"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="mostrar_no_feed" defaultChecked />
            Mostrar também no feed, além da aba de Reels
          </label>
        </>
      )}

      <div className="space-y-1.5">
        <label htmlFor="legenda-publicacao" className="block text-sm text-suave">
          Legenda
        </label>
        <textarea
          id="legenda-publicacao"
          rows={6}
          maxLength={2200}
          value={legenda}
          onChange={(e) => setLegenda(e.target.value)}
          aria-describedby="legenda-publicacao-dica"
          className={estilos.campo}
        />
        <p id="legenda-publicacao-dica" className={`text-xs ${hashtags > 30 ? "text-perigo" : "text-apagado"}`}>
          {legenda.length}/2200 · {hashtags} {hashtags === 1 ? "hashtag" : "hashtags"} (até 30)
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm text-suave">Quando</legend>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={quando === "agendar"} onChange={() => setQuando("agendar")} />
            Agendar
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={quando === "agora"} onChange={() => setQuando("agora")} />
            Publicar agora
          </label>
        </div>
        {quando === "agendar" && (
          <div className="space-y-1">
            <input
              name="horario"
              type="datetime-local"
              required
              min={minimo}
              aria-label="Dia e hora"
              className={`${estilos.campo} max-w-60`}
            />
            <p className="text-xs text-apagado">Horário de Brasília. O melhor horário da Shift é terça a sexta, às 10h.</p>
          </div>
        )}
      </fieldset>

      {erro && (
        <p role="alert" className="text-sm text-perigo">
          {erro}
        </p>
      )}
      {ok && (
        <p role="status" className="text-sm text-sucesso">
          {ok}
        </p>
      )}
      <button type="submit" disabled={enviando} className={`${estilos.primario} disabled:opacity-60`}>
        {enviando ? "Enviando…" : quando === "agora" ? "Publicar" : "Agendar"}
      </button>
    </form>
  );
}
