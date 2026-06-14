/* Shift Systems · shared atoms */

// --- The Mark A (Sliced S) logo --------------------------------------
function MarkA({ size = 32, glow = true, color = '#B56BFF', className = '', animate = false }) {
  const filter = glow ? `drop-shadow(0 0 ${size * 0.18}px rgba(181,107,255,0.55))` : 'none';
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ filter }} className={`${className} ${animate ? 'mark-shift' : ''}`}>
      {/* top slab, aligned right */}
      <rect className="slab-top" x="26" y="18" width="60" height="14" rx="2" fill={color} />
      {/* diagonal — the shift */}
      <path d="M38 32 L62 68" stroke={color} strokeWidth="14" />
      {/* bottom slab, aligned left */}
      <rect className="slab-bottom" x="14" y="68" width="60" height="14" rx="2" fill={color} />
    </svg>
  );
}

// --- Animated number counter that runs on intersection -------------
function Counter({ to, suffix = '', prefix = '', duration = 1600, decimals = 0 }) {
  const ref = React.useRef(null);
  const [val, setVal] = React.useState(0);
  React.useEffect(() => {
    let raf, start;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          const step = (t) => {
            if (!start) start = t;
            const p = Math.min(1, (t - start) / duration);
            const eased = 1 - Math.pow(1 - p, 3);
            setVal(to * eased);
            if (p < 1) raf = requestAnimationFrame(step);
          };
          raf = requestAnimationFrame(step);
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.5 });
    if (ref.current) io.observe(ref.current);
    return () => { if (raf) cancelAnimationFrame(raf); io.disconnect(); };
  }, [to, duration]);
  return <span ref={ref}>{prefix}{val.toFixed(decimals)}{suffix}</span>;
}

// --- Typing cursor effect -----------------------------------------
function Typed({ text, speed = 60, className = '' }) {
  const [out, setOut] = React.useState('');
  const ref = React.useRef(null);
  React.useEffect(() => {
    let i = 0; let timer;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          const tick = () => { setOut(text.slice(0, i++)); if (i <= text.length) timer = setTimeout(tick, speed); };
          tick();
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.6 });
    if (ref.current) io.observe(ref.current);
    return () => { clearTimeout(timer); io.disconnect(); };
  }, [text, speed]);
  return <span ref={ref} className={className}>{out}<span className="blink text-purple">▌</span></span>;
}

// --- Spotlight tracker (sets --mx/--my on a card) ------------------
function useSpotlight() {
  return React.useCallback((e) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, []);
}

// --- Wordmark lockup -------------------------------------------------
function Wordmark({ size = 'md' }) {
  const dims = { sm: { mark: 22, font: 'text-base' }, md: { mark: 28, font: 'text-lg' }, lg: { mark: 40, font: 'text-2xl' } }[size];
  return (
    <div className="flex items-center gap-3">
      <MarkA size={dims.mark} />
      <div className={`font-sans font-semibold tracking-tight leading-none ${dims.font}`}>
        Shift<span className="text-purple">.</span>
        <span className="ml-1 font-mono font-normal text-[0.55em] tracking-[0.3em] uppercase text-white/55 align-middle">Systems</span>
      </div>
    </div>
  );
}

// --- Section wrapper -------------------------------------------------
function Section({ id, num, eyebrow, title, intro, children, className = '' }) {
  return (
    <section id={id} className={`relative px-6 md:px-12 lg:px-20 py-28 md:py-36 ${className}`}>
      <div className="max-w-7xl mx-auto">
        {(num || eyebrow) && (
          <div className="flex items-baseline gap-4 mb-8">
            {num && <span className="num-tag">{num}</span>}
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          </div>
        )}
        {title && (
          <h2 className="display text-4xl md:text-6xl lg:text-7xl max-w-5xl mb-8 reveal">{title}</h2>
        )}
        {intro && <p className="text-lg md:text-xl text-white/65 max-w-3xl mb-16 leading-relaxed reveal">{intro}</p>}
        {children}
      </div>
    </section>
  );
}

// --- Buttons ---------------------------------------------------------
function PrimaryBtn({ children, className = '', ...rest }) {
  return (
    <button className={`btn-primary rounded-full px-7 py-3.5 text-sm font-semibold tracking-tight ${className}`} {...rest}>
      {children}
    </button>
  );
}
function GhostBtn({ children, className = '', ...rest }) {
  return (
    <button className={`btn-ghost rounded-full px-7 py-3.5 text-sm font-medium tracking-tight ${className}`} {...rest}>
      {children}
    </button>
  );
}

// --- Reveal on scroll hook (handles .reveal + .stagger) --------------
function useReveal() {
  React.useEffect(() => {
    const els = document.querySelectorAll('.reveal, .stagger');
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
}

// --- Custom cursor + magnetic targets -------------------------------
function useCursor() {
  React.useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const dot = document.getElementById('cursor-dot');
    const ring = document.getElementById('cursor-ring');
    if (!dot || !ring) return;
    document.documentElement.classList.add('cursor-ready');

    let mx = innerWidth / 2, my = innerHeight / 2;
    let rx = mx, ry = my;
    const onMove = (e) => { mx = e.clientX; my = e.clientY; dot.style.transform = `translate(${mx}px,${my}px) translate(-50%,-50%)`; };
    window.addEventListener('mousemove', onMove, { passive: true });

    let raf;
    const loop = () => {
      rx += (mx - rx) * 0.18; ry += (my - ry) * 0.18;
      ring.style.transform = `translate(${rx}px,${ry}px) translate(-50%,-50%)`;
      raf = requestAnimationFrame(loop);
    };
    loop();

    // grow ring over interactive things
    const hoverSel = 'a, button, [data-magnetic], .tilt, input, [role="button"]';
    const onOver = (e) => { if (e.target.closest(hoverSel)) ring.classList.add('hover'); };
    const onOut  = (e) => { if (e.target.closest(hoverSel)) ring.classList.remove('hover'); };
    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseout', onOut);

    // magnetic pull
    const magnets = Array.from(document.querySelectorAll('[data-magnetic]'));
    const mAbort = [];
    magnets.forEach((el) => {
      const strength = parseFloat(el.getAttribute('data-magnetic')) || 0.4;
      const move = (e) => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - (r.left + r.width / 2);
        const y = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
      };
      const reset = () => { el.style.transform = 'translate(0,0)'; };
      el.addEventListener('mousemove', move);
      el.addEventListener('mouseleave', reset);
      mAbort.push(() => { el.removeEventListener('mousemove', move); el.removeEventListener('mouseleave', reset); });
    });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
      mAbort.forEach(fn => fn());
    };
  }, []);
}

// --- 3D tilt on cards ------------------------------------------------
function useTilt() {
  React.useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const cards = Array.from(document.querySelectorAll('.tilt'));
    const cleanups = [];
    cards.forEach((el) => {
      const max = parseFloat(el.getAttribute('data-tilt')) || 9;
      const move = (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `perspective(900px) rotateY(${px * max}deg) rotateX(${-py * max}deg) translateZ(0)`;
      };
      const reset = () => { el.style.transform = 'perspective(900px) rotateY(0) rotateX(0)'; };
      el.addEventListener('mousemove', move);
      el.addEventListener('mouseleave', reset);
      cleanups.push(() => { el.removeEventListener('mousemove', move); el.removeEventListener('mouseleave', reset); });
    });
    return () => cleanups.forEach(fn => fn());
  }, []);
}

// --- Scroll progress bar --------------------------------------------
function useScrollProgress() {
  React.useEffect(() => {
    const bar = document.getElementById('scroll-progress');
    if (!bar) return;
    const on = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      bar.style.width = (max > 0 ? (scrollY / max) * 100 : 0) + '%';
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); };
  }, []);
}

// --- Tiny icon set (line-only, no clichés) --------------------------
const Icon = {
  Pulse: ({ s = 22 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h4l2-7 4 14 2-7h6"/>
    </svg>
  ),
  Stack: ({ s = 22 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="5" rx="1"/><rect x="3" y="12" width="18" height="5" rx="1"/><line x1="6" y1="20" x2="18" y2="20"/>
    </svg>
  ),
  Flow: ({ s = 22 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="6" r="2"/><circle cx="19" cy="18" r="2"/><circle cx="5" cy="18" r="2"/>
      <path d="M7 6h6a4 4 0 0 1 4 4v6"/><path d="M5 8v8"/>
    </svg>
  ),
  Spark: ({ s = 22 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v4"/><path d="M12 17v4"/><path d="M3 12h4"/><path d="M17 12h4"/>
      <path d="M5.6 5.6l2.8 2.8"/><path d="M15.6 15.6l2.8 2.8"/><path d="M18.4 5.6l-2.8 2.8"/><path d="M8.4 15.6l-2.8 2.8"/>
    </svg>
  ),
  Bars: ({ s = 22 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="20" x2="5" y2="12"/><line x1="12" y1="20" x2="12" y2="6"/><line x1="19" y1="20" x2="19" y2="15"/>
    </svg>
  ),
  Link: ({ s = 22 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 15l6-6"/><path d="M10.5 6.5L13 4a4 4 0 0 1 5.7 5.7L16 12.5"/><path d="M13.5 17.5L11 20a4 4 0 0 1-5.7-5.7L8 11.5"/>
    </svg>
  ),
  Alert: ({ s = 22 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l9 16H3z"/><line x1="12" y1="10" x2="12" y2="14"/><circle cx="12" cy="17" r=".5" fill="currentColor"/>
    </svg>
  ),
  Eye: ({ s = 22 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/>
    </svg>
  ),
  Arrow: ({ s = 16 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/>
    </svg>
  ),
};

Object.assign(window, { MarkA, Wordmark, Section, PrimaryBtn, GhostBtn, useReveal, useCursor, useTilt, useScrollProgress, useSpotlight, Counter, Typed, Icon });
