/* AUTO-GENERATED from sections.jsx — edit the .jsx then run "node build.js" */
(function () {
/* Shift Systems · sections */

const {
  MarkA,
  Wordmark,
  Section,
  PrimaryBtn,
  GhostBtn,
  Icon,
  useSpotlight,
  Counter,
  Typed
} = window;

// =====================================================================
// HEADER
// =====================================================================
function Header() {
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', on, {
      passive: true
    });
    return () => window.removeEventListener('scroll', on);
  }, []);
  const nav = [{
    id: 'inicio',
    label: 'início'
  }, {
    id: 'solucoes',
    label: 'soluções'
  }, {
    id: 'ideias',
    label: 'ideias'
  }, {
    id: 'diagnostico',
    label: 'diagnóstico'
  }, {
    id: 'contato',
    label: 'contato'
  }];
  return /*#__PURE__*/React.createElement("header", {
    className: `fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? 'pt-3' : 'pt-5'}`
  }, /*#__PURE__*/React.createElement("div", {
    className: `mx-auto px-3 transition-all duration-300 ${scrolled ? 'max-w-5xl' : 'max-w-7xl'}`
  }, /*#__PURE__*/React.createElement("div", {
    className: `flex items-center justify-between transition-all duration-300 relative
          ${scrolled ? 'bg-[#0b0b10]/85 border border-white/[0.08] backdrop-blur-2xl rounded-full pl-5 pr-2 py-2 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.6)]' : 'py-2'}`,
    style: scrolled ? {
      boxShadow: '0 8px 40px -12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)'
    } : {}
  }, /*#__PURE__*/React.createElement("a", {
    href: "#inicio",
    className: "flex items-center gap-3 group"
  }, /*#__PURE__*/React.createElement(MarkA, {
    size: 24,
    animate: true
  }), /*#__PURE__*/React.createElement("span", {
    className: "font-sans font-semibold tracking-tight text-base leading-none hidden sm:flex items-baseline"
  }, /*#__PURE__*/React.createElement("span", null, "Shift"), /*#__PURE__*/React.createElement("span", {
    className: "text-purple"
  }, "."), /*#__PURE__*/React.createElement("span", {
    className: "ml-1.5 font-mono font-normal text-[10px] tracking-[0.32em] uppercase text-white/45 translate-y-[-1px]"
  }, "Systems"))), /*#__PURE__*/React.createElement("nav", {
    className: "hidden lg:flex items-center gap-1 absolute left-1/2 -translate-x-1/2"
  }, nav.map(n => /*#__PURE__*/React.createElement("a", {
    key: n.id,
    href: `#${n.id}`,
    className: "text-sm text-white/65 hover:text-white px-3.5 py-2 rounded-full hover:bg-white/[0.04] transition-colors"
  }, n.label))), /*#__PURE__*/React.createElement("a", {
    href: "#contato",
    "data-magnetic": "0.3",
    className: "hidden sm:inline-flex items-center gap-2 btn-primary rounded-full px-5 py-2.5 text-xs font-semibold tracking-tight"
  }, "automatizar minha empresa", /*#__PURE__*/React.createElement(Icon.Arrow, {
    s: 14
  })), /*#__PURE__*/React.createElement("a", {
    href: "#contato",
    className: "sm:hidden btn-primary rounded-full px-4 py-2 text-xs font-semibold"
  }, "começar"))));
}

// =====================================================================
// HERO
// =====================================================================
function Hero() {
  return /*#__PURE__*/React.createElement("section", {
    id: "inicio",
    className: "relative pt-32 sm:pt-40 md:pt-48 pb-20 md:pb-32 px-6 md:px-12 lg:px-20 overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid-overlay"
  }), /*#__PURE__*/React.createElement("div", {
    className: "noise"
  }), /*#__PURE__*/React.createElement("div", {
    className: "absolute inset-0 pointer-events-none"
  }, /*#__PURE__*/React.createElement("div", {
    className: "scan-line",
    style: {
      left: '20%',
      animationDelay: '0s'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "scan-line",
    style: {
      left: '55%',
      animationDelay: '3s'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "scan-line",
    style: {
      left: '82%',
      animationDelay: '5.5s'
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "max-w-7xl mx-auto relative"
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid lg:grid-cols-12 gap-12 lg:gap-16 items-start"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lg:col-span-7"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3 mb-10"
  }, /*#__PURE__*/React.createElement("span", {
    className: "relative flex h-2 w-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "animate-ping absolute inline-flex h-full w-full rounded-full bg-purple opacity-75"
  }), /*#__PURE__*/React.createElement("span", {
    className: "relative inline-flex rounded-full h-2 w-2 bg-purple"
  })), /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "Shift / Systems · 2026")), /*#__PURE__*/React.createElement("h1", {
    className: "display text-[44px] sm:text-6xl md:text-7xl lg:text-[88px] build"
  }, "empresas lentas", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    className: "text-white/45"
  }, "perdem"), " ", /*#__PURE__*/React.createElement("span", {
    className: "text-purple",
    style: {
      textShadow: '0 0 32px rgba(181,107,255,0.45)'
    }
  }, "dinheiro", /*#__PURE__*/React.createElement("span", {
    className: "text-purple"
  }, "."))), /*#__PURE__*/React.createElement("p", {
    className: "mt-10 text-xl md:text-2xl text-white/75 max-w-2xl leading-relaxed"
  }, "sistemas sob medida, automações e inteligência artificial para empresas que cansaram de operar no improviso."), /*#__PURE__*/React.createElement("p", {
    className: "mt-6 text-base md:text-lg text-white/55 max-w-2xl leading-relaxed"
  }, "transformamos processos manuais, atendimento desorganizado e tarefas repetitivas em tecnologia que trabalha por você — sem planilha remendada, sem gambiarra eterna, sem sistema engessado."), /*#__PURE__*/React.createElement("div", {
    className: "mt-10 md:mt-12 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 sm:gap-4"
  }, /*#__PURE__*/React.createElement("a", {
    href: "#contato",
    "data-magnetic": "0.25",
    className: "w-full sm:w-auto"
  }, /*#__PURE__*/React.createElement(PrimaryBtn, {
    className: "text-base px-8 py-4 w-full inline-flex items-center justify-center gap-2"
  }, "quero acelerar meu negócio ", /*#__PURE__*/React.createElement(Icon.Arrow, {
    s: 16
  }))), /*#__PURE__*/React.createElement("a", {
    href: "#solucoes",
    className: "w-full sm:w-auto"
  }, /*#__PURE__*/React.createElement(GhostBtn, {
    className: "text-base px-8 py-4 w-full"
  }, "ver soluções"))), /*#__PURE__*/React.createElement("div", {
    className: "mt-12 md:mt-16 flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-x-6 gap-y-3 text-[10px] md:text-xs font-mono text-white/40 tracking-[0.18em] uppercase"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "w-1.5 h-1.5 rounded-full bg-purple"
  }), "tempo médio · 2-6 semanas"), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "w-1.5 h-1.5 rounded-full bg-purple"
  }), "stack sob medida"), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "w-1.5 h-1.5 rounded-full bg-cyan-300"
  }), "diagnóstico sem escopo pronto"))), /*#__PURE__*/React.createElement("div", {
    "data-parallax": "-12",
    className: "lg:col-span-5 relative mt-16 lg:mt-0"
  }, /*#__PURE__*/React.createElement(HeroVisual, null)))));
}

// Floating "system graph" visual — responsive: stack on mobile, floating on desktop
function HeroVisual() {
  // Live-ish dashboard bars that periodically shift
  const [bars, setBars] = React.useState([40, 60, 35, 75, 55, 90, 80]);
  React.useEffect(() => {
    const id = setInterval(() => {
      setBars(b => b.map(v => Math.max(25, Math.min(98, v + (Math.random() * 30 - 15)))));
    }, 1600);
    return () => clearInterval(id);
  }, []);

  // Engine progress that fills + cycles
  const [prog, setProg] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setProg(p => (p + 1) % 13), 280);
    return () => clearInterval(id);
  }, []);

  // Conversation counter that ticks up
  const [convos, setConvos] = React.useState(124);
  React.useEffect(() => {
    const id = setInterval(() => setConvos(c => c + Math.floor(Math.random() * 3)), 2200);
    return () => clearInterval(id);
  }, []);

  // ------- reusable card pieces -------
  const NodeEntrada = /*#__PURE__*/React.createElement("div", {
    className: "glass rounded-2xl p-4 w-full"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] font-mono tracking-[0.2em] uppercase text-white/50"
  }, "entrada"), /*#__PURE__*/React.createElement("span", {
    className: "relative flex h-2 w-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "animate-ping absolute inline-flex h-full w-full rounded-full bg-purple opacity-75"
  }), /*#__PURE__*/React.createElement("span", {
    className: "relative inline-flex rounded-full h-2 w-2 bg-purple ring-glow"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "mt-2 font-medium"
  }, "atendimento WhatsApp"), /*#__PURE__*/React.createElement("div", {
    className: "mt-3 text-xs text-white/55 font-mono"
  }, "+", convos, " conversas / dia"));
  const NodeEngine = /*#__PURE__*/React.createElement("div", {
    className: "glass-strong rounded-3xl p-6 w-full grad-border",
    style: {
      borderRadius: '1.5rem'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3 mb-3"
  }, /*#__PURE__*/React.createElement(MarkA, {
    size: 28,
    animate: true
  }), /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] font-mono tracking-[0.2em] uppercase text-purple"
  }, "núcleo")), /*#__PURE__*/React.createElement("div", {
    className: "font-semibold text-lg leading-tight"
  }, "Shift Engine"), /*#__PURE__*/React.createElement("div", {
    className: "mt-2 text-xs text-white/55"
  }, "orquestra processos, rotas e IA em um único sistema."), /*#__PURE__*/React.createElement("div", {
    className: "mt-4 grid grid-cols-12 gap-1.5"
  }, Array.from({
    length: 12
  }).map((_, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "h-1 rounded-full transition-all duration-300",
    style: {
      background: i < prog ? '#B56BFF' : 'rgba(255,255,255,0.1)',
      boxShadow: i === prog - 1 ? '0 0 10px rgba(181,107,255,0.8)' : 'none'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "mt-3 flex items-center justify-between text-[10px] font-mono text-white/45"
  }, /*#__PURE__*/React.createElement("span", null, "processando"), /*#__PURE__*/React.createElement("span", {
    className: "text-purple"
  }, Math.round(prog / 12 * 100), "%")));
  const NodeDashboard = /*#__PURE__*/React.createElement("div", {
    className: "glass rounded-2xl p-4 w-full"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] font-mono tracking-[0.2em] uppercase text-white/50"
  }, "saída"), /*#__PURE__*/React.createElement(Icon.Bars, {
    s: 16
  })), /*#__PURE__*/React.createElement("div", {
    className: "mt-2 font-medium"
  }, "dashboard"), /*#__PURE__*/React.createElement("div", {
    className: "mt-3 flex items-end gap-1 h-12"
  }, bars.map((h, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "flex-1 rounded-sm transition-all duration-700 ease-out",
    style: {
      height: `${h}%`,
      background: i === bars.length - 1 ? '#B56BFF' : i > 4 ? 'rgba(181,107,255,0.7)' : 'rgba(255,255,255,0.18)',
      boxShadow: i > 4 ? '0 0 8px rgba(181,107,255,0.3)' : 'none'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "mt-2 flex items-center gap-1.5 text-[10px] font-mono text-purple"
  }, /*#__PURE__*/React.createElement("span", null, "▲"), /*#__PURE__*/React.createElement("span", null, "+", (bars[6] - 40).toFixed(0), "%"), " ", /*#__PURE__*/React.createElement("span", {
    className: "text-white/40"
  }, "vs ontem")));
  const NodeActivity = /*#__PURE__*/React.createElement("div", {
    className: "glass rounded-2xl p-4 w-full overflow-hidden h-32"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between mb-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] font-mono tracking-[0.2em] uppercase text-white/50"
  }, "activity"), /*#__PURE__*/React.createElement("span", {
    className: "w-1.5 h-1.5 rounded-full bg-purple animate-pulse"
  })), /*#__PURE__*/React.createElement("div", {
    className: "relative h-20 overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "scroll-up font-mono text-[10px] text-white/55 leading-relaxed"
  }, [['agente-vendas', 'lead qualificado · contato#a4f'], ['automação', 'invoice #2918 gerada'], ['webhook', 'CRM atualizado · 200 OK'], ['agente-suporte', 'conversa encerrada em 1m12s'], ['integração', 'whatsapp ←→ erp sync'], ['dashboard', 'KPI semanal recomputado'], ['agente-vendas', 'lead qualificado · contato#a4f'], ['automação', 'invoice #2918 gerada'], ['webhook', 'CRM atualizado · 200 OK'], ['agente-suporte', 'conversa encerrada em 1m12s'], ['integração', 'whatsapp ←→ erp sync'], ['dashboard', 'KPI semanal recomputado']].map(([k, v], i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "flex gap-2 py-0.5"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-purple/80 shrink-0"
  }, k), /*#__PURE__*/React.createElement("span", {
    className: "text-white/30"
  }, "→"), /*#__PURE__*/React.createElement("span", {
    className: "truncate"
  }, v))))));
  return /*#__PURE__*/React.createElement("div", {
    className: "relative w-full"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lg:hidden relative"
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute inset-0 pointer-events-none -z-0"
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute top-10 right-0 w-64 h-64 rounded-full aurora",
    style: {
      background: 'radial-gradient(circle, rgba(181,107,255,0.28), transparent 65%)',
      filter: 'blur(40px)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "relative grid grid-cols-2 gap-3 max-w-md mx-auto"
  }, /*#__PURE__*/React.createElement("div", {
    className: "col-span-2 floaty"
  }, NodeEngine), /*#__PURE__*/React.createElement("div", {
    className: "floaty",
    style: {
      animationDelay: '1s'
    }
  }, NodeEntrada), /*#__PURE__*/React.createElement("div", {
    className: "floaty",
    style: {
      animationDelay: '2s'
    }
  }, NodeDashboard), /*#__PURE__*/React.createElement("div", {
    className: "col-span-2 floaty",
    style: {
      animationDelay: '3s'
    }
  }, NodeActivity))), /*#__PURE__*/React.createElement("div", {
    className: "hidden lg:block relative w-full",
    style: {
      height: 620
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute inset-0 pointer-events-none"
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute top-[10%] right-[5%] w-80 h-80 rounded-full aurora",
    style: {
      background: 'radial-gradient(circle, rgba(181,107,255,0.35), transparent 65%)',
      filter: 'blur(40px)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "absolute bottom-[5%] left-[5%] w-72 h-72 rounded-full aurora",
    style: {
      background: 'radial-gradient(circle, rgba(138,77,204,0.25), transparent 65%)',
      filter: 'blur(40px)',
      animationDelay: '2s'
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0 h-0 pointer-events-none"
  }, /*#__PURE__*/React.createElement("span", {
    className: "absolute orbit block w-1.5 h-1.5 rounded-full bg-purple ring-glow"
  }), /*#__PURE__*/React.createElement("span", {
    className: "absolute orbit r2 block w-1 h-1 rounded-full bg-white/70",
    style: {
      animationDelay: '-6s'
    }
  })), /*#__PURE__*/React.createElement("svg", {
    className: "absolute inset-0 w-full h-full",
    viewBox: "0 0 400 620",
    fill: "none",
    preserveAspectRatio: "none"
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: "line-grad",
    x1: "0",
    x2: "1"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0%",
    stopColor: "#B56BFF",
    stopOpacity: "0"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "50%",
    stopColor: "#B56BFF",
    stopOpacity: "0.7"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "100%",
    stopColor: "#B56BFF",
    stopOpacity: "0"
  }))), /*#__PURE__*/React.createElement("path", {
    d: "M70 70 C 200 70, 220 240, 340 240",
    stroke: "url(#line-grad)",
    strokeWidth: "1",
    strokeDasharray: "4 6"
  }, /*#__PURE__*/React.createElement("animate", {
    attributeName: "stroke-dashoffset",
    from: "0",
    to: "-40",
    dur: "2s",
    repeatCount: "indefinite"
  })), /*#__PURE__*/React.createElement("path", {
    d: "M340 240 C 240 240, 180 460, 80 460",
    stroke: "url(#line-grad)",
    strokeWidth: "1",
    strokeDasharray: "4 6"
  }, /*#__PURE__*/React.createElement("animate", {
    attributeName: "stroke-dashoffset",
    from: "0",
    to: "-40",
    dur: "2.4s",
    repeatCount: "indefinite"
  })), /*#__PURE__*/React.createElement("path", {
    d: "M70 70 C 60 240, 60 360, 80 460",
    stroke: "url(#line-grad)",
    strokeWidth: "1",
    strokeDasharray: "4 6"
  }, /*#__PURE__*/React.createElement("animate", {
    attributeName: "stroke-dashoffset",
    from: "0",
    to: "-40",
    dur: "2.8s",
    repeatCount: "indefinite"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "absolute top-0 left-0 w-[58%] floaty",
    style: {
      animationDelay: '0s'
    }
  }, NodeEntrada), /*#__PURE__*/React.createElement("div", {
    className: "absolute top-[34%] right-0 w-[72%] floaty",
    style: {
      animationDelay: '1.2s'
    }
  }, NodeEngine), /*#__PURE__*/React.createElement("div", {
    className: "absolute bottom-[18%] left-0 w-[55%] floaty",
    style: {
      animationDelay: '2.4s'
    }
  }, NodeDashboard), /*#__PURE__*/React.createElement("div", {
    className: "absolute bottom-0 right-0 w-[62%] floaty",
    style: {
      animationDelay: '3.2s'
    }
  }, NodeActivity)));
}

// =====================================================================
// MARQUEE STRIP — running tech ticker between sections
// =====================================================================
function MarqueeStrip() {
  const items = ['sistemas sob medida', 'sites de alta conversão', 'landing pages com tracking', 'agentes de ia', 'whatsapp api', 'n8n · automações', 'dashboards em tempo real', 'crm · erp · webhooks', 'postgres · supabase', 'next.js · fastapi', 'integrações sob medida', 'openai · anthropic · grok'];
  return /*#__PURE__*/React.createElement("div", {
    className: "relative py-10 border-y border-white/8 bg-gradient-to-b from-black/40 via-transparent to-black/40 marquee-wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "marquee marquee-slow"
  }, [...items, ...items].map((t, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "flex items-center gap-6 shrink-0"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-sans font-semibold text-2xl md:text-3xl tracking-tight text-white/65 hover:text-purple transition"
  }, t), /*#__PURE__*/React.createElement(MarkA, {
    size: 18,
    glow: false,
    className: "opacity-50"
  })))));
}

// =====================================================================
// PROVOCATIVE
// =====================================================================
function Provocative() {
  const cards = [{
    tag: '01',
    icon: /*#__PURE__*/React.createElement(Icon.Alert, null),
    title: 'atendimento perdido',
    body: 'leads esquecidos no WhatsApp, mensagens sem resposta, clientes indo embora antes de você notar.',
    stat: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Counter, {
      to: 40
    }), "%", /*#__PURE__*/React.createElement("span", {
      className: "text-white/40 ml-2 font-normal text-base"
    }, "dos leads")),
    stat_sub: 'nunca recebem retorno'
  }, {
    tag: '02',
    icon: /*#__PURE__*/React.createElement(Icon.Stack, null),
    title: 'processos manuais',
    body: 'planilhas duplicadas, retrabalho diário, gente caríssima fazendo tarefa que um sistema resolveria em segundos.',
    stat: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Counter, {
      to: 2
    }), "h", /*#__PURE__*/React.createElement("span", {
      className: "text-white/40 ml-2 font-normal text-base"
    }, "por dia")),
    stat_sub: 'gastas em cópia-e-cola'
  }, {
    tag: '03',
    icon: /*#__PURE__*/React.createElement(Icon.Eye, null),
    title: 'gestão sem clareza',
    body: 'você sente que algo está errado, mas não consegue provar. o número certo, em tempo real, nunca está à mão.',
    stat: /*#__PURE__*/React.createElement(React.Fragment, null, "decisões", /*#__PURE__*/React.createElement("span", {
      className: "text-white/40 ml-2 font-normal text-base"
    }, "no escuro")),
    stat_sub: 'baseadas em achismo'
  }];
  const onMove = useSpotlight();
  return /*#__PURE__*/React.createElement(Section, {
    id: "problema",
    num: "/ 01",
    eyebrow: "O custo do improviso",
    title: /*#__PURE__*/React.createElement(React.Fragment, null, "se sua empresa ainda depende de planilhas, retrabalho e WhatsApp bagunçado, ", /*#__PURE__*/React.createElement("span", {
      className: "text-white/40"
    }, "ela já está atrasada"), /*#__PURE__*/React.createElement("span", {
      className: "text-purple"
    }, "."))
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid md:grid-cols-3 gap-6 stagger"
  }, cards.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.tag,
    onMouseMove: onMove,
    "data-tilt": "7",
    className: "tilt glass spot shimmer rounded-2xl p-7 transition-all duration-300 group"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between mb-8"
  }, /*#__PURE__*/React.createElement("span", {
    className: "num-tag"
  }, "/ ", c.tag), /*#__PURE__*/React.createElement("div", {
    className: "text-white/40 group-hover:text-purple transition-colors"
  }, c.icon)), /*#__PURE__*/React.createElement("h3", {
    className: "text-2xl font-semibold tracking-tight mb-3"
  }, c.title), /*#__PURE__*/React.createElement("p", {
    className: "text-white/60 leading-relaxed text-sm"
  }, c.body), /*#__PURE__*/React.createElement("div", {
    className: "hr-grad my-6"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "text-2xl font-semibold text-purple"
  }, c.stat), /*#__PURE__*/React.createElement("div", {
    className: "text-xs font-mono text-white/45 tracking-wider mt-1"
  }, c.stat_sub))))));
}

// =====================================================================
// SOLUTIONS
// =====================================================================
function Solutions() {
  const solutions = [{
    id: 'sistemas',
    icon: Icon.Stack,
    title: 'sistemas sob medida',
    eyebrow: 'produto interno',
    summary: 'plataformas internas, ERPs leves e ferramentas próprias construídas para a forma como sua empresa realmente opera.',
    forWho: 'empresas com operação presa em planilhas, grupos, tarefas manuais e sistemas genéricos que não conversam com o fluxo real.',
    deliver: ['mapeamento do processo atual e desenho do fluxo ideal', 'web app responsivo com login, papéis e permissões', 'cadastros, status, anexos, aprovações e histórico', 'painel administrativo para acompanhar e evoluir a operação'],
    stack: ['React/Next.js', 'Supabase/Postgres', 'APIs', 'auth', 'cloud'],
    result: 'um lugar único para operar, medir e escalar sem depender de planilha paralela ou cobrança manual.',
    context: 'ideal quando o negócio já validou o processo, mas a rotina está grande demais para ferramenta improvisada.',
    tags: ['web app', 'multiusuário', 'permissões'],
    signal: 'fluxo centralizado',
    metric: 'menos retrabalho'
  }, {
    id: 'sites',
    icon: Icon.Eye,
    title: 'sites de alta conversão',
    eyebrow: 'vitrine que vende',
    summary: 'landing pages e sites institucionais rápidos, bonitos e pensados para transformar visita em conversa qualificada.',
    forWho: 'marcas, serviços, negócios locais e operações B2B que precisam parecer fortes online e captar demanda com clareza.',
    deliver: ['arquitetura da oferta, copy e hierarquia visual', 'landing page ou site institucional responsivo', 'formulários, WhatsApp, eventos e pixels configurados', 'performance, SEO técnico básico e publicação'],
    stack: ['React/Next.js', 'analytics', 'Meta/Google pixels', 'forms', 'WhatsApp'],
    result: 'mais visitantes entendendo a oferta, tomando ação e chegando no atendimento com contexto.',
    context: 'perfeito para campanhas, reposicionamento, captação local ou para tirar do ar aquele site que parece cartão de visitas antigo.',
    tags: ['landing page', 'copy', 'tracking'],
    signal: 'pronto para campanha',
    metric: 'mais pedidos'
  }, {
    id: 'automacoes',
    icon: Icon.Flow,
    title: 'automações',
    eyebrow: 'rotina sem fricção',
    summary: 'fluxos que rodam sozinhos: cadastros, follow-ups, notificações, documentos, backups e passagens entre áreas.',
    forWho: 'times que repetem a mesma sequência todo dia e perdem velocidade com cópia e cola, conferência manual e esquecimento.',
    deliver: ['mapa de gatilhos, regras e exceções', 'automações com logs, alertas e fallback humano', 'rotinas de follow-up, cobrança, cadastro e atualização', 'documentação simples para o time entender o fluxo'],
    stack: ['n8n', 'webhooks', 'Zapier/Make', 'APIs', 'sheets/CRM'],
    result: 'menos tarefa operacional, menos erro e mais consistência no caminho entre lead, venda, entrega e financeiro.',
    context: 'começa bem quando existe um processo claro, repetitivo e chato o suficiente para ninguém querer fazer na mão.',
    tags: ['n8n', 'webhooks', 'gatilhos'],
    signal: 'processo rodando',
    metric: 'horas de volta'
  }, {
    id: 'ia',
    icon: Icon.Spark,
    title: 'agentes de IA',
    eyebrow: 'atendimento inteligente',
    summary: 'atendentes, SDRs e copilotos que entendem seu produto, qualificam leads e respondem com o tom da sua marca.',
    forWho: 'empresas com muito atendimento repetido, lead sem triagem, dúvidas previsíveis ou time comercial sobrecarregado.',
    deliver: ['base de conhecimento treinada com regras da empresa', 'roteiros de qualificação, objeções e passagem para humano', 'memória de contexto, resumo de conversas e tags', 'monitoramento de qualidade para ajustar respostas'],
    stack: ['OpenAI/LLMs', 'WhatsApp API', 'CRM', 'RAG', 'logs'],
    result: 'respostas mais rápidas, leads mais organizados e time humano focado no que realmente precisa de gente.',
    context: 'funciona melhor quando a IA tem tarefa clara: qualificar, responder, resumir ou preparar a próxima ação.',
    tags: ['atendimento', 'vendas', 'qualificação'],
    signal: '24/7 com contexto',
    metric: 'mais velocidade'
  }, {
    id: 'dashboards',
    icon: Icon.Bars,
    title: 'dashboards',
    eyebrow: 'decisão com sinal',
    summary: 'painéis em tempo real que mostram receita, gargalos, conversão, filas, performance por canal e indicadores do dono.',
    forWho: 'gestores que sentem o problema, mas não conseguem enxergar número confiável sem pedir relatório, exportar CSV ou abrir várias telas.',
    deliver: ['definição dos KPIs que realmente importam', 'painéis por área, período, canal e responsável', 'alertas para queda, atraso ou oportunidade', 'visão executiva para decidir rápido'],
    stack: ['BI sob medida', 'Postgres', 'Looker/Metabase', 'APIs', 'tempo real'],
    result: 'o negócio deixa de operar por sensação e passa a enxergar onde perde dinheiro, tempo e conversão.',
    context: 'entra forte quando os dados já existem, mas estão espalhados entre planilhas, CRM, ERP e ferramentas de campanha.',
    tags: ['BI sob medida', 'tempo real', 'KPIs'],
    signal: 'números vivos',
    metric: 'menos achismo'
  }, {
    id: 'integracoes',
    icon: Icon.Link,
    title: 'integrações',
    eyebrow: 'ferramentas conversando',
    summary: 'WhatsApp, CRMs, bancos de dados, ERPs e ferramentas internas conectadas sem cópia e cola entre sistemas.',
    forWho: 'operações que já usam boas ferramentas, mas ainda dependem de alguém para transportar informação de um lugar para outro.',
    deliver: ['desenho das fontes, destinos e regras de sincronização', 'conexões por API, webhook, filas ou banco intermediário', 'tratamento de erro, logs e alertas de falha', 'camada simples para manter os dados confiáveis'],
    stack: ['WhatsApp API', 'CRMs', 'ERPs', 'webhooks', 'bancos de dados'],
    result: 'informação consistente, menos retrabalho e cada área olhando para o mesmo dado sem depender de repasse manual.',
    context: 'faz sentido quando a empresa cresceu em ferramentas e agora precisa que o ecossistema pareça um sistema só.',
    tags: ['WhatsApp API', 'CRM/ERP', 'dados'],
    signal: 'dados em sincronia',
    metric: 'menos erro'
  }];
  const [selected, setSelected] = React.useState(solutions[0].id);
  const active = solutions.find(s => s.id === selected) || solutions[0];
  const ActiveIcon = active.icon;
  const onMove = useSpotlight();
  const wa = `https://wa.me/5554984184808?text=${encodeURIComponent(`Olá! Vim pelo site da Shift Systems e quero conversar sobre ${active.title}.`)}`;
  return /*#__PURE__*/React.createElement(Section, {
    id: "solucoes",
    num: "/ 02",
    eyebrow: "Soluções",
    title: /*#__PURE__*/React.createElement(React.Fragment, null, "escolha a alavanca certa para fazer ", /*#__PURE__*/React.createElement("br", {
      className: "hidden md:block"
    }), "sua empresa rodar melhor", /*#__PURE__*/React.createElement("span", {
      className: "text-purple"
    }, ".")),
    intro: "seis linhas de trabalho, agora com site de alta conversão no stack. cada aba mostra onde a solução encaixa, o que entregamos e o efeito esperado."
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid md:grid-cols-2 xl:grid-cols-3 gap-4 stagger",
    role: "tablist",
    "aria-label": "Soluções Shift Systems"
  }, solutions.map((s, i) => {
    const SolutionIcon = s.icon;
    const isActive = active.id === s.id;
    return /*#__PURE__*/React.createElement("button", {
      key: s.id,
      type: "button",
      role: "tab",
      "aria-selected": isActive,
      "aria-controls": "solution-panel",
      onClick: () => setSelected(s.id),
      onMouseMove: onMove,
      "data-tilt": "5",
      className: `tilt glass spot shimmer rounded-2xl p-6 text-left flex flex-col transition-all duration-300 group ${isActive ? 'border-purple/45 bg-purple/10 shadow-[0_0_44px_-20px_rgba(181,107,255,0.8)]' : 'hover:border-cyan-300/30 hover:bg-cyan-300/[0.035]'}`
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-start justify-between gap-4 mb-7"
    }, /*#__PURE__*/React.createElement("div", {
      className: `w-11 h-11 rounded-xl border flex items-center justify-center transition-all duration-500 ${isActive ? 'bg-purple/15 border-purple/35 text-purple scale-105' : 'bg-white/[0.03] border-white/10 text-white/45 group-hover:text-cyan-200 group-hover:border-cyan-300/30 group-hover:scale-105'}`
    }, /*#__PURE__*/React.createElement(SolutionIcon, null)), /*#__PURE__*/React.createElement("div", {
      className: "text-right"
    }, /*#__PURE__*/React.createElement("span", {
      className: `num-tag ${isActive ? 'text-purple opacity-100' : 'opacity-45'}`
    }, "0", i + 1), /*#__PURE__*/React.createElement("div", {
      className: `mt-2 text-[10px] font-mono uppercase tracking-[0.18em] ${isActive ? 'text-purple' : 'text-white/35 group-hover:text-cyan-200'}`
    }, s.signal))), /*#__PURE__*/React.createElement("div", {
      className: "text-[10px] font-mono uppercase tracking-[0.24em] text-white/35 mb-3"
    }, s.eyebrow), /*#__PURE__*/React.createElement("h3", {
      className: "text-2xl font-semibold tracking-tight mb-3"
    }, s.title), /*#__PURE__*/React.createElement("p", {
      className: "text-white/60 leading-relaxed text-sm flex-1"
    }, s.summary), /*#__PURE__*/React.createElement("div", {
      className: "mt-6 flex flex-wrap gap-2"
    }, s.tags.map(t => /*#__PURE__*/React.createElement("span", {
      key: t,
      className: `text-[10px] font-mono tracking-wider uppercase px-2.5 py-1 rounded-full border transition-colors ${isActive ? 'text-white border-purple/30 bg-purple/10' : 'text-white/55 border-white/10 bg-white/[0.03] group-hover:border-cyan-300/25 group-hover:text-white'}`
    }, t))));
  })), /*#__PURE__*/React.createElement("div", {
    id: "solution-panel",
    role: "tabpanel",
    className: "mt-8 grid lg:grid-cols-12 gap-5 items-stretch reveal"
  }, /*#__PURE__*/React.createElement("div", {
    onMouseMove: onMove,
    className: "lg:col-span-5 glass-strong spot rounded-3xl p-7 md:p-8 relative overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute -right-20 -top-20 w-64 h-64 rounded-full bg-purple/20 blur-3xl"
  }), /*#__PURE__*/React.createElement("div", {
    className: "absolute right-8 bottom-8 w-28 h-28 rounded-full bg-cyan-300/10 blur-2xl"
  }), /*#__PURE__*/React.createElement("div", {
    className: "relative"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between gap-5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-14 h-14 rounded-2xl bg-purple/15 border border-purple/30 text-purple flex items-center justify-center ring-glow"
  }, /*#__PURE__*/React.createElement(ActiveIcon, {
    s: 24
  })), /*#__PURE__*/React.createElement("div", {
    className: "text-right"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-[10px] font-mono uppercase tracking-[0.22em] text-white/35"
  }, "resultado foco"), /*#__PURE__*/React.createElement("div", {
    className: "mt-1 text-purple font-semibold tracking-tight"
  }, active.metric))), /*#__PURE__*/React.createElement("div", {
    className: "mt-10"
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow mb-4"
  }, active.eyebrow), /*#__PURE__*/React.createElement("h3", {
    className: "text-3xl md:text-5xl font-semibold tracking-tight leading-tight"
  }, active.title), /*#__PURE__*/React.createElement("p", {
    className: "mt-5 text-white/65 leading-relaxed md:text-lg"
  }, active.summary)), /*#__PURE__*/React.createElement("div", {
    className: "hr-grad my-8"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "text-[10px] font-mono uppercase tracking-[0.22em] text-cyan-200 mb-3"
  }, "para quem é"), /*#__PURE__*/React.createElement("p", {
    className: "text-white/65 leading-relaxed"
  }, active.forWho)))), /*#__PURE__*/React.createElement("div", {
    className: "lg:col-span-7 glass rounded-3xl p-7 md:p-8 relative overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-purple/60 to-transparent"
  }), /*#__PURE__*/React.createElement("div", {
    className: "grid md:grid-cols-2 gap-x-8 gap-y-8"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "text-[10px] font-mono uppercase tracking-[0.22em] text-purple mb-4"
  }, "o que entregamos"), /*#__PURE__*/React.createElement("ul", {
    className: "space-y-3"
  }, active.deliver.map(item => /*#__PURE__*/React.createElement("li", {
    key: item,
    className: "flex gap-3 text-sm text-white/65 leading-relaxed"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mt-2 w-1.5 h-1.5 rounded-full bg-purple shrink-0 ring-glow"
  }), /*#__PURE__*/React.createElement("span", null, item))))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "text-[10px] font-mono uppercase tracking-[0.22em] text-cyan-200 mb-4"
  }, "integrações / stack"), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-2"
  }, active.stack.map(s => /*#__PURE__*/React.createElement("span", {
    key: s,
    className: "text-[10px] font-mono uppercase tracking-wider text-white/65 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.03]"
  }, s))), /*#__PURE__*/React.createElement("div", {
    className: "mt-8 pt-6 border-t border-white/10"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-[10px] font-mono uppercase tracking-[0.22em] text-purple mb-3"
  }, "resultado esperado"), /*#__PURE__*/React.createElement("p", {
    className: "text-white/65 leading-relaxed"
  }, active.result))), /*#__PURE__*/React.createElement("div", {
    className: "md:col-span-2 pt-7 border-t border-white/10"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col lg:flex-row lg:items-center justify-between gap-5"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "text-[10px] font-mono uppercase tracking-[0.22em] text-white/35 mb-3"
  }, "cta / contexto"), /*#__PURE__*/React.createElement("p", {
    className: "text-white/60 leading-relaxed max-w-2xl"
  }, active.context)), /*#__PURE__*/React.createElement("a", {
    href: wa,
    target: "_blank",
    rel: "noopener noreferrer",
    "data-magnetic": "0.25",
    className: "w-full lg:w-auto shrink-0"
  }, /*#__PURE__*/React.createElement(PrimaryBtn, {
    className: "w-full lg:w-auto inline-flex items-center justify-center gap-2 px-7 py-4"
  }, "conversar sobre isso ", /*#__PURE__*/React.createElement(Icon.Arrow, {
    s: 16
  })))))))));
}

// =====================================================================
// BUILD MENU
// =====================================================================
function BuildMenu() {
  const builds = [{
    icon: /*#__PURE__*/React.createElement(Icon.Pulse, null),
    area: 'vendas',
    title: 'inbox de leads inteligente',
    body: 'captura WhatsApp, Instagram e formulário em uma fila única, qualifica o lead e manda o próximo passo pro CRM.',
    flow: ['lead entrou', 'IA pergunta', 'CRM atualizado'],
    signal: 'lead quente em tempo real',
    accent: 'cyan'
  }, {
    icon: /*#__PURE__*/React.createElement(Icon.Flow, null),
    area: 'operação',
    title: 'painel de execução',
    body: 'um cockpit simples para acompanhar pedidos, tarefas, prazos, responsáveis e gargalos sem depender de grupo ou áudio perdido.',
    flow: ['pedido aberto', 'responsável definido', 'alerta de atraso'],
    signal: 'menos cobrança manual'
  }, {
    icon: /*#__PURE__*/React.createElement(Icon.Link, null),
    area: 'financeiro',
    title: 'cobrança automática',
    body: 'emissão, lembrete, status de pagamento e follow-up rodando sozinhos, com histórico limpo e visível.',
    flow: ['boleto gerado', 'cliente avisado', 'baixa conferida'],
    signal: 'dinheiro parado aparece'
  }, {
    icon: /*#__PURE__*/React.createElement(Icon.Spark, null),
    area: 'atendimento',
    title: 'agente com memória da empresa',
    body: 'um assistente que responde no tom da marca, consulta regras internas e chama humano quando a conversa precisa de cuidado.',
    flow: ['dúvida recebida', 'base consultada', 'resposta enviada'],
    signal: '24/7 sem virar robô frio',
    accent: 'cyan'
  }, {
    icon: /*#__PURE__*/React.createElement(Icon.Bars, null),
    area: 'gestão',
    title: 'dashboard do dono',
    body: 'receita, conversão, canais, gargalos e metas em uma tela só. menos feeling, mais leitura do jogo.',
    flow: ['dados puxados', 'KPI calculado', 'alerta disparado'],
    signal: 'decisão com número'
  }, {
    icon: /*#__PURE__*/React.createElement(Icon.Stack, null),
    area: 'sistema interno',
    title: 'app sob medida',
    body: 'login, permissões, cadastro, busca, relatórios e automações internas em uma ferramenta feita para o seu fluxo real.',
    flow: ['time acessa', 'processo roda', 'relatório sai'],
    signal: 'sua operação em software',
    accent: 'cyan'
  }];
  const onMove = useSpotlight();
  return /*#__PURE__*/React.createElement(Section, {
    id: "ideias",
    num: "/ 03",
    eyebrow: "O que dá pra construir",
    title: /*#__PURE__*/React.createElement(React.Fragment, null, "não é sobre parecer tech. é sobre colocar sua operação no ", /*#__PURE__*/React.createElement("span", {
      className: "text-white/40"
    }, "modo automático"), /*#__PURE__*/React.createElement("span", {
      className: "text-purple"
    }, ".")),
    intro: "algumas empresas precisam de um sistema inteiro. outras só precisam eliminar três tarefas que travam o dia. a Shift entra nesse ponto exato."
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid lg:grid-cols-12 gap-5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lg:col-span-4 glass-strong rounded-3xl p-7 md:p-8 relative overflow-hidden reveal"
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute -right-16 -top-16 w-56 h-56 rounded-full bg-cyan-300/10 blur-3xl"
  }), /*#__PURE__*/React.createElement("div", {
    className: "relative"
  }, /*#__PURE__*/React.createElement("div", {
    className: "num-tag mb-5"
  }, "modo shift"), /*#__PURE__*/React.createElement("h3", {
    className: "display text-3xl md:text-4xl leading-none"
  }, "do caos do grupo", /*#__PURE__*/React.createElement("br", null), "pro fluxo que roda", /*#__PURE__*/React.createElement("span", {
    className: "text-purple"
  }, ".")), /*#__PURE__*/React.createElement("p", {
    className: "mt-6 text-white/60 leading-relaxed"
  }, "a pergunta não é “qual ferramenta usar?”. é “qual parte da operação precisa parar de depender de memória humana?”."), /*#__PURE__*/React.createElement("div", {
    className: "mt-8 rounded-2xl border border-white/10 bg-black/30 p-4 font-mono text-[11px] text-white/55"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between mb-4"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-cyan-200"
  }, "shift://map"), /*#__PURE__*/React.createElement("span", {
    className: "text-purple"
  }, "online")), ['capturar', 'decidir', 'executar', 'medir'].map((t, i) => /*#__PURE__*/React.createElement("div", {
    key: t,
    className: "flex items-center gap-3 py-2 border-t border-white/8 first:border-t-0"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-purple"
  }, "0", i + 1), /*#__PURE__*/React.createElement("span", null, t), /*#__PURE__*/React.createElement("span", {
    className: "ml-auto text-white/30"
  }, "ready")))))), /*#__PURE__*/React.createElement("div", {
    className: "lg:col-span-8 grid md:grid-cols-2 gap-5 stagger"
  }, builds.map((b, i) => /*#__PURE__*/React.createElement("div", {
    key: b.title,
    onMouseMove: onMove,
    "data-tilt": "5",
    className: "tilt glass spot shimmer rounded-2xl p-6 transition-all duration-300 group min-h-[280px] flex flex-col"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-start justify-between gap-4 mb-7"
  }, /*#__PURE__*/React.createElement("div", {
    className: `w-11 h-11 rounded-xl border flex items-center justify-center transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3 ${b.accent === 'cyan' ? 'bg-cyan-300/10 border-cyan-300/30 text-cyan-200' : 'bg-purple/10 border-purple/25 text-purple'}`
  }, b.icon), /*#__PURE__*/React.createElement("div", {
    className: "text-right"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-[10px] font-mono tracking-[0.2em] uppercase text-white/35"
  }, "build / ", String(i + 1).padStart(2, '0')), /*#__PURE__*/React.createElement("div", {
    className: `mt-1 text-[10px] font-mono uppercase tracking-wider ${b.accent === 'cyan' ? 'text-cyan-200' : 'text-purple'}`
  }, b.area))), /*#__PURE__*/React.createElement("h3", {
    className: "text-2xl font-semibold tracking-tight mb-3"
  }, b.title), /*#__PURE__*/React.createElement("p", {
    className: "text-white/60 leading-relaxed text-sm flex-1"
  }, b.body), /*#__PURE__*/React.createElement("div", {
    className: "mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap items-center gap-2 font-mono text-[10px] text-white/50"
  }, b.flow.map((f, n) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: f
  }, /*#__PURE__*/React.createElement("span", {
    className: "px-2 py-1 rounded-full bg-white/[0.04] border border-white/8"
  }, f), n < b.flow.length - 1 && /*#__PURE__*/React.createElement("span", {
    className: "text-purple"
  }, "→"))))), /*#__PURE__*/React.createElement("div", {
    className: "mt-4 flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-white/45"
  }, /*#__PURE__*/React.createElement("span", {
    className: `w-1.5 h-1.5 rounded-full ${b.accent === 'cyan' ? 'bg-cyan-300' : 'bg-purple'}`
  }), b.signal))))));
}

// =====================================================================
// PROCESS
// =====================================================================
function Process() {
  const onMoveStep = useSpotlight();
  const steps = [{
    n: '01',
    label: 'diagnóstico',
    body: 'conversa estruturada com você e seu time pra entender onde o tempo escorre, quais processos quebram e onde a tecnologia traz mais retorno.',
    delivers: ['mapa de gargalos', 'ROI estimado']
  }, {
    n: '02',
    label: 'mapeamento',
    body: 'desenhamos o sistema, automação ou agente exatamente como ele vai funcionar — com escopo, prazo e prioridades validados antes de escrever uma linha de código.',
    delivers: ['blueprint técnico', 'cronograma']
  }, {
    n: '03',
    label: 'desenvolvimento',
    body: 'entregas semanais, sem caixa-preta. você acompanha cada release, testa em produção e dá direção enquanto a gente constrói.',
    delivers: ['releases semanais', 'ambiente de teste']
  }, {
    n: '04',
    label: 'evolução',
    body: 'sistema no ar não é o fim — é o começo. monitoramos, ajustamos e expandimos conforme sua empresa cresce.',
    delivers: ['suporte', 'novas features']
  }];
  return /*#__PURE__*/React.createElement(Section, {
    id: "processo",
    num: "/ 04",
    eyebrow: "Como trabalhamos",
    title: /*#__PURE__*/React.createElement(React.Fragment, null, "do problema ao sistema ", /*#__PURE__*/React.createElement("span", {
      className: "text-white/40"
    }, "funcionando"), /*#__PURE__*/React.createElement("span", {
      className: "text-purple"
    }, ".")),
    intro: "quatro etapas, sem mistério. cada uma com entregáveis claros e prazos definidos."
  }, /*#__PURE__*/React.createElement("div", {
    className: "relative reveal"
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute left-6 md:left-10 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-purple/40 to-transparent hidden md:block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "travel-dot absolute -left-[3px] w-[7px] h-[7px] rounded-full bg-purple ring-glow"
  })), /*#__PURE__*/React.createElement("div", {
    className: "space-y-5"
  }, steps.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: s.n,
    className: "grid md:grid-cols-12 gap-6 items-start group"
  }, /*#__PURE__*/React.createElement("div", {
    className: "md:col-span-2 flex items-center gap-4 relative"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-12 h-12 md:w-20 md:h-20 rounded-2xl glass flex items-center justify-center font-mono text-lg md:text-xl text-purple relative z-10 group-hover:border-purple/40 group-hover:scale-105 transition-all duration-500"
  }, s.n, /*#__PURE__*/React.createElement("span", {
    className: "absolute inset-0 rounded-2xl border border-purple/30 opacity-0 group-hover:opacity-100 group-hover:scale-125 transition-all duration-700"
  })), /*#__PURE__*/React.createElement("div", {
    className: "md:hidden text-xl font-semibold tracking-tight"
  }, s.label)), /*#__PURE__*/React.createElement("div", {
    className: "md:col-span-10 glass spot rounded-2xl p-7 md:p-8",
    onMouseMove: onMoveStep
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-baseline justify-between flex-wrap gap-3 mb-3"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "hidden md:block text-2xl md:text-3xl font-semibold tracking-tight"
  }, s.label), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, s.delivers.map(d => /*#__PURE__*/React.createElement("span", {
    key: d,
    className: "text-[10px] font-mono uppercase tracking-wider text-purple/85 px-3 py-1 rounded-full bg-purple/10 border border-purple/25"
  }, d)))), /*#__PURE__*/React.createElement("p", {
    className: "text-white/65 leading-relaxed md:text-lg max-w-3xl"
  }, s.body)))))));
}

// =====================================================================
// DIAGNOSTIC LAB
// =====================================================================
function DiagnosticLab() {
  const tracks = [{
    id: 'atendimento',
    label: 'atendimento',
    icon: /*#__PURE__*/React.createElement(Icon.Pulse, null),
    score: 84,
    pain: 'mensagens espalhadas, lead sem dono e resposta dependendo de quem viu primeiro.',
    build: 'triagem automática, fila única, respostas com contexto e passagem inteligente para humano.',
    result: 'menos lead esquecido, mais velocidade e uma experiência que parece organizada desde o primeiro oi.',
    stack: ['WhatsApp API', 'agente IA', 'CRM', 'dashboard']
  }, {
    id: 'vendas',
    label: 'vendas',
    icon: /*#__PURE__*/React.createElement(Icon.Flow, null),
    score: 76,
    pain: 'follow-up feito na memória, proposta perdida e oportunidade esfriando sem alerta.',
    build: 'pipeline visual, alertas, automações de follow-up e resumo automático de cada negociação.',
    result: 'o time sabe quem abordar, quando abordar e por que aquele lead merece prioridade.',
    stack: ['CRM leve', 'webhooks', 'IA SDR', 'notificações']
  }, {
    id: 'financeiro',
    label: 'financeiro',
    icon: /*#__PURE__*/React.createElement(Icon.Link, null),
    score: 71,
    pain: 'cobrança manual, conferência chata e pouca visibilidade de dinheiro parado.',
    build: 'emissão, lembrete, baixa, conciliação simples e painel de pendências por cliente.',
    result: 'menos perseguição manual e mais clareza sobre onde o caixa está travando.',
    stack: ['ERP', 'banco de dados', 'notas', 'relatórios']
  }, {
    id: 'operação',
    label: 'operação',
    icon: /*#__PURE__*/React.createElement(Icon.Stack, null),
    score: 89,
    pain: 'tarefas no WhatsApp, planilhas diferentes e ninguém sabendo exatamente o status real.',
    build: 'sistema interno com etapas, responsáveis, prazos, anexos, alertas e visão de gargalo.',
    result: 'sua empresa para de depender de cobrança no grupo e começa a operar por fluxo.',
    stack: ['web app', 'permissões', 'alertas', 'BI']
  }];
  const [selected, setSelected] = React.useState(tracks[0].id);
  const active = tracks.find(t => t.id === selected) || tracks[0];
  const wa = `https://wa.me/5554984184808?text=${encodeURIComponent(`Olá! Vim pelo site da Shift Systems e quero um diagnóstico para ${active.label}.`)}`;
  return /*#__PURE__*/React.createElement(Section, {
    id: "diagnostico",
    num: "/ 05",
    eyebrow: "Diagnóstico rápido",
    title: /*#__PURE__*/React.createElement(React.Fragment, null, "onde sua empresa está perdendo ", /*#__PURE__*/React.createElement("span", {
      className: "text-white/40"
    }, "velocidade"), /*#__PURE__*/React.createElement("span", {
      className: "text-purple"
    }, "?")),
    intro: "escolha a área mais caótica hoje. a gente mostra o tipo de sistema, automação ou agente que provavelmente faz sentido começar primeiro."
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid lg:grid-cols-12 gap-5 items-stretch"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lg:col-span-4 grid gap-3 reveal"
  }, tracks.map(t => /*#__PURE__*/React.createElement("button", {
    key: t.id,
    onClick: () => setSelected(t.id),
    className: `group text-left rounded-2xl border p-5 transition-all duration-300 ${active.id === t.id ? 'border-purple/45 bg-purple/10 shadow-[0_0_40px_-18px_rgba(181,107,255,0.75)]' : 'border-white/10 bg-white/[0.025] hover:border-cyan-300/30 hover:bg-cyan-300/[0.04]'}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between gap-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3"
  }, /*#__PURE__*/React.createElement("span", {
    className: `w-10 h-10 rounded-xl border flex items-center justify-center ${active.id === t.id ? 'border-purple/30 bg-purple/10 text-purple' : 'border-white/10 bg-white/[0.03] text-white/45 group-hover:text-cyan-200 group-hover:border-cyan-300/30'}`
  }, t.icon), /*#__PURE__*/React.createElement("span", {
    className: "text-lg font-semibold tracking-tight"
  }, t.label)), /*#__PURE__*/React.createElement("span", {
    className: `text-[10px] font-mono uppercase tracking-wider ${active.id === t.id ? 'text-purple' : 'text-white/35 group-hover:text-cyan-200'}`
  }, "mapear"))))), /*#__PURE__*/React.createElement("div", {
    className: "lg:col-span-8 glass-strong rounded-3xl p-7 md:p-9 relative overflow-hidden reveal"
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute -right-24 -bottom-24 w-72 h-72 rounded-full bg-purple/20 blur-3xl"
  }), /*#__PURE__*/React.createElement("div", {
    className: "absolute right-10 top-10 w-28 h-28 rounded-full bg-cyan-300/10 blur-2xl"
  }), /*#__PURE__*/React.createElement("div", {
    className: "relative grid md:grid-cols-12 gap-8 items-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "md:col-span-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "relative w-44 h-44 mx-auto md:mx-0 rounded-full flex items-center justify-center",
    style: {
      background: `conic-gradient(#B56BFF ${active.score * 3.6}deg, rgba(255,255,255,0.08) 0deg)`
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute inset-3 rounded-full bg-[#0b0b10] border border-white/10"
  }), /*#__PURE__*/React.createElement("div", {
    className: "relative text-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-5xl font-semibold tracking-tight text-purple"
  }, active.score), /*#__PURE__*/React.createElement("div", {
    className: "mt-1 text-[10px] font-mono uppercase tracking-[0.2em] text-white/40"
  }, "potencial"))), /*#__PURE__*/React.createElement("div", {
    className: "mt-6 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.04] p-4 font-mono text-[11px] text-cyan-100/80"
  }, "shift scan ativo", /*#__PURE__*/React.createElement("br", null), "área: ", active.label, /*#__PURE__*/React.createElement("br", null), "prioridade: alta")), /*#__PURE__*/React.createElement("div", {
    className: "md:col-span-8"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3 mb-5"
  }, /*#__PURE__*/React.createElement("span", {
    className: "w-2 h-2 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.8)]"
  }), /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] font-mono uppercase tracking-[0.24em] text-cyan-200"
  }, "gargalo provável")), /*#__PURE__*/React.createElement("h3", {
    className: "text-3xl md:text-4xl font-semibold tracking-tight mb-4"
  }, active.label), /*#__PURE__*/React.createElement("p", {
    className: "text-white/65 leading-relaxed md:text-lg"
  }, active.pain), /*#__PURE__*/React.createElement("div", {
    className: "grid md:grid-cols-2 gap-4 mt-7"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rounded-2xl border border-white/10 bg-white/[0.025] p-5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-[10px] font-mono uppercase tracking-wider text-purple mb-3"
  }, "o que construir"), /*#__PURE__*/React.createElement("p", {
    className: "text-white/65 leading-relaxed text-sm"
  }, active.build)), /*#__PURE__*/React.createElement("div", {
    className: "rounded-2xl border border-white/10 bg-white/[0.025] p-5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-[10px] font-mono uppercase tracking-wider text-cyan-200 mb-3"
  }, "efeito esperado"), /*#__PURE__*/React.createElement("p", {
    className: "text-white/65 leading-relaxed text-sm"
  }, active.result))), /*#__PURE__*/React.createElement("div", {
    className: "mt-6 flex flex-wrap gap-2"
  }, active.stack.map(s => /*#__PURE__*/React.createElement("span", {
    key: s,
    className: "text-[10px] font-mono uppercase tracking-wider text-white/60 px-3 py-1 rounded-full border border-white/10 bg-white/[0.03]"
  }, s))), /*#__PURE__*/React.createElement("div", {
    className: "mt-8 flex flex-col sm:flex-row sm:items-center gap-3"
  }, /*#__PURE__*/React.createElement("a", {
    href: wa,
    target: "_blank",
    rel: "noopener noreferrer",
    "data-magnetic": "0.25",
    className: "w-full sm:w-auto"
  }, /*#__PURE__*/React.createElement(PrimaryBtn, {
    className: "w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4"
  }, "mapear meu gargalo ", /*#__PURE__*/React.createElement(Icon.Arrow, {
    s: 16
  }))), /*#__PURE__*/React.createElement("span", {
    className: "text-xs font-mono uppercase tracking-wider text-white/40"
  }, "não precisa chegar com escopo pronto")))))));
}

// =====================================================================
// POSITIONING
// =====================================================================
function Positioning() {
  return /*#__PURE__*/React.createElement("section", {
    className: "relative px-6 md:px-12 lg:px-20 py-32 md:py-40"
  }, /*#__PURE__*/React.createElement("div", {
    className: "max-w-6xl mx-auto"
  }, /*#__PURE__*/React.createElement("div", {
    className: "glass-strong rounded-3xl p-10 md:p-16 lg:p-20 relative overflow-hidden"
  }, /*#__PURE__*/React.createElement("svg", {
    className: "absolute -top-20 -right-20 opacity-[0.07]",
    width: "500",
    height: "500",
    viewBox: "0 0 100 100"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "26",
    y: "18",
    width: "60",
    height: "14",
    rx: "2",
    fill: "#B56BFF"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M38 32 L62 68",
    stroke: "#B56BFF",
    strokeWidth: "14"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14",
    y: "68",
    width: "60",
    height: "14",
    rx: "2",
    fill: "#B56BFF"
  })), /*#__PURE__*/React.createElement("div", {
    className: "relative"
  }, /*#__PURE__*/React.createElement("div", {
    className: "num-tag mb-6"
  }, "/ 06 · posicionamento"), /*#__PURE__*/React.createElement("h2", {
    className: "display text-4xl md:text-6xl lg:text-7xl max-w-4xl build"
  }, "sem consultoria velha", /*#__PURE__*/React.createElement("span", {
    className: "text-purple"
  }, "."), /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    className: "text-purple"
  }, "sem sistema engessado"), /*#__PURE__*/React.createElement("span", {
    className: "text-purple"
  }, ".")), /*#__PURE__*/React.createElement("p", {
    className: "mt-10 text-lg md:text-xl text-white/65 max-w-3xl leading-relaxed reveal"
  }, "a Shift é pra empresa que quer operar com mentalidade de startup: testar rápido, automatizar o que pesa e transformar processo bagunçado em produto interno bonito de usar."), /*#__PURE__*/React.createElement("div", {
    className: "hr-grad my-12"
  }), /*#__PURE__*/React.createElement("div", {
    className: "reveal"
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow mb-4"
  }, "princípio"), /*#__PURE__*/React.createElement("div", {
    className: "display text-3xl md:text-5xl lg:text-6xl"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-white/45"
  }, "rápido pra"), " validar", /*#__PURE__*/React.createElement("span", {
    className: "text-purple"
  }, "."), /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    className: "text-white/45"
  }, "bonito pra"), " usar", /*#__PURE__*/React.createElement("span", {
    className: "text-purple"
  }, "."), /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    className: "text-white/45"
  }, "sólido pra"), " escalar", /*#__PURE__*/React.createElement("span", {
    className: "text-purple"
  }, ".")))))));
}

// =====================================================================
// CTA FINAL
// =====================================================================
function CTA() {
  return /*#__PURE__*/React.createElement("section", {
    id: "contato",
    className: "relative px-6 md:px-12 lg:px-20 py-32 md:py-40 overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute inset-0 pointer-events-none"
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full aurora",
    style: {
      background: 'radial-gradient(circle, rgba(181,107,255,0.25), transparent 65%)',
      filter: 'blur(60px)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full border border-purple/20",
    style: {
      animation: 'aurora 4s ease-in-out infinite'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full border border-purple/10",
    style: {
      animation: 'aurora 5s ease-in-out infinite',
      animationDelay: '0.5s'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full border border-purple/5",
    style: {
      animation: 'aurora 6s ease-in-out infinite',
      animationDelay: '1s'
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "grid-overlay"
  }), /*#__PURE__*/React.createElement("div", {
    className: "max-w-5xl mx-auto text-center relative"
  }, /*#__PURE__*/React.createElement("div", {
    className: "inline-flex items-center gap-2 mb-8 px-4 py-2 rounded-full border border-purple/30 bg-purple/5"
  }, /*#__PURE__*/React.createElement("span", {
    className: "w-1.5 h-1.5 rounded-full bg-purple animate-pulse"
  }), /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "diagnósticos abertos · 2026")), /*#__PURE__*/React.createElement("h2", {
    className: "display text-5xl md:text-7xl lg:text-[88px] build"
  }, "seu próximo sistema", /*#__PURE__*/React.createElement("br", null), "começa no gargalo", /*#__PURE__*/React.createElement("span", {
    className: "text-purple"
  }, ".")), /*#__PURE__*/React.createElement("p", {
    className: "mt-10 text-lg md:text-xl text-white/65 max-w-2xl mx-auto leading-relaxed reveal"
  }, "em uma conversa, a gente identifica onde sua empresa perde tempo e dinheiro — e desenha o primeiro sistema, automação ou agente que faz sentido construir."), /*#__PURE__*/React.createElement("div", {
    className: "mt-14 flex flex-wrap justify-center items-center gap-4"
  }, /*#__PURE__*/React.createElement("a", {
    href: "https://wa.me/5554984184808?text=Ol%C3%A1%21%20Vim%20pelo%20site%20da%20Shift%20Systems%20e%20quero%20saber%20mais.",
    target: "_blank",
    rel: "noopener noreferrer",
    "data-magnetic": "0.3"
  }, /*#__PURE__*/React.createElement(PrimaryBtn, {
    className: "text-base px-9 py-4 inline-flex items-center gap-2"
  }, "mapear meu gargalo ", /*#__PURE__*/React.createElement(Icon.Arrow, {
    s: 16
  }))), /*#__PURE__*/React.createElement("span", {
    className: "text-sm font-mono text-white/45 tracking-wider"
  }, "sem escopo pronto · resposta em < 24h"))));
}

// =====================================================================
// FOOTER
// =====================================================================
function Footer() {
  return /*#__PURE__*/React.createElement("footer", {
    className: "relative px-6 md:px-12 lg:px-20 pt-16 pb-10 border-t border-white/8"
  }, /*#__PURE__*/React.createElement("div", {
    className: "max-w-7xl mx-auto"
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid md:grid-cols-12 gap-10"
  }, /*#__PURE__*/React.createElement("div", {
    className: "md:col-span-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3"
  }, /*#__PURE__*/React.createElement(MarkA, {
    size: 40
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "text-xl font-semibold tracking-tight leading-none"
  }, "Shift", /*#__PURE__*/React.createElement("span", {
    className: "text-purple"
  }, "."), " Systems"), /*#__PURE__*/React.createElement("div", {
    className: "mt-2 text-xs font-mono tracking-[0.28em] uppercase text-white/45"
  }, "sistemas · ia · automações"))), /*#__PURE__*/React.createElement("p", {
    className: "mt-8 text-white/55 max-w-md leading-relaxed"
  }, "tecnologia simples, inteligente e escalável para empresas que estão prontas pra parar de operar no improviso.")), /*#__PURE__*/React.createElement("div", {
    className: "md:col-span-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow mb-5"
  }, "navegação"), /*#__PURE__*/React.createElement("ul", {
    className: "space-y-3 text-white/65"
  }, /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("a", {
    href: "#inicio",
    className: "hover:text-purple transition"
  }, "início")), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("a", {
    href: "#solucoes",
    className: "hover:text-purple transition"
  }, "soluções")), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("a", {
    href: "#ideias",
    className: "hover:text-purple transition"
  }, "ideias")), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("a", {
    href: "#processo",
    className: "hover:text-purple transition"
  }, "processo")), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("a", {
    href: "#diagnostico",
    className: "hover:text-purple transition"
  }, "diagnóstico")), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("a", {
    href: "#contato",
    className: "hover:text-purple transition"
  }, "contato")))), /*#__PURE__*/React.createElement("div", {
    className: "md:col-span-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow mb-5"
  }, "contato"), /*#__PURE__*/React.createElement("ul", {
    className: "space-y-3 text-white/65"
  }, /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("a", {
    href: "https://instagram.com/shift_systemss",
    target: "_blank",
    rel: "noopener noreferrer",
    className: "hover:text-purple transition inline-flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.5"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "3",
    width: "18",
    height: "18",
    rx: "5"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "4"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "17.5",
    cy: "6.5",
    r: "0.7",
    fill: "currentColor"
  })), "@shift_systemss")), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("a", {
    href: "https://wa.me/5554984184808?text=Ol%C3%A1%21%20Vim%20pelo%20site%20da%20Shift%20Systems%20e%20quero%20saber%20mais.",
    target: "_blank",
    rel: "noopener noreferrer",
    className: "hover:text-purple transition inline-flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
  })), "whatsapp direto"))))), /*#__PURE__*/React.createElement("div", {
    className: "hr-grad my-12"
  }), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap items-center justify-between gap-4 text-xs font-mono tracking-wider uppercase text-white/40"
  }, /*#__PURE__*/React.createElement("div", null, "© 2026 Shift Systems · todos os direitos reservados"), /*#__PURE__*/React.createElement("div", null, "v.01 · feito pra rodar"))));
}
Object.assign(window, {
  Header,
  Hero,
  Provocative,
  Solutions,
  BuildMenu,
  Process,
  DiagnosticLab,
  Positioning,
  CTA,
  Footer,
  MarqueeStrip
});
})();
