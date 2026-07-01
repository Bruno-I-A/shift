/* Shift Systems · v2 — comportamento compartilhado (vanilla, zero deps) */
(function () {
  'use strict';

  /* ===== header: vira pílula ao rolar ===== */
  var header = document.getElementById('site-header');
  if (header) {
    var onScroll = function () {
      header.classList.toggle('scrolled', window.scrollY > 24);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ===== menu mobile ===== */
  var menuBtn = document.getElementById('menu-btn');
  var mobileMenu = document.getElementById('mobile-menu');
  if (menuBtn && mobileMenu) {
    var setMenu = function (open) {
      mobileMenu.classList.toggle('open', open);
      menuBtn.setAttribute('aria-expanded', String(open));
      document.body.style.overflow = open ? 'hidden' : '';
    };
    menuBtn.addEventListener('click', function () {
      setMenu(!mobileMenu.classList.contains('open'));
    });
    mobileMenu.addEventListener('click', function (e) {
      if (e.target.closest('a') || e.target === mobileMenu) setMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setMenu(false);
    });
  }

  /* ===== reveal on scroll ===== */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) {
        en.target.classList.add('in');
        io.unobserve(en.target);
      }
    });
  }, { threshold: 0.15 });
  document.querySelectorAll('.reveal, .stagger').forEach(function (el) { io.observe(el); });

  /* ===== contadores animados ===== */
  var cio = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      cio.unobserve(en.target);
      var el = en.target;
      var to = parseFloat(el.getAttribute('data-count-to') || '0');
      var dec = parseInt(el.getAttribute('data-decimals') || '0', 10);
      var dur = 1400, t0 = performance.now();
      var tick = function (t) {
        var p = Math.min(1, (t - t0) / dur);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = (to * eased).toFixed(dec);
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('[data-count-to]').forEach(function (el) { cio.observe(el); });

  /* ===== spotlight segue o cursor nos cards .spot ===== */
  document.querySelectorAll('.spot').forEach(function (card) {
    card.addEventListener('mousemove', function (e) {
      var r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });

  /* ===== easter egg: 5 cliques na marca ⇒ modo chapéu de palha (6s) =====
     quem conhece, sorri. quem não conhece, nunca vai ver.
     a navegação do logo espera 350ms: clique único navega normal;
     cliques rápidos acumulam pro egg sem sair da página. */
  var clicks = 0, lastClick = 0, opTimer = null, navTimer = null;
  document.querySelectorAll('[data-mark]').forEach(function (mark) {
    mark.addEventListener('click', function (e) {
      e.preventDefault();
      var now = Date.now();
      if (now - lastClick > 2500) clicks = 0;
      lastClick = now;
      clicks++;
      clearTimeout(navTimer);
      if (clicks >= 5) {
        clicks = 0;
        document.documentElement.classList.add('op-mode');
        clearTimeout(opTimer);
        opTimer = setTimeout(function () {
          document.documentElement.classList.remove('op-mode');
        }, 6000);
      } else {
        var href = mark.getAttribute('href');
        navTimer = setTimeout(function () {
          if (href) window.location.href = href;
        }, 350);
      }
    });
  });

  /* ===== hero "shift engine" — leve, sem libs, só pra dar vida ===== */
  (function () {
    var segsWrap = document.getElementById('hero-progress-segments');
    var pct = document.getElementById('hero-progress-pct');
    var barsWrap = document.getElementById('hero-bars');
    var log = document.getElementById('hero-log');
    if (!segsWrap && !barsWrap && !log) return;

    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (segsWrap && pct) {
      var N = 12, i = 0, segEls = [];
      for (var s = 0; s < N; s++) {
        var seg = document.createElement('span');
        seg.className = 'hero-seg';
        segsWrap.appendChild(seg);
        segEls.push(seg);
      }
      if (reduced) {
        segEls.forEach(function (el) { el.classList.add('lit'); });
        pct.textContent = '100%';
      } else {
        setInterval(function () {
          i = (i + 1) % (N + 1);
          segEls.forEach(function (el, idx) { el.classList.toggle('lit', idx < i); });
          pct.textContent = Math.round((i / N) * 100) + '%';
        }, 280);
      }
    }

    if (barsWrap) {
      var barEls = [];
      for (var b = 0; b < 7; b++) {
        var bar = document.createElement('div');
        bar.className = 'hero-bar';
        barsWrap.appendChild(bar);
        barEls.push(bar);
      }
      var randomizeBars = function () {
        barEls.forEach(function (el, idx) {
          var v = Math.round(25 + Math.random() * 70);
          el.style.height = v + '%';
          el.classList.toggle('hi', idx === barEls.length - 1 || v > 70);
        });
      };
      randomizeBars();
      if (!reduced) setInterval(randomizeBars, 1600);
    }

    if (log) {
      var events = [
        'agente-vendas → lead qualificado',
        'webhook → CRM atualizado · 200 OK',
        'cobrança → boleto emitido',
        'atendimento → resposta enviada em 4s',
        'dashboard → KPI recalculado',
        'automação → follow-up disparado'
      ];
      var idx = 0;
      var pushLog = function () {
        var line = document.createElement('div');
        line.className = 'hero-log-line';
        line.textContent = '· ' + events[idx % events.length];
        idx++;
        log.appendChild(line);
        while (log.children.length > 4) log.removeChild(log.firstChild);
      };
      pushLog(); pushLog(); pushLog();
      if (!reduced) setInterval(pushLog, 2200);
    }
  })();

  /* ===== ano do rodapé ===== */
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
})();
