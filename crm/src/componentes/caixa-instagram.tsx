'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

interface Conversa {
  id:string; contato_id:string; modo:'agente'|'humano'; iniciada_em:string|null;
  memoria:{nome?:string;empresa?:string;resumo?:string;qualificacao?:Record<string,string>;campanha?:{nome:string;contexto:string;link:string}}; erro:string|null;
  ultima_recebida:string;
}
interface Mensagem {id:string;autor:string;texto:string;estado:string;criada_em:string}
interface Dados {
  conta:{nomeUsuario:string;valida:boolean}|null; ativo:boolean; assinado:boolean;
  conversas:Conversa[];mensagens:Mensagem[];
}
const botao='rounded-md border border-linha px-3 py-1.5 text-sm hover:bg-superficie-2 disabled:opacity-50';
export function CaixaInstagram() {
  const [dados,setDados]=useState<Dados|null>(null);
  const [id,setId]=useState('');
  const selecionado=useRef('');
  const [mensagens,setMensagens]=useState<Mensagem[]>([]);
  const [texto,setTexto]=useState('');
  const [erro,setErro]=useState('');
  const [ocupado,setOcupado]=useState(false);
  const [envioIncerto,setEnvioIncerto]=useState(false);
  const [busca,setBusca]=useState('');
  const [contexto,setContexto]=useState(false);
  const [mais,setMais]=useState(true);
  const [agora,setAgora]=useState(0);
  const idEnvio=useRef<string|null>(null);
  const fim=useRef<HTMLDivElement>(null);
  const acompanhar=useRef(true);
  const requisicao=useRef(0);
  const atualizar=useCallback(async()=>{
    const numero=++requisicao.current;
    const atual=selecionado.current;
    const r=await fetch(`/api/instagram/direct${atual?`?conversa=${atual}`:''}`,{cache:'no-store'});
    if (!r.ok) throw new Error('Não foi possível atualizar. Confira sua sessão e tente novamente.');
    const novo:Dados=await r.json();
    if (atual!==selecionado.current || numero!==requisicao.current) return;
    setDados(novo);
    setAgora(Date.now());
    if (atual) setMensagens(anteriores=>[...new Map([...anteriores,...novo.mensagens].map(m=>[m.id,m])).values()]
      .sort((a,b)=>a.criada_em.localeCompare(b.criada_em)||a.id.localeCompare(b.id)).slice(-600));
  },[]);
  useEffect(()=>{
    let vivo=true;
    const executar=()=>{if (document.visibilityState==='visible') void atualizar().catch(e=>{if(vivo)setErro(e.message);});};
    executar();
    const timer=setInterval(executar,4000);
    return ()=>{vivo=false;clearInterval(timer);};
  },[atualizar]);
  useEffect(()=>{if(acompanhar.current)fim.current?.scrollIntoView({block:'nearest'});},[mensagens]);
  function escolher(novo:string) {
    if(novo===selecionado.current)return;
    selecionado.current=novo;setId(novo);setMensagens([]);setTexto('');setErro('');setMais(true);idEnvio.current=null;setEnvioIncerto(false);
    acompanhar.current=true;
    void atualizar().catch(e=>setErro(e.message));
  }
  async function agir(corpo:Record<string,string>) {
    setOcupado(true);setErro('');
    try {
      const r=await fetch('/api/instagram/direct',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(corpo)});
      const resultado=await r.json();
      if(!r.ok){if(corpo.acao==='enviar')idEnvio.current=null;throw new Error(resultado.erro||'Não foi possível concluir.');}
      if(corpo.acao==='enviar'){setTexto('');idEnvio.current=null;setEnvioIncerto(false);acompanhar.current=true;}
      await atualizar();
    }catch(e){setEnvioIncerto(corpo.acao==='enviar'&&idEnvio.current!==null);setErro(e instanceof Error?e.message:'Falha de conexão.');}
    finally{setOcupado(false);}
  }
  async function anteriores() {
    const atual=id;
    try{
      const r=await fetch(`/api/instagram/direct?conversa=${atual}&antes=${encodeURIComponent(mensagens[0].criada_em)}`);
      if(!r.ok)throw new Error('Não foi possível carregar o histórico.');
      const novo:Dados=await r.json();
      if(atual!==selecionado.current)return;
      acompanhar.current=false;
      setMensagens(prev=>[...new Map([...novo.mensagens,...prev].map(m=>[m.id,m])).values()]);
      setMais(novo.mensagens.length===60);
    }catch(e){setErro(e instanceof Error?e.message:'Falha no histórico.');}
  }
  const conversa=dados?.conversas.find(c=>c.id===id);
  const aberta=conversa&&agora-new Date(conversa.ultima_recebida).getTime()<24*3600_000;
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <p className="text-suave">{dados?.conta?`@${dados.conta.nomeUsuario}`:'Nenhuma conta conectada'} · {dados?.ativo?'IA habilitada':'IA desligada'} · {dados?.assinado?'Direct conectado':'Direct pendente'}</p>
      <div className="flex gap-2"><Link className={botao} href="/api/instagram/conectar">Reconectar Instagram</Link>
        <button className={botao} disabled={ocupado||!dados?.conta?.valida} onClick={()=>void agir({acao:'conectar'})}>Conectar Direct</button></div>
    </div>
    {!dados?.assinado&&<p className="text-sm text-suave">Reconecte a conta para autorizar mensagens e depois clique em Conectar Direct. O webhook precisa estar configurado na Meta.</p>}
    {erro&&<p role="alert" className="text-sm text-perigo">{erro}</p>}
    <div className="grid h-[calc(100dvh-16rem)] min-h-96 grid-cols-1 overflow-hidden rounded-lg border border-linha md:grid-cols-[15rem_1fr]">
      <aside className={`${id?'hidden md:flex':'flex'} min-h-0 flex-col border-r border-linha`}>
        <input aria-label="Buscar contato" placeholder="Buscar contato" value={busca} onChange={e=>setBusca(e.target.value)} className="m-3 rounded-md border border-linha bg-fundo p-2 text-sm"/>
        <div className="min-h-0 flex-1 overflow-y-auto">{dados?.conversas.filter(c=>`${c.memoria.nome||''} ${c.memoria.empresa||''} ${c.contato_id}`.toLowerCase().includes(busca.toLowerCase())).map(c=><button key={c.id} onClick={()=>escolher(c.id)} className={`block w-full border-b border-linha p-3 text-left text-sm ${c.id===id?'bg-superficie-2':''}`}>
          <span className="block truncate font-medium">{c.memoria.nome||'Contato Instagram'}</span><span className="block truncate text-xs text-apagado">{c.memoria.empresa||`ID ${c.contato_id}`} · {c.modo==='humano'?'Humano':'IA'}</span>
        </button>)}{dados?.conversas.length===0&&<p className="p-3 text-sm text-apagado">As novas conversas aparecerão aqui.</p>}</div>
      </aside>
      <section className={`${id?'flex':'hidden md:flex'} min-h-0 min-w-0 flex-col`}>
        {conversa?<>
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-linha p-3">
            <div><button className="mr-2 text-xs md:hidden" onClick={()=>escolher('')}>← Contatos</button><strong className="text-sm">{conversa.memoria.nome||'Contato Instagram'}</strong><p className="text-xs text-apagado">{conversa.modo==='humano'?'Atendimento humano · IA pausada':'Atendimento com IA'}{!conversa.iniciada_em?' · aguardando mensagem do contato':''}</p></div>
            <div className="flex gap-2"><button className={botao} onClick={()=>setContexto(!contexto)}>Contexto</button><button className={botao} disabled={ocupado} onClick={()=>void agir({acao:'modo',id,modo:conversa.modo==='humano'?'agente':'humano'})}>{conversa.modo==='humano'?'Devolver à IA':'Assumir conversa'}</button></div>
          </header>
          {conversa.erro&&<p role="status" className="border-b border-linha p-2 text-xs text-perigo">{conversa.erro}</p>}
          {contexto&&<div className="max-h-32 overflow-y-auto border-b border-linha p-3 text-xs text-suave">{conversa.memoria.campanha&&<p className="mb-2">Origem: <a href={conversa.memoria.campanha.link} target="_blank" rel="noopener noreferrer" className="underline">{conversa.memoria.campanha.nome}</a>. {conversa.memoria.campanha.contexto}</p>}<p>{conversa.memoria.resumo||'Ainda não há resumo.'}</p>{Object.entries(conversa.memoria.qualificacao||{}).map(([k,v])=><p key={k}>{k}: {v}</p>)}</div>}
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" onScroll={e=>{const a=e.currentTarget;acompanhar.current=a.scrollHeight-a.scrollTop-a.clientHeight<80;}}>
            {mais&&mensagens.length>=60&&<button className={botao} onClick={()=>void anteriores()}>Mensagens anteriores</button>}
            {mensagens.map(m=><div key={m.id} className={`flex ${m.autor==='cliente'?'justify-start':'justify-end'}`}><div className={`max-w-[90%] rounded-lg px-3 py-2 md:max-w-[75%] ${m.autor==='cliente'?'border border-linha':'bg-superficie-2'}`}><p className="text-sm whitespace-pre-wrap break-words">{m.texto}</p><p className="mt-1 text-right text-[10px] text-apagado">{m.autor==='agente'?'IA':m.autor==='humano'?'Equipe':'Cliente'} · {new Date(m.criada_em).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})} · {m.estado}</p></div></div>)}
            <div ref={fim}/>
          </div>
          <form className="flex gap-2 border-t border-linha p-3" onSubmit={e=>{e.preventDefault();if(!texto.trim()||ocupado)return;idEnvio.current??=crypto.randomUUID();void agir({acao:'enviar',id,texto,idEnvio:idEnvio.current});}}>
            <textarea aria-label="Sua resposta" rows={2} maxLength={1000} value={texto} readOnly={envioIncerto} onChange={e=>{setTexto(e.target.value);}} disabled={ocupado||!aberta||!conversa.iniciada_em} placeholder={aberta?'Escreva sua resposta…':'Aguarde uma nova mensagem do contato para responder.'} className="min-w-0 flex-1 resize-none rounded-md border border-linha bg-fundo px-3 py-2 text-sm"/>
            <button className={botao} disabled={ocupado||!texto.trim()||!aberta||!conversa.iniciada_em}>Enviar</button>
          </form>
        </>:<p className="m-auto p-4 text-sm text-apagado">Selecione uma conversa do Instagram.</p>}
      </section>
    </div>
  </div>;
}
