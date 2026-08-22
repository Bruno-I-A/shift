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
  document.querySelectorAll('.reveal, .stagger, [data-draw]').forEach(function (el) { io.observe(el); });

  /* ===== barra de progresso de leitura ===== */
  var prog = document.getElementById('scroll-progress');
  if (prog) {
    var progTicking = false;
    var updateProg = function () {
      progTicking = false;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      prog.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + '%';
    };
    window.addEventListener('scroll', function () {
      if (!progTicking) { progTicking = true; requestAnimationFrame(updateProg); }
    }, { passive: true });
    updateProg();
  }


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

  /* ===== easter eggs: modo chapéu de palha =====
     quem conhece, sorri. quem não conhece, nunca vai ver. */
  var opTimer = null;
  function raiseFlag(ms) {
    document.documentElement.classList.add('op-mode');
    clearTimeout(opTimer);
    opTimer = setTimeout(function () {
      document.documentElement.classList.remove('op-mode');
    }, ms || 6000);
  }

  /* gatilho 1: 5 cliques rápidos na marca.
     a navegação do logo espera 350ms: clique único navega normal;
     cliques rápidos acumulam pro egg sem sair da página. */
  var clicks = 0, lastClick = 0, navTimer = null;
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
        raiseFlag(6000);
      } else {
        var href = mark.getAttribute('href');
        navTimer = setTimeout(function () {
          if (href) window.location.href = href;
        }, 350);
      }
    });
  });

  /* gatilho 2: digitar "nakama" em qualquer página */
  var keyBuf = '';
  document.addEventListener('keydown', function (e) {
    if (!e.key || e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    keyBuf = (keyBuf + e.key.toLowerCase()).slice(-6);
    if (keyBuf === 'nakama') { keyBuf = ''; raiseFlag(10000); }
  });

  /* recado no console pra quem abre o capô */
  try {
    console.log('%c⚓ Shift Systems', 'color:#B56BFF;font-weight:bold;font-size:14px;');
    console.log('%cProcura-se: operação manual. Recompensa: suas horas de volta.\nDica de tripulação: digite "nakama" nesta página.', 'color:#FFC93D;');
  } catch (err) { /* console indisponível — segue o jogo */ }

  /* ===== hero "shift engine" — painel de exemplo, estático =====
     Nada aqui roda em loop de propósito. Uma barra de progresso que volta
     a zero a cada 3,6s e um gráfico que se reembaralha a cada 1,6s leem
     como integração quebrada, e o desconto de credibilidade contamina os
     números reais da página. Preenche uma vez, quando o painel revela. */
  (function () {
    var panel = document.querySelector('.reveal.d-panel');
    var segsWrap = document.getElementById('hero-progress-segments');
    var pct = document.getElementById('hero-progress-pct');
    var barsWrap = document.getElementById('hero-bars');
    var log = document.getElementById('hero-log');
    if (!segsWrap && !barsWrap && !log) return;

    var N = 12, segEls = [];
    if (segsWrap) {
      for (var s = 0; s < N; s++) {
        var seg = document.createElement('span');
        seg.className = 'hero-seg';
        segsWrap.appendChild(seg);
        segEls.push(seg);
      }
    }

    var barEls = [];
    /* semana de exemplo, fixa — dado que muda sozinho não é dado */
    var week = [38, 52, 45, 68, 61, 29, 74];
    if (barsWrap) {
      for (var b = 0; b < week.length; b++) {
        var bar = document.createElement('div');
        bar.className = 'hero-bar';
        barsWrap.appendChild(bar);
        barEls.push(bar);
      }
    }

    var events = [
      'agente-vendas → lead qualificado',
      'webhook → CRM atualizado · 200 OK',
      'cobrança → boleto emitido',
      'atendimento → resposta enviada em 4s'
    ];

    var filled = false;
    var fill = function () {
      if (filled) return;
      filled = true;
      segEls.forEach(function (el) { el.classList.add('lit'); });
      if (pct) pct.textContent = '100%';
      barEls.forEach(function (el, idx) {
        el.style.height = week[idx] + '%';
        el.classList.toggle('hi', week[idx] > 65);
      });
      if (log) {
        events.forEach(function (txt) {
          var line = document.createElement('div');
          line.className = 'hero-log-line';
          line.textContent = '· ' + txt;
          log.appendChild(line);
        });
      }
    };

    if (panel && 'IntersectionObserver' in window) {
      var pio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          pio.unobserve(en.target);
          setTimeout(fill, 320);
        });
      }, { threshold: 0.2 });
      pio.observe(panel);
    } else {
      fill();
    }
  })();

  /* ===== banner de cookies — DESATIVADO por padrão =====
     o site hoje não usa cookies de rastreamento, então não há banner.
     no dia que adicionar analytics/pixel, ligue com UMA linha antes do site.js:
       <script>window.SHIFT_ENABLE_COOKIE_BANNER = true;</script>
     e carregue os scripts de medição apenas se window.shiftConsent() === 'all'. */
  (function () {
    if (window.SHIFT_ENABLE_COOKIE_BANNER !== true) return;
    var KEY = 'shift-consent';
    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (err) { /* storage bloqueado */ }
    window.shiftConsent = function () { return saved; };
    if (saved) return;

    var el = document.createElement('div');
    el.id = 'cookie-banner';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Aviso de cookies');
    el.innerHTML =
      '<p>A gente usa cookies só para medir o que funciona no site e melhorar sua experiência. ' +
      'Você decide: <a href="privacidade.html">política de privacidade</a>.</p>' +
      '<div class="cb-actions">' +
      '<button data-consent="all" class="btn-primary rounded-full px-6 py-2.5 text-sm font-medium">Aceitar cookies</button>' +
      '<button data-consent="essential" class="btn-ghost rounded-full px-6 py-2.5 text-sm">Só o essencial</button>' +
      '</div>';
    document.body.appendChild(el);

    function choose(v) {
      saved = v;
      try { localStorage.setItem(KEY, v); } catch (err) { /* storage bloqueado */ }
      el.remove();
      window.dispatchEvent(new CustomEvent('shift:consent', { detail: v }));
    }
    el.querySelector('[data-consent="all"]').addEventListener('click', function () { choose('all'); });
    el.querySelector('[data-consent="essential"]').addEventListener('click', function () { choose('essential'); });
  })();

  /* ===== ano do rodapé ===== */
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
})();
