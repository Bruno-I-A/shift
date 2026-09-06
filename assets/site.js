/* Shift Systems · v2 — comportamento compartilhado (vanilla, zero deps) */
(function () {
  'use strict';
  window.shiftReady = true;
  var motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');

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
    mobileMenu.inert = true;
    mobileMenu.setAttribute('aria-hidden', 'true');
    var main = document.querySelector('main');
    var footer = document.querySelector('footer');
    var setMenu = function (open) {
      mobileMenu.classList.toggle('open', open);
      mobileMenu.inert = !open;
      mobileMenu.setAttribute('aria-hidden', String(!open));
      menuBtn.setAttribute('aria-expanded', String(open));
      menuBtn.setAttribute('aria-label', open ? 'fechar menu' : 'abrir menu');
      document.body.style.overflow = open ? 'hidden' : '';
      if (main) main.inert = open;
      if (footer) footer.inert = open;
      if (open) mobileMenu.querySelector('a').focus();
      else menuBtn.focus();
    };
    menuBtn.addEventListener('click', function () {
      setMenu(!mobileMenu.classList.contains('open'));
    });
    mobileMenu.addEventListener('click', function (e) {
      if (e.target.closest('a') || e.target === mobileMenu) setMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (!mobileMenu.classList.contains('open')) return;
      if (e.key === 'Escape') setMenu(false);
      if (e.key === 'Tab') {
        var links = Array.from(mobileMenu.querySelectorAll('a'));
        var focusables = [menuBtn].concat(links);
        var first = focusables[0], last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    window.matchMedia('(min-width: 768px)').addEventListener('change', function (e) {
      if (e.matches && mobileMenu.classList.contains('open')) setMenu(false);
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
  }, { threshold: 0.04 });
  document.querySelectorAll('.reveal, .stagger, [data-draw]').forEach(function (el) { io.observe(el); });

  /* ===== barra de progresso de leitura ===== */
  var prog = document.getElementById('scroll-progress');
  if (prog) {
    var progTicking = false;
    var updateProg = function () {
      progTicking = false;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      prog.style.transform = 'scaleX(' + (max > 0 ? window.scrollY / max : 0) + ')';
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
      if (motionPreference.matches || document.documentElement.classList.contains('motion-paused')) { el.textContent = to.toFixed(dec); return; }
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
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;
    keyBuf = (keyBuf + e.key.toLowerCase()).slice(-6);
    if (keyBuf === 'nakama') { keyBuf = ''; raiseFlag(10000); }
  });

  /* recado no console pra quem abre o capô */
  try {
    console.log('%c⚓ Shift Systems', 'color:#B56BFF;font-weight:bold;font-size:14px;');
    console.log('%cProcura-se: operação manual. Recompensa: suas horas de volta.\nDica de tripulação: digite "nakama" nesta página.', 'color:#FFC93D;');
  } catch (err) { /* console indisponível — segue o jogo */ }

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
