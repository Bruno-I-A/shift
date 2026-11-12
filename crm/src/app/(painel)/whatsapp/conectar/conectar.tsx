"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { estilos } from "@/componentes/estilos";

interface Conexao {
  id: string;
  wabaId: string;
  numeroDaShift: boolean;
  phoneNumberId: string;
  numeroExibicao: string | null;
  nomeVerificado: string | null;
  conectadaEm: string;
  sincContatosEm: string | null;
  sincHistoricoEm: string | null;
  eventos: Record<string, number>;
  ultimoEventoEm: string | null;
  prazoSincronizarVencido: boolean;
}

interface SessaoMeta { event: string; waba_id?: string; phone_number_id?: string; business_id?: string }

interface SdkFacebook {
  init(opcoes: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }): void;
  login(
    resposta: (r: { authResponse?: { code?: string } | null }) => void,
    opcoes: Record<string, unknown>,
  ): void;
}

declare global {
  interface Window { FB?: SdkFacebook; fbAsyncInit?: () => void }
}

const NOMES_AVISOS: Record<string, string> = {
  messages: "Mensagens pela API",
  smb_message_echoes: "Enviadas pelo app",
  smb_app_state_sync: "Contatos",
  history: "Histórico",
  account_update: "Conta",
};

const quando = (valor: string | null) =>
  valor ? new Date(valor).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }) : "—";

async function chamar(corpo: Record<string, unknown>): Promise<Record<string, unknown>> {
  const resposta = await fetch("/api/whatsapp/conexoes", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(typeof dados.erro === "string" ? dados.erro : "Não foi possível concluir.");
  return dados;
}

/** Só aceita mensagens da própria Meta: qualquer outra janela pode mandar `postMessage`. */
function daMeta(origem: string): boolean {
  try {
    const host = new URL(origem).hostname;
    return host === "facebook.com" || host.endsWith(".facebook.com");
  } catch { return false; }
}

export function ConectarNumeros({ configuracao, erroConfiguracao, iniciais }: {
  configuracao: { appId: string; configId: string; versao: string } | null;
  erroConfiguracao?: string;
  iniciais: Conexao[];
}) {
  const router = useRouter();
  const [sdkPronto, setSdkPronto] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null);
  const [conectando, setConectando] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [estados, setEstados] = useState<Record<string, string>>({});
  const [daShift, setDaShift] = useState(false);
  const numeroDaShift = useRef(false);
  const codigo = useRef<string | null>(null);
  const sessao = useRef<SessaoMeta | null>(null);
  const enviado = useRef(false);

  /** `semAviso`: segue só com o código; o servidor acha a conta pela permissão. */
  const concluir = useCallback(async (semAviso = false) => {
    if (enviado.current || !codigo.current || (!sessao.current?.waba_id && !semAviso)) return;
    enviado.current = true;
    try {
      const r = await chamar({
        acao: "conectar", codigo: codigo.current, waba_id: sessao.current?.waba_id,
        phone_number_id: sessao.current?.phone_number_id, business_id: sessao.current?.business_id, evento: sessao.current?.event,
        numero_da_shift: numeroDaShift.current,
      });
      const numero = r.numero as { display_phone_number?: string } | undefined;
      setAviso({ texto: `Número ${numero?.display_phone_number ?? ""} conectado. Mande uma mensagem pelo app para ver o aviso chegar.`, erro: false });
      router.refresh();
    } catch (e) {
      setAviso({ texto: e instanceof Error ? e.message : "A conexão falhou.", erro: true });
    } finally {
      setConectando(false);
    }
  }, [router]);

  useEffect(() => {
    if (!configuracao) return;
    const iniciarSdk = () => {
      window.FB?.init({ appId: configuracao.appId, autoLogAppEvents: true, xfbml: false, version: configuracao.versao });
      setSdkPronto(true);
    };
    if (window.FB) iniciarSdk();
    else {
      window.fbAsyncInit = iniciarSdk;
      if (!document.getElementById("facebook-jssdk")) {
        const script = document.createElement("script");
        script.id = "facebook-jssdk";
        script.src = "https://connect.facebook.net/pt_BR/sdk.js";
        script.async = true;
        script.defer = true;
        script.crossOrigin = "anonymous";
        document.body.appendChild(script);
      }
    }
    const ouvir = (evento: MessageEvent) => {
      if (!daMeta(evento.origin)) return;
      let dados: { type?: string; event?: string; data?: Record<string, unknown> };
      try { dados = typeof evento.data === "string" ? JSON.parse(evento.data) : evento.data; } catch { return; }
      if (dados?.type !== "WA_EMBEDDED_SIGNUP" || typeof dados.event !== "string") return;
      if (dados.event === "CANCEL") { setAviso({ texto: "Conexão cancelada antes do fim.", erro: true }); setConectando(false); return; }
      if (dados.event === "ERROR") { setAviso({ texto: "A Meta informou um erro no fluxo. Tente de novo.", erro: true }); setConectando(false); return; }
      // Só os nomes, para entender o formato da v5 sem expor dados.
      console.info("[whatsapp] aviso do cadastro:", dados.event, Object.keys(dados.data ?? {}));
      const texto = (chave: string) => (typeof dados.data?.[chave] === "string" ? (dados.data[chave] as string) : undefined);
      sessao.current = { event: dados.event, waba_id: texto("waba_id"), phone_number_id: texto("phone_number_id"), business_id: texto("business_id") };
      void concluir();
    };
    window.addEventListener("message", ouvir);
    return () => window.removeEventListener("message", ouvir);
  }, [configuracao, concluir]);

  function abrirFluxo() {
    if (!configuracao || !window.FB) return;
    codigo.current = null; sessao.current = null; enviado.current = false;
    numeroDaShift.current = daShift;
    setAviso(null); setConectando(true);
    window.FB.login((resposta) => {
      const recebido = resposta.authResponse?.code;
      if (!recebido) { setConectando(false); return; }
      codigo.current = recebido;
      void concluir();
      // O código vale 30 segundos. Se o aviso da sessão não chegar logo, segue sem ele.
      setTimeout(() => { void concluir(true); }, 3_000);
    }, {
      config_id: configuracao.configId,
      response_type: "code",
      override_default_response_type: true,
      // Na v5 a conexão pelo app WhatsApp Business já vem ligada por padrão.
      extras: { version: "v5" },
    });
  }

  function acao(corpo: Record<string, unknown>, sucesso: (r: Record<string, unknown>) => string) {
    iniciar(async () => {
      try {
        const r = await chamar(corpo);
        setAviso({ texto: sucesso(r), erro: false });
        router.refresh();
      } catch (e) {
        setAviso({ texto: e instanceof Error ? e.message : "Não foi possível concluir.", erro: true });
      }
    });
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3 rounded-lg border border-linha p-4">
        <h2 className="font-medium">Conectar um número do app WhatsApp Business</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-suave">
          <li>No celular, o número precisa estar no app WhatsApp Business atualizado (2.24.17 ou mais novo).</li>
          <li>Clique no botão e entre com o Facebook de quem administra a empresa.</li>
          <li>Escolha <strong className="text-texto">conectar um número que já usa o app WhatsApp Business</strong> e siga o QR code no celular.</li>
        </ol>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={daShift} onChange={(e) => setDaShift(e.target.checked)} className="mt-1" />
          <span>
            É o número da própria Shift <span className="text-apagado">(o agente continua atendendo; suas respostas pelo
            app entram na conversa e pausam o agente)</span>
          </span>
        </label>
        {erroConfiguracao ? (
          <p role="alert" className="text-sm text-perigo">{erroConfiguracao}</p>
        ) : (
          <button type="button" onClick={abrirFluxo} disabled={!sdkPronto || conectando} className={`${estilos.primario} disabled:opacity-60`}>
            {conectando ? "Conectando…" : sdkPronto ? "Conectar WhatsApp Business" : "Carregando…"}
          </button>
        )}
        {aviso && <p role={aviso.erro ? "alert" : "status"} className={`text-sm ${aviso.erro ? "text-perigo" : "text-sucesso"}`}>{aviso.texto}</p>}
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Números conectados <span className="font-mono text-xs text-apagado">{iniciais.length}</span></h2>
        {iniciais.length === 0 && <p className="text-sm text-apagado">Nenhum número conectado ainda.</p>}
        {iniciais.map((c) => {
          const vencida = c.prazoSincronizarVencido;
          return (
            <article key={c.id} className="space-y-3 rounded-lg border border-linha p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">
                  {c.nomeVerificado ?? "Sem nome"} <span className="text-sm text-suave">{c.numeroExibicao ?? ""}</span>
                  {c.numeroDaShift && <span className="ml-2 rounded bg-destaque-fundo px-1.5 py-0.5 text-xs text-destaque">Número da Shift</span>}
                </p>
                <p className="text-xs text-apagado">Conectado em {quando(c.conectadaEm)} · último aviso {quando(c.ultimoEventoEm)}</p>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                {Object.keys(NOMES_AVISOS).map((campo) => (
                  <div key={campo} className="flex justify-between gap-2">
                    <dt className="text-apagado">{NOMES_AVISOS[campo]}</dt>
                    <dd className="font-mono">{c.eventos[campo] ?? 0}</dd>
                  </div>
                ))}
              </dl>

              {estados[c.id] && <p className="text-sm text-suave">{estados[c.id]}</p>}

              {c.numeroDaShift && (
                <div className="space-y-1 rounded-md bg-superficie-2 px-3 py-2 text-sm">
                  <p>Para o agente usar este número, o Easypanel (<code>crm-shift</code> → Ambiente) precisa ter:</p>
                  <pre className="overflow-x-auto font-mono text-xs">{`WHATSAPP_META_PHONE_NUMBER_ID=${c.phoneNumberId}\nWHATSAPP_META_WABA_ID=${c.wabaId}`}</pre>
                  <p className="text-xs text-apagado">
                    E o usuário do sistema da chave WHATSAPP_META_ACCESS_TOKEN precisa ter acesso a esta conta do WhatsApp
                    (Configurações da empresa → Usuários do sistema → Atribuir ativos).
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={pendente} className={estilos.secundario}
                  onClick={() => iniciar(async () => {
                    try {
                      const r = await chamar({ acao: "conferir", id: c.id });
                      const n = r.numero as { is_on_biz_app?: boolean; platform_type?: string };
                      setEstados((atual) => ({ ...atual, [c.id]: n.is_on_biz_app && n.platform_type === "CLOUD_API"
                        ? "Coexistência ativa: o número está no app e na API oficial."
                        : `Ainda não: no app = ${String(n.is_on_biz_app ?? "?")}, plataforma = ${n.platform_type ?? "?"}.` }));
                    } catch (e) {
                      setAviso({ texto: e instanceof Error ? e.message : "Não foi possível conferir.", erro: true });
                    }
                  })}>
                  Conferir estado
                </button>
                {!c.numeroDaShift && <>
                  <button type="button" disabled={pendente || !!c.sincContatosEm || vencida} className={estilos.secundario}
                    onClick={() => window.confirm("Trazer os contatos do app? Só dá para pedir uma vez.") &&
                      acao({ acao: "sincronizar", id: c.id, tipo: "contatos" }, () => "Contatos pedidos. Os avisos chegam aos poucos.")}>
                    {c.sincContatosEm ? "Contatos pedidos" : "Sincronizar contatos"}
                  </button>
                  <button type="button" disabled={pendente || !!c.sincHistoricoEm || vencida} className={estilos.secundario}
                    onClick={() => window.confirm("Trazer até 180 dias de conversas do app? Só dá para pedir uma vez.") &&
                      acao({ acao: "sincronizar", id: c.id, tipo: "historico" }, () => "Histórico pedido. Os avisos chegam aos poucos.")}>
                    {c.sincHistoricoEm ? "Histórico pedido" : "Sincronizar histórico"}
                  </button>
                </>}
              </div>
              {!c.numeroDaShift && vencida && (!c.sincContatosEm || !c.sincHistoricoEm) && (
                <p className="text-xs text-apagado">Passaram as 24 horas para sincronizar. Para isso, conecte o número de novo.</p>
              )}

              <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                acao({ acao: "enviar", id: c.id, para: String(form.get("para") ?? ""), texto: String(form.get("texto") ?? "") },
                  () => "Mensagem enviada pela API. Ela deve aparecer também no app do celular.");
              }}>
                <label className="min-w-40 flex-1 text-xs text-suave">
                  Enviar teste pela API para
                  <input name="para" required placeholder="5554999999999" inputMode="numeric" className={`${estilos.campo} mt-1`} />
                </label>
                <label className="min-w-56 flex-[2] text-xs text-suave">
                  Mensagem
                  <input name="texto" required maxLength={1000} placeholder="Teste da API oficial" className={`${estilos.campo} mt-1`} />
                </label>
                <button type="submit" disabled={pendente} className={estilos.secundario}>Enviar</button>
              </form>
              <p className="text-xs text-apagado">
                A API só manda texto livre para quem escreveu para esse número nas últimas 24 horas. Mande antes uma
                mensagem do seu celular para o número conectado.
              </p>
            </article>
          );
        })}
      </section>
    </div>
  );
}
