'use client';
import Link from 'next/link';
import {useCallback,useEffect,useState} from 'react';

interface Campanha{id:string;nome:string;midia_id:string;link:string;palavras:string[];mensagem:string;contexto:string;ativa:boolean}
interface Resposta{id:string;campanha_id:string;texto:string;mensagem:string;estado:string;erro:string|null;recebida_em:string}
interface Midia{id:string;caption:string;permalink:string}
interface Conta{usuarioId:string;nomeUsuario:string;principal:boolean;valida:boolean}
interface Dados{conta:{usuarioId:string;nomeUsuario:string;principal:boolean}|null;contas:Conta[];ativo:boolean;assinado:boolean;campanhas:Campanha[];respostas:Resposta[];midias?:Midia[]}
const botao='rounded-md border border-linha px-3 py-2 text-sm hover:bg-superficie-2 disabled:opacity-50';
const campo='mt-1 w-full rounded-md border border-linha bg-fundo px-3 py-2 text-sm';
const vazio={id:'',midiaId:'',nome:'',palavras:'QUERO',mensagem:'',contexto:''};
const estados:Record<string,string>={pendente:'Na fila',preparando:'Preparando',enviada:'DM enviada',falhou:'Falha confirmada',incerta:'Envio sem confirmação',cancelada:'Cancelada'};
export function CampanhasInstagram(){
  const [dados,setDados]=useState<Dados|null>(null),[midias,setMidias]=useState<Midia[]>([]);
  const [form,setForm]=useState(vazio),[erro,setErro]=useState(''),[aviso,setAviso]=useState(''),[ocupado,setOcupado]=useState(false);
  const [conta,setConta]=useState('');
  const carregar=useCallback(async(comMidias=false)=>{
    const q=new URLSearchParams();if(conta)q.set('conta',conta);if(comMidias)q.set('midias','sim');
    const r=await fetch(`/api/instagram/campanhas${q.size?`?${q}`:''}`,{cache:'no-store'});
    const d=await r.json();if(!r.ok)throw new Error(d.erro||'Não foi possível atualizar.');
    setDados(d);if(d.midias)setMidias(d.midias);
  },[conta]);
  useEffect(()=>{
    let vivo=true;
    const atualizar=()=>{if(document.visibilityState==='visible')void carregar().catch(e=>{if(vivo)setErro(e.message);});};
    atualizar();const timer=setInterval(atualizar,10000);
    return ()=>{vivo=false;clearInterval(timer);};
  },[carregar]);
  async function agir(corpo:unknown){
    setOcupado(true);setErro('');setAviso('');
    try{
      const r=await fetch('/api/instagram/campanhas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...(corpo as object),conta:dados?.conta?.usuarioId})});
      const d=await r.json();if(!r.ok)throw new Error(d.erro||'Não foi possível concluir.');
      await carregar();return true;
    }catch(e){setErro(e instanceof Error?e.message:'Falha de conexão.');return false;}
    finally{setOcupado(false);}
  }
  function editar(c:Campanha){setForm({id:c.id,midiaId:c.midia_id,nome:c.nome,palavras:c.palavras.join(', '),mensagem:c.mensagem,contexto:c.contexto});setAviso('Ao salvar alterações, a campanha fica pausada para você conferir e ativar.');}
  const opcoes=[...midias];
  if(form.midiaId&&!opcoes.some(m=>m.id===form.midiaId)){
    const c=dados?.campanhas.find(c=>c.id===form.id);if(c)opcoes.unshift({id:c.midia_id,caption:c.nome,permalink:c.link});
  }
  const extra=dados?.conta?!dados.conta.principal:false;
  function trocarConta(id:string){setConta(id);setMidias([]);setForm(vazio);setAviso('');setErro('');}
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-suave">Conta:</span>
      {dados?.contas.map(c=><button key={c.usuarioId} type="button" aria-pressed={dados.conta?.usuarioId===c.usuarioId} onClick={()=>trocarConta(c.usuarioId)}
        className={`${botao} ${dados.conta?.usuarioId===c.usuarioId?'border-texto':''}`}>@{c.nomeUsuario}{c.principal?' · Shift':' · fundador'}{c.valida?'':' · reconectar'}</button>)}
      <Link href="/api/instagram/conectar?conta=extra" className={botao}>Conectar perfil de fundador</Link>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-linha p-3 text-sm">
      <p>{dados?.conta?`@${dados.conta.nomeUsuario}`:'Instagram não conectado'} · {dados?.assinado?'Comentários conectados':'Conexão de comentários pendente'} · {dados?.ativo?'Automação habilitada':'Automação desligada'}</p>
      <div className="flex flex-wrap gap-2"><Link href={extra?'/api/instagram/conectar?conta=extra':'/api/instagram/conectar'} className={botao}>Autorizar comentários</Link><button disabled={ocupado||!dados?.conta} className={botao} onClick={()=>void agir({acao:'conectar'})}>Conectar comentários</button></div>
    </div>
    {extra&&<p className="text-sm text-suave">Perfil de fundador: o CRM envia só a primeira mensagem. A conversa continua com você, pelo app do Instagram. Sem IA e sem publicação por aqui.</p>}
    {!dados?.assinado&&<p className="text-sm text-suave">Autorize comentários na conexão do Instagram e assine o campo comments no webhook da Meta. Depois clique em Conectar comentários.</p>}
    {erro&&<p role="alert" className="text-sm text-perigo">{erro}</p>}{aviso&&<p role="status" className="text-sm text-suave">{aviso}</p>}
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(18rem,24rem)_1fr]">
      <form className="space-y-3 rounded-lg border border-linha p-4" onSubmit={async e=>{e.preventDefault();const ok=await agir({acao:'salvar',campanha:{...form,id:form.id||undefined,ativa:false}});if(ok){setForm(vazio);setAviso('Campanha salva e pausada. Confira a mensagem e clique em Ativar.');}}}>
        <h2 className="font-medium">{form.id?'Editar campanha':'Nova campanha'}</h2>
        <label className="block text-sm">Publicação<select required disabled={!!form.id} className={campo} value={form.midiaId} onChange={e=>setForm({...form,midiaId:e.target.value})}><option value="">Escolha a publicação</option>{opcoes.map(m=><option key={m.id} value={m.id}>{m.caption.slice(0,100)||m.permalink}</option>)}</select></label>
        <button type="button" className={botao} disabled={ocupado||!dados?.conta} onClick={()=>{setOcupado(true);void carregar(true).catch(e=>setErro(e.message)).finally(()=>setOcupado(false));}}>Carregar publicações recentes</button>
        <label className="block text-sm">Nome da campanha<input required maxLength={100} className={campo} value={form.nome} onChange={e=>setForm({...form,nome:e.target.value})} placeholder="Ex.: diagnóstico para empresas"/></label>
        <label className="block text-sm">Palavras ou frases<input required maxLength={650} className={campo} value={form.palavras} onChange={e=>setForm({...form,palavras:e.target.value})} placeholder="QUERO, EU QUERO"/></label>
        <p className="text-xs text-apagado">Separe por vírgula. Não diferencia maiúsculas ou acentos.</p>
        <label className="block text-sm">DM enviada ao comentar<textarea required rows={4} maxLength={1000} className={`${campo} resize-y`} value={form.mensagem} onChange={e=>setForm({...form,mensagem:e.target.value})} placeholder="Aqui está o material que você pediu: https://… Quer me contar o que você precisa?"/></label>
        {!extra&&<label className="block text-sm">Contexto para o agente<textarea rows={2} maxLength={1000} className={`${campo} resize-y`} value={form.contexto} onChange={e=>setForm({...form,contexto:e.target.value})} placeholder="O que a publicação oferece? Informação interna para continuar a conversa."/></label>}
        <div className="flex gap-2"><button className={botao} disabled={ocupado}>Salvar como pausada</button>{form.id&&<button className={botao} type="button" onClick={()=>{setForm(vazio);setAviso('');}}>Cancelar edição</button>}</div>
        <p className="text-xs text-apagado">Uma DM por pessoa nesta campanha enquanto o histórico for mantido (90 dias). {extra?'Quando ela responder, a conversa aparece no seu Direct.':'O agente continua quando ela responder; o comentário não abre a janela de atendimento.'}</p>
      </form>
      <div className="space-y-3"><h2 className="font-medium">Campanhas</h2>{dados?.campanhas.length===0&&<p className="text-sm text-apagado">Crie a primeira campanha para uma publicação desta conta.</p>}
        {dados?.campanhas.map(c=><article key={c.id} className="space-y-3 rounded-lg border border-linha p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{c.nome}</h3><span className={`text-xs ${c.ativa?'text-sucesso':'text-apagado'}`}>{c.ativa?'Ativa':'Pausada'}</span></div><p className="text-xs text-suave">Comentou: {c.palavras.join(' · ')}</p><p className="rounded-md bg-superficie-2 p-3 text-sm whitespace-pre-wrap break-words">{c.mensagem}</p><div className="flex flex-wrap gap-2"><a className={botao} href={c.link} target="_blank" rel="noopener noreferrer">Ver publicação ↗</a><button className={botao} disabled={ocupado} onClick={()=>editar(c)}>Editar</button><button className={botao} disabled={ocupado} onClick={()=>void agir({acao:'ativar',id:c.id,ativa:!c.ativa})}>{c.ativa?'Pausar':'Ativar'}</button></div></article>)}
      </div>
    </div>
    <section className="space-y-3"><h2 className="font-medium">Últimos envios</h2>{dados?.respostas.length===0&&<p className="text-sm text-apagado">Comentários que combinarem com uma campanha ativa aparecerão aqui.</p>}
      <ul className="divide-y divide-linha rounded-lg border border-linha">{dados?.respostas.map(r=><li className="space-y-1 p-3 text-sm" key={r.id}><div className="flex flex-wrap justify-between gap-2"><strong>{dados.campanhas.find(c=>c.id===r.campanha_id)?.nome||'Campanha'}</strong><span className="text-xs text-suave">{estados[r.estado]||r.estado} · {new Date(r.recebida_em).toLocaleString('pt-BR')}</span></div><p className="line-clamp-2 break-words text-suave">Comentário: {r.texto}</p>{r.erro&&<p className="text-xs text-perigo">{r.erro}</p>}{r.estado==='falhou'&&<button className={botao} disabled={ocupado} onClick={()=>void agir({acao:'repetir',id:r.id})}>Tentar novamente</button>}</li>)}</ul>
    </section>
  </div>;
}
