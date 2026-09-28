/* Shift Systems · logo do cabeçalho, animada uma vez por carregamento.
   O "Sh" fica. O "ift" se desfaz em pontos e remonta como dado; o pingo
   do i acende em faísca — a mesma geometria de conteudo/marca/gerar-marca.js.
   Progressive enhancement: se a fonte não carregar a tempo ou o navegador
   não tiver canvas, o <img> estático que já está no HTML continua valendo. */
(function () {
  'use strict';
  var alvos = document.querySelectorAll('a[data-mark] > img.brand-logo');
  if (!alvos.length || !window.CanvasRenderingContext2D || !document.fonts) return;

  var SERIF = '"Shift Serif", Georgia, serif';
  var INK = '#f4f1e8', GOLD = '#f2a63d', TITTLE = '#ffc93d';
  var GLIFOS = {
    i: ['...', '.o.', '...', 'XX.', '.X.', '.X.', '.X.', '.X.', 'XXX'],
    f: ['..XX', '.X..', '.X..', 'XXXX', '.X..', '.X..', '.X..', '.X..', 'XXX.'],
    t: ['....', '.X..', '.X..', 'XXXX', '.X..', '.X..', '.X..', '.X..', '..XX']
  };
  var T = 1650; /* duração total da entrada, em ms */

  var media = matchMedia('(prefers-reduced-motion: reduce)');
  function paradoAgora() {
    return media.matches || document.documentElement.classList.contains('motion-paused');
  }

  function montar(ctx, px) {
    ctx.font = '400 ' + px + 'px ' + SERIF;
    var larg = function (s) { return ctx.measureText(s).width; };
    var asc = ctx.measureText('h').actualBoundingBoxAscent;
    var c = asc / 9, r = c * 0.41;
    var wSh = larg('Sh');
    var letras = ['i', 'f', 't'].map(function (ch, j) {
      var antes = 'Sh' + 'ift'.slice(0, j);
      var x0 = larg(antes);
      return { ch: ch, x: x0, w: larg(antes + ch) - x0 };
    });
    var x0 = wSh + c * 0.35, cx = x0, alvos2 = [];
    ['i', 'f', 't'].forEach(function (ch, j) {
      var g = GLIFOS[ch];
      g.forEach(function (linha, row) {
        for (var col = 0; col < linha.length; col++) {
          var v = linha.charAt(col);
          if (v === '.') continue;
          alvos2.push({ j: j, x: cx + col * c + c / 2, y: -(8 - row) * c - c / 2, pingo: v === 'o' });
        }
      });
      cx += g[0].length * c + c;
    });
    return { px: px, c: c, r: r, asc: asc, wSh: wSh, letras: letras, alvos: alvos2, largura: cx - c, larguraSerif: larg('Shift') };
  }

  function amostrar(M) {
    var pad = M.c * 2;
    var W = Math.ceil(M.larguraSerif + pad * 2), H = Math.ceil(M.asc * 1.6 + pad);
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var g = cv.getContext('2d');
    var base = Math.round(M.asc + pad / 2);
    var x0 = M.wSh + M.c * 0.35, h = M.c / 2;
    return M.letras.map(function (L) {
      g.clearRect(0, 0, W, H);
      g.font = '400 ' + M.px + 'px ' + SERIF; g.fillStyle = '#000';
      g.fillText(L.ch, pad + L.x, base);
      var dados = g.getImageData(0, 0, W, H).data;
      var pts = [];
      var k0 = Math.floor((L.x - M.c - x0) / h), k1 = Math.ceil((L.x + L.w + M.c - x0) / h);
      for (var k = k0; k <= k1; k++) for (var row = -2; row <= 19; row++) {
        var x = x0 + k * h + h / 2, y = -(17 - row) * h - h / 2;
        var px2 = Math.round(pad + x), py2 = Math.round(base + y);
        if (px2 < 0 || py2 < 0 || px2 >= W || py2 >= H) continue;
        if (dados[(py2 * W + px2) * 4 + 3] > 110) pts.push({ x: x, y: y });
      }
      return pts;
    });
  }

  function parear(M, fontes) {
    var ord = function (a, b) { return (a.y - b.y) || (a.x - b.x); };
    var pares = [], sobras = [];
    [0, 1, 2].forEach(function (j) {
      var src = fontes[j].slice().sort(ord);
      var tgt = M.alvos.filter(function (a) { return a.j === j; }).sort(ord);
      var usados = {};
      tgt.forEach(function (t, k) {
        var idx = src.length ? Math.round(k * (src.length - 1) / Math.max(1, tgt.length - 1)) : -1;
        var s = idx >= 0 ? src[idx] : { x: t.x, y: t.y };
        usados[idx] = true;
        pares.push({ j: j, sx: s.x, sy: s.y, tx: t.x, ty: t.y, pingo: t.pingo });
      });
      src.forEach(function (s, idx) { if (!usados[idx]) sobras.push({ j: j, x: s.x, y: s.y }); });
    });
    return { pares: pares, sobras: sobras };
  }

  var clamp = function (v) { return Math.max(0, Math.min(1, v)); };
  var ease = function (v) { return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  function mix(a, b, k) {
    var pa = [1, 3, 5].map(function (i) { return parseInt(a.substr(i, 2), 16); });
    var pb = [1, 3, 5].map(function (i) { return parseInt(b.substr(i, 2), 16); });
    return 'rgb(' + pa.map(function (v, i) { return Math.round(v + (pb[i] - v) * k); }).join(',') + ')';
  }

  function faisca(ctx, x, y, u, rr, k) {
    if (k <= 0) return;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
      ctx.beginPath(); ctx.arc(x + d[0] * u * 0.8 * k, y + d[1] * u * 0.8 * k, rr * 0.72 * k, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(x + d[0] * u * 1.45 * k, y + d[1] * u * 1.45 * k, rr * 0.42 * k, 0, 7); ctx.fill();
    });
  }

  function estado(t, j) {
    var s = j * 130;
    var a = clamp((t - 260 - s) / 320), mv = clamp((t - 480 - s) / 780);
    return { a: ease(a), m: ease(mv) };
  }

  function iniciar(img) {
    var w = img.width, h = img.height, dpr = Math.min(2, window.devicePixelRatio || 1);
    var cv = document.createElement('canvas');
    cv.className = img.className;
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', img.alt || 'Shift');
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var px = Math.min(w * 0.42, h * 1.9);
    var M = montar(ctx, px);
    var P = parear(M, amostrar(M));
    var ox = 4, base = h - (h - M.asc) / 2;

    function frame(t) {
      ctx.clearRect(0, 0, w, h);
      ctx.save(); ctx.translate(ox, base);
      ctx.font = '400 ' + px + 'px ' + SERIF; ctx.fillStyle = INK; ctx.textBaseline = 'alphabetic';
      ctx.fillText('Sh', 0, 0);
      M.letras.forEach(function (L, j) {
        var e = estado(t, j);
        if (e.a < 1) { ctx.globalAlpha = 1 - e.a; ctx.fillText(L.ch, L.x, 0); ctx.globalAlpha = 1; }
      });
      P.sobras.forEach(function (p) {
        var e = estado(t, p.j), rr = M.r * 0.6 * e.a * (1 - e.m);
        if (rr > 0.15) { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, 7); ctx.fill(); }
      });
      P.pares.forEach(function (p) {
        var e = estado(t, p.j);
        if (e.a <= 0) return;
        var x = p.sx + (p.tx - p.sx) * e.m, y = p.sy + (p.ty - p.sy - (p.pingo ? M.c * 0.2 : 0)) * e.m;
        ctx.fillStyle = mix(INK, p.pingo ? TITTLE : GOLD, e.m);
        ctx.beginPath(); ctx.arc(x, y, M.r * e.a * (0.6 + 0.4 * e.m) * (p.pingo ? 1 + 0.2 * e.m : 1), 0, 7); ctx.fill();
        if (p.pingo) { ctx.fillStyle = TITTLE; faisca(ctx, x, y, M.c, M.r, ease(clamp((e.m - 0.82) / 0.18))); }
      });
      ctx.restore();
    }

    var t0 = null, rafId = null;
    function tick(now) {
      if (t0 === null) t0 = now;
      var t = now - t0;
      if (paradoAgora()) t = T; /* pulado: mostra o quadro final direto */
      frame(Math.min(t, T));
      if (t < T) { rafId = requestAnimationFrame(tick); }
    }
    function pararNoFinal() {
      if (rafId) cancelAnimationFrame(rafId);
      frame(T);
    }
    window.addEventListener('shift:motion', function (e) { if (e.detail && e.detail.paused) pararNoFinal(); });

    img.replaceWith(cv);
    if (paradoAgora()) { frame(T); } else { requestAnimationFrame(tick); }
  }

  /* A fonte cobre só S, f, h, i, t — o bastante para a palavra "Shift".
     Timeout curto: se travar, a página segue com o <img> estático. */
  var pronto = false;
  Promise.race([
    document.fonts.load('400 100px ' + SERIF).then(function () { return document.fonts.ready; }),
    new Promise(function (_, rej) { setTimeout(rej, 1200); })
  ]).then(function () {
    pronto = true;
    alvos.forEach(iniciar);
  }).catch(function () { /* fica o <img> */ });
})();
