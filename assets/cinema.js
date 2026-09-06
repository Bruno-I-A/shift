/* One native-scroll frame per event. No scroll interception or animation library. */
(() => {
  'use strict';
  const root = document.documentElement;
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const button = document.getElementById('motion-toggle');
  let userPaused = false;
  try { userPaused = sessionStorage.getItem('shift-motion') === 'paused'; } catch {}
  let paused = media.matches || userPaused;
  let pending = false;
  let activeLeg = -1;
  const opening = document.querySelector('.opening');
  const image = document.querySelector('.brand-shot');
  const copy = document.querySelector('.opening-copy');
  const arrival = document.querySelector('.arrival');
  const arrivalArt = document.querySelector('.arrival-art');
  const chart = document.querySelector('.navigation-chart');
  const path = document.getElementById('voyage-path');
  const vessel = document.getElementById('route-vessel');
  const chartStatus = document.getElementById('chart-current');
  const legs = [...document.querySelectorAll('[data-leg]')];
  const points = [...document.querySelectorAll('[data-waypoint]')];
  const stages = ['Diagnóstico', 'A solução certa', 'Construção', 'Mar aberto'];
  const length = path?.getTotalLength() || 0;
  const statement = document.querySelector('[data-ink]');
  const words = [];
  if (statement) {
    const content = statement.textContent.trim().split(/\s+/);
    statement.replaceChildren();
    content.forEach((word, i) => {
      const span = document.createElement('span');
      span.className = 'ink-word';
      span.textContent = word;
      statement.append(span);
      if (i < content.length - 1) statement.append(' ');
      words.push(span);
    });
  }
  const clamp = (n, min = 0, max = 1) => Math.max(min, Math.min(max, n));

  function frame() {
    pending = false;
    if (document.hidden) return;
    const height = window.innerHeight;
    const small = window.innerWidth < 768;
    if (opening && !paused) {
      const rect = opening.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < height) {
        const progress = clamp(-rect.top / Math.max(1, rect.height - height));
        image.style.setProperty('--brand-y', `${progress * 65}px`);
        image.style.setProperty('--brand-scale', `${1 + progress * .12}`);
        copy.style.setProperty('--copy-y', `${-progress * (small ? 20 : 48)}px`);
        copy.style.setProperty('--copy-opacity', `${1 - progress * .9}`);
      }
    }
    if (statement) {
      const rect = statement.getBoundingClientRect();
      const progress = paused ? 1 : clamp((height * .85 - rect.top) / (height * .48));
      words.forEach((word, i) => word.classList.toggle('is-lit', i < Math.ceil(progress * words.length)));
    }
    if (legs.length) {
      const rectangles = legs.map(leg => leg.getBoundingClientRect());
      let nearest = 0;
      let distance = Infinity;
      rectangles.forEach((rect, i) => {
        const d = Math.abs(rect.top + rect.height / 2 - height * .53);
        if (d < distance) { nearest = i; distance = d; }
      });
      if (nearest !== activeLeg) {
        activeLeg = nearest;
        legs.forEach((leg, i) => leg.classList.toggle('is-active', i === nearest));
        points.forEach((point, i) => point.classList.toggle('is-active', i <= nearest));
        if (chartStatus) chartStatus.textContent = `0${nearest + 1} / ${stages[nearest]}`;
      }
      const first = rectangles[0].top + rectangles[0].height * .35;
      const last = rectangles[3].top + rectangles[3].height * .5;
      const progress = paused || small ? 1 : clamp((height * .53 - first) / Math.max(1, last - first));
      chart.style.setProperty('--route-offset', `${1 - progress}`);
      chart.style.setProperty('--chart-angle', `${paused ? 0 : progress * 16}deg`);
      if (length) {
        const p = path.getPointAtLength(length * progress);
        const q = path.getPointAtLength(Math.min(length, length * progress + 2));
        const angle = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI + 90;
        vessel.setAttribute('transform', `translate(${p.x},${p.y}) rotate(${angle})`);
      }
    }
    if (arrival && !paused) {
      const rect = arrival.getBoundingClientRect();
      if (rect.top < height && rect.bottom > 0) {
        arrivalArt.style.setProperty('--arrival-y', `${clamp((height - rect.top) / (height + rect.height)) * 65 - 32}px`);
      }
    }
  }
  function schedule() {
    if (!pending) { pending = true; requestAnimationFrame(frame); }
  }
  function syncMotion() {
    paused = media.matches || userPaused;
    root.classList.toggle('motion-paused', paused);
    if (button) {
      button.hidden = media.matches;
      button.setAttribute('aria-pressed', String(paused));
      button.setAttribute('aria-label', paused ? 'Ativar animações' : 'Pausar animações');
      button.querySelector('.motion-text').textContent = paused ? 'Ativar movimento' : 'Pausar movimento';
      button.querySelector('.motion-symbol').textContent = paused ? '▷' : 'Ⅱ';
    }
    window.dispatchEvent(new CustomEvent('shift:motion', { detail: { paused } }));
    schedule();
  }
  button?.addEventListener('click', () => {
    userPaused = !userPaused;
    try { sessionStorage.setItem('shift-motion', userPaused ? 'paused' : 'active'); } catch {}
    syncMotion();
  });
  media.addEventListener('change', syncMotion);
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  document.addEventListener('visibilitychange', () => {
    root.classList.toggle('page-sleeping', document.hidden);
    if (!document.hidden) schedule();
  });
  const visibility = new IntersectionObserver(entries => {
    entries.forEach(entry => entry.target.classList.toggle('in-view', entry.isIntersecting));
  }, { threshold: .08 });
  document.querySelectorAll('.opening,.solution-row').forEach(el => visibility.observe(el));
  // Keyboard Easter egg is still handled in site.js; this carries it into the final frame.
  const crew = document.querySelector('.crew-message');
  if (crew) {
    new MutationObserver(() => {
      crew.textContent = root.classList.contains('op-mode')
        ? 'O sonho de uma boa tripulação nunca tem fim. Bem-vindo a bordo, nakama.'
        : 'Toda grande jornada começa com uma boa tripulação.';
    }).observe(root, { attributes: true, attributeFilter: ['class'] });
  }
  root.classList.add('motion-ready');
  syncMotion();
  frame();
})();
