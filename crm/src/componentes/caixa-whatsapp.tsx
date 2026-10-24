"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { excluirLead, mudarModoWhatsApp, responderWhatsApp } from '@/app/acoes';
import type { ConversaWhatsApp, MensagemConversa } from '@/lib/leads';
import { avisoDeExclusao } from '@/lib/rotulos-leads';
import { ReabrirComModelo, type ModeloAprovado } from './reabrir-com-modelo';

const hora = (valor: Date) => new Date(valor).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const data = (valor: Date) => new Date(valor).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' });
const botao = 'rounded-md border border-linha-forte px-2.5 py-1.5 text-xs hover:bg-superficie-2 disabled:opacity-50';
const estados: Record<string, string> = { recebido: 'Recebida', pendente: 'Aguardando confirmação', enviado: 'Enviada', entregue: 'Entregue', lido: 'Lida', erro: 'Envio não confirmado' };

export function CaixaWhatsApp({ iniciais, agenteAtivo, modelos = [], erroModelos }: {
  iniciais: ConversaWhatsApp[]; agenteAtivo: boolean; modelos?: ModeloAprovado[]; erroModelos?: string;
}) {
  const router = useRouter();
  const [agora, setAgora] = useState(0);
  const [conversas, setConversas] = useState(iniciais);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<MensagemConversa[]>([]);
  const [busca, setBusca] = useState('');
  const [soHumanas, setSoHumanas] = useState(false);
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState('');
  const [mostrarContexto, setMostrarContexto] = useState(false);
  const [erro, setErro] = useState('');
  const [exclusao, setExclusao] = useState<{ texto: string; erro: boolean } | null>(null);
  const [conexao, setConexao] = useState('Atualizando…');
  const [carregando, setCarregando] = useState(false);
  const [temAnteriores, setTemAnteriores] = useState(false);
  const [pendente, iniciar] = useTransition();
  const pedidos = useRef<Record<string, string>>({});
  const rolagem = useRef<HTMLDivElement>(null);
  const campoResposta = useRef<HTMLTextAreaElement>(null);
  const noFim = useRef(true);
  const contatoAtual = useRef<string | null>(null);
  const requisicao = useRef(0);
  const historicoCarregado = useRef(false);
  const contato = conversas.find(c => c.leadId === selecionada);
  const idade = contato?.ultimaRecebidaEm ? agora - new Date(contato.ultimaRecebidaEm).getTime() : Infinity;
  const podeResponder = idade >= -60_000 && idade < 86_400_000;
  const filtradas = conversas.filter(c => (!soHumanas || c.modo === 'humano') &&
    `${c.nome} ${c.empresa ?? ''} ${c.whatsapp}`.toLocaleLowerCase('pt-BR').includes(busca.toLocaleLowerCase('pt-BR')));

  const atualizar = useCallback(async (signal?: AbortSignal) => {
    const numero = ++requisicao.current;
    try {
      const resposta = await fetch(`/api/whatsapp/conversas${selecionada ? `?lead=${selecionada}` : ''}`, { cache: 'no-store', signal });
      if (resposta.status === 401) { router.push('/entrar'); return; }
      if (!resposta.ok) throw new Error('Falha');
      const caixa: { conversas: ConversaWhatsApp[]; mensagens: MensagemConversa[] } = await resposta.json();
      if (signal?.aborted || selecionada !== contatoAtual.current || numero !== requisicao.current) return;
      setConversas(caixa.conversas);
      setAgora(Date.now());
      setMensagens(anteriores => {
        const novas = new Map(caixa.mensagens.map(m => [m.id, m]));
        // Mantém o histórico carregado ao buscar novas mensagens.
        return [...anteriores.filter(m => !novas.has(m.id)), ...caixa.mensagens]
          .sort((a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime() || a.id.localeCompare(b.id));
      });
      if (!historicoCarregado.current) setTemAnteriores(caixa.mensagens.length === 100);
      setConexao('Atualizado agora');
      requestAnimationFrame(() => { if (noFim.current && rolagem.current) rolagem.current.scrollTop = rolagem.current.scrollHeight; });
    } catch {
      if (!signal?.aborted) setConexao('Conexão interrompida · tentando novamente');
    } finally { if (!signal?.aborted) setCarregando(false); }
  }, [selecionada, router]);

  useEffect(() => {
    const controle = new AbortController();
    const primeira = setTimeout(() => { void atualizar(controle.signal); }, 0);
    const timer = setInterval(() => { if (!document.hidden) void atualizar(controle.signal); }, 4000);
    return () => { controle.abort(); clearTimeout(primeira); clearInterval(timer); };
  }, [atualizar]);

  useEffect(() => {
    const campo = campoResposta.current;
    if (!campo) return;
    campo.style.height = 'auto';
    campo.style.height = `${Math.min(campo.scrollHeight + 2, 96)}px`;
  }, [rascunhos, selecionada]);

  function abrir(id: string | null) {
    contatoAtual.current = id; historicoCarregado.current = false;
    setSelecionada(id); setMensagens([]); setErro(''); setAviso(''); setExclusao(null); setCarregando(!!id);
    setMostrarContexto(false);
    setTemAnteriores(false); noFim.current = true;
  }

  async function anteriores() {
    if (!selecionada || !mensagens[0]) return;
    setCarregando(true);
    noFim.current = false;
    const id = selecionada;
    const elemento = rolagem.current;
    const altura = elemento?.scrollHeight ?? 0;
    const posicao = elemento?.scrollTop ?? 0;
    try {
      const r = await fetch(`/api/whatsapp/conversas?lead=${selecionada}&antes=${encodeURIComponent(mensagens[0].id)}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('Falha');
      const caixa: { mensagens: MensagemConversa[] } = await r.json();
      if (contatoAtual.current !== id) return;
      historicoCarregado.current = true;
      setMensagens(atual => [...caixa.mensagens.filter(m => !atual.some(a => a.id === m.id)), ...atual]);
      setTemAnteriores(caixa.mensagens.length === 100);
      requestAnimationFrame(() => { if (elemento) elemento.scrollTop = posicao + elemento.scrollHeight - altura; });
    } catch { setErro('Não foi possível carregar mensagens anteriores.'); }
    finally { if (contatoAtual.current === id) setCarregando(false); }
  }

  function alternarModo() {
    if (!contato) return;
    iniciar(async () => {
      const modo = contato.modo === 'agente' ? 'humano' : 'agente';
      const resultado = await mudarModoWhatsApp(contato.leadId, modo);
      setErro(resultado?.erro ?? '');
      if (!resultado?.erro) setAviso(modo === 'humano' ? 'Você assumiu esta conversa.' : 'O agente responderá à próxima mensagem do cliente.');
      await atualizar();
    });
  }

  function excluir() {
    if (!contato || !window.confirm(avisoDeExclusao(contato.nome))) return;
    const id = contato.leadId;
    iniciar(async () => {
      const resultado = await excluirLead(id);
      if (resultado?.erro) { setExclusao({ texto: resultado.erro, erro: true }); return; }
      abrir(null);
      setConversas(atual => atual.filter(c => c.leadId !== id));
      setExclusao({ texto: resultado?.ok ?? 'Lead excluído.', erro: false });
    });
  }

  function enviar() {
    if (!contato) return;
    const id = contato.leadId;
    const form = new FormData();
    pedidos.current[id] ??= crypto.randomUUID();
    form.set('leadId', id); form.set('pedidoId', pedidos.current[id]); form.set('texto', rascunhos[id] ?? '');
    iniciar(async () => {
      try {
        const resultado = await responderWhatsApp(undefined, form);
        setErro(resultado?.erro ?? ''); setAviso(resultado?.ok ?? '');
        if (resultado?.ok) { setRascunhos(atual => ({ ...atual, [id]: '' })); delete pedidos.current[id]; }
        noFim.current = true;
        await atualizar();
      } catch { setErro('O envio não foi confirmado. Confira o histórico antes de repetir.'); }
    });
  }

  return <div data-caixa-whatsapp className="flex h-[calc(100dvh-81px)] min-h-0 flex-col">
    <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
      <h1 className="text-lg font-semibold tracking-tight">WhatsApp</h1>
      <span className="flex items-center gap-3"><Link href="/whatsapp/modelos" className="text-[11px] text-suave hover:text-texto">Modelos</Link><span className="text-[11px] text-apagado" role="status">{conexao}</span></span>
    </div>
    {!agenteAtivo && <p className="mb-2 shrink-0 text-xs text-destaque">Agente desligado · atendimento manual disponível</p>}
    {exclusao && <p role={exclusao.erro ? 'alert' : 'status'} className={`mb-2 shrink-0 text-xs ${exclusao.erro ? 'text-perigo' : 'text-sucesso'}`}>{exclusao.texto}</p>}
    <div className="grid min-h-0 grid-cols-1 flex-1 overflow-hidden rounded-xl border border-linha bg-superficie lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className={`${selecionada ? 'hidden lg:flex' : 'flex'} min-h-0 min-w-0 flex-col border-r border-linha`}>
        <div className="space-y-2 border-b border-linha p-3">
          <label className="sr-only" htmlFor="buscar-conversa">Buscar conversa</label>
          <input id="buscar-conversa" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar contato" className="w-full rounded-md border border-linha-forte bg-fundo px-2.5 py-2 text-sm" />
          <button onClick={() => setSoHumanas(!soHumanas)} aria-pressed={soHumanas} className={`text-xs ${soHumanas ? 'text-destaque' : 'text-suave'}`}>Atendimento humano · {conversas.filter(c => c.modo === 'humano').length}</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {filtradas.map(c => <button key={c.leadId} onClick={() => abrir(c.leadId)} aria-current={selecionada === c.leadId ? 'true' : undefined}
            className={`flex w-full gap-2 border-b border-linha px-3 py-2.5 text-left transition-colors hover:bg-superficie-2 ${selecionada === c.leadId ? 'bg-superficie-2' : ''}`}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fundo text-sm text-destaque">{c.nome.slice(0, 1).toUpperCase()}</span>
            <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><strong className="truncate text-sm font-medium">{c.nome}</strong><span className="shrink-0 text-[11px] text-apagado">{c.ultimaEm ? hora(c.ultimaEm) : ''}</span></span>
              <span className="mt-0.5 block truncate text-xs text-suave">{c.empresa ?? `+${c.whatsapp}`}</span>
              <span className="mt-1 block truncate text-xs text-apagado">{c.ultimaMensagem ?? 'Histórico começa com as próximas mensagens'}</span>
              <span className={`mt-1 block text-[10px] ${c.modo === 'humano' ? 'text-destaque' : 'text-sucesso'}`}>{c.modo === 'humano' ? '● Humano' : '● Agente'}</span>
            </span>
          </button>)}
          {filtradas.length === 0 && <p className="p-6 text-sm text-apagado">{conversas.length ? 'Nenhuma conversa encontrada.' : 'As conversas aparecem aqui depois que o contato autoriza o atendimento.'}</p>}
        </div>
      </aside>
      <section aria-label="Conversa" className={`${selecionada ? 'flex' : 'hidden lg:flex'} min-h-0 min-w-0 flex-col bg-fundo/40`}>
        {contato ? <>
          <header className="flex shrink-0 items-center justify-between gap-2 border-b border-linha px-3 py-2">
            <div className="flex min-w-0 items-center gap-2"><button onClick={() => abrir(null)} className={`${botao} lg:hidden`} aria-label="Voltar às conversas">←</button>
              <div className="min-w-0"><h2 className="truncate text-sm font-semibold">{contato.nome}</h2><p className="truncate text-[11px] text-suave">{contato.empresa ? `${contato.empresa} · ` : ''}+{contato.whatsapp}</p></div></div>
            <div className="flex shrink-0 items-center gap-2"><Link href="/leads" className="hidden text-xs text-suave hover:text-texto sm:inline">Ver leads</Link>
              <button disabled={pendente} onClick={excluir} className={`${botao} text-perigo`}>Excluir</button>
              <button disabled={pendente} onClick={alternarModo} className={botao}>{contato.modo === 'agente' ? 'Assumir' : 'Devolver à IA'}</button></div>
          </header>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-linha px-3 py-1.5 text-[11px] text-suave">
            <span>{contato.modo === 'humano' ? 'Humano · IA pausada' : 'IA atendendo · enviar assume a conversa'}</span>
            {contato.resumo && <button onClick={() => setMostrarContexto(!mostrarContexto)} aria-expanded={mostrarContexto} aria-controls="contexto-whatsapp" className="text-apagado hover:text-texto">Contexto do cliente</button>}
          </div>
          {mostrarContexto && <p id="contexto-whatsapp" className="max-h-20 shrink-0 overflow-y-auto border-b border-linha bg-superficie px-3 py-2 text-xs leading-5 text-suave">{contato.resumo}</p>}
          <div ref={rolagem} onScroll={() => { const e = rolagem.current; if (e) noFim.current = e.scrollHeight - e.scrollTop - e.clientHeight < 100; }} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
            {temAnteriores && <div className="text-center"><button disabled={carregando} onClick={anteriores} className={botao}>Carregar anteriores</button></div>}
            {mensagens.length === 0 && <p className="py-12 text-center text-sm text-apagado">{carregando ? 'Carregando conversa…' : 'As novas mensagens recebidas serão registradas aqui. O histórico anterior recebido não está disponível.'}</p>}
            {mensagens.map((m, i) => <div key={m.id}>
              {(i === 0 || data(m.criadoEm) !== data(mensagens[i - 1].criadoEm)) && <p className="my-2 text-center text-[10px] text-apagado">{data(m.criadoEm)}</p>}
              <div className={`flex ${m.autor === 'cliente' ? 'justify-start' : 'justify-end'}`}>
                <div className={`w-fit max-w-[90%] rounded-lg px-3 py-1.5 sm:max-w-[min(75%,36rem)] ${m.autor === 'cliente' ? 'rounded-tl-sm border border-linha bg-superficie' : 'rounded-tr-sm bg-superficie-2'}`}>
                  <p className="whitespace-pre-wrap break-words text-[13px] leading-5 [overflow-wrap:anywhere]">{m.texto}</p>
                  {m.tipo !== 'text' && <p className="mt-1 text-[11px] text-apagado">Arquivo ainda não disponível para abrir.</p>}
                  <p className={`mt-0.5 text-right text-[10px] leading-3 ${m.estado === 'erro' ? 'text-perigo' : 'text-apagado'}`}>{m.autor === 'agente' ? 'IA · ' : m.autor === 'humano' ? 'Você · ' : ''}{hora(m.criadoEm)}{m.autor !== 'cliente' ? ` · ${estados[m.estado] ?? m.estado}` : ''}</p>
                </div>
              </div>
            </div>)}
          </div>
          {/* Janela fechada: só modelo aprovado. Antes do primeiro carregamento (agora = 0) não há como saber. */}
          {agora > 0 && !podeResponder ? <ReabrirComModelo key={contato.leadId} leadId={contato.leadId} nomeContato={contato.nome} modelos={modelos} erroModelos={erroModelos} />
          : <form onSubmit={e => { e.preventDefault(); enviar(); }} className="shrink-0 border-t border-linha bg-superficie px-3 py-2">
            <label htmlFor="resposta-whatsapp" className="sr-only">Sua mensagem</label>
            <div className="flex items-end gap-2"><textarea ref={campoResposta} id="resposta-whatsapp" required maxLength={4000} rows={1} disabled={!podeResponder || pendente} value={rascunhos[contato.leadId] ?? ''}
              onChange={e => { setRascunhos({ ...rascunhos, [contato.leadId]: e.target.value }); delete pedidos.current[contato.leadId]; }}
              placeholder="Escreva sua resposta…" className="max-h-24 min-h-9 min-w-0 flex-1 resize-none overflow-y-auto rounded-md border border-linha-forte bg-fundo px-2.5 py-2 text-[13px] leading-5 disabled:opacity-50" />
              <button type="submit" disabled={!podeResponder || pendente || !(rascunhos[contato.leadId] ?? '').trim()} className="h-9 rounded-md bg-destaque px-3 text-xs font-semibold text-fundo hover:bg-destaque-forte disabled:opacity-50">{pendente ? 'Aguarde…' : 'Enviar'}</button></div>
            {erro && <p role="alert" className="mt-1.5 text-xs text-perigo">{erro}</p>}
            {aviso && <p role="status" className="mt-1.5 max-h-20 overflow-y-auto text-xs text-sucesso">{aviso}</p>}
          </form>}
        </> : <div className="m-auto max-w-sm p-8 text-center"><span className="text-4xl text-destaque">↗</span><h2 className="mt-4 text-xl font-medium">Uma conversa de cada vez</h2><p className="mt-3 text-sm leading-relaxed text-suave">Escolha um contato para acompanhar o histórico, responder ou assumir o atendimento.</p></div>}
      </section>
    </div>
    <p className="mt-1.5 shrink-0 text-[10px] text-apagado">Histórico de até 90 dias · recebidas anteriores ao painel não estão disponíveis.</p>
  </div>;
}
