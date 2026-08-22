// Shift Systems · hero canvas
// O improviso entra disperso, atravessa a marca e sai organizado em sistema.
(function () {
  'use strict';

  class HeroShift extends HTMLElement {
    connectedCallback() {
      if (this._connected) return;
      this._connected = true;

      Object.assign(this.style, { display: 'block', width: '100%', height: '100%' });
      this.textContent = '';
      var canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%' });
      this.appendChild(canvas);

      var ctx = canvas.getContext('2d');
      if (!ctx) {
        this.parentElement && this.parentElement.classList.add('hero-visual-ready');
        return;
      }

      var w = 1;
      var h = 1;
      var rect = { left: 0, top: 0, width: 1, height: 1 };
      var redraw = null;
      var ready = false;

      var markReady = () => {
        if (ready) return;
        ready = true;
        this.parentElement && this.parentElement.classList.add('hero-visual-ready');
      };

      // Gerador determinístico: o primeiro quadro não muda a cada carregamento.
      var seed = 0x51f7a2;
      var random = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      var rnd = (a, b) => a + random() * (b - a);
      var clamp = (value, min, max) => Math.max(min, Math.min(max, value));
      var smoothstep = (a, b, value) => {
        var x = clamp((value - a) / (b - a), 0, 1);
        return x * x * (3 - 2 * x);
      };

      var LANES = [-0.72, -0.36, 0, 0.36, 0.72];
      var parts = [];
      var mk = (left) => {
        var x = left ? rnd(-3.6, -1.1) : rnd(-3.6, 3.05);
        var lane = LANES[(random() * LANES.length) | 0];
        var order = smoothstep(-0.62, 0.5, x);
        var looseY = rnd(-1.05, 1.05);
        var looseZ = rnd(-0.8, 0.8);
        return {
          x: x,
          y: looseY * (1 - order) + lane * order,
          z: looseZ * (1 - order),
          lane: lane,
          speed: rnd(0.26, 0.48),
          phase: random() * Math.PI * 2,
          drift: rnd(0.12, 0.32),
          frequency: rnd(0.72, 1.45)
        };
      };
      var syncParticleCount = () => {
        var target = w < 700 ? 150 : w < 1100 ? 220 : 280;
        while (parts.length < target) parts.push(mk(false));
        if (parts.length > target) parts.length = target;
      };

      var fit = () => {
        rect = this.getBoundingClientRect();
        w = Math.max(1, rect.width);
        h = Math.max(1, rect.height);
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        syncParticleCount();
        if (redraw) redraw();
      };
      fit();

      if ('ResizeObserver' in window) {
        this._ro = new ResizeObserver(fit);
        this._ro.observe(this);
      } else {
        this._onResize = fit;
        window.addEventListener('resize', fit, { passive: true });
      }

      // O ponteiro atua apenas quando está sobre a própria hero.
      var tx = 0;
      var ty = 0;
      var mx = 0;
      var my = 0;
      var active = 0;
      var onMove = (event) => {
        rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        // O cursor só inclina a peça alguns graus; o fluxo continua sendo o
        // protagonista e não acompanha cada tremor do ponteiro.
        tx = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -0.62, 0.62);
        ty = clamp(((event.clientY - rect.top) / rect.height) * 2 - 1, -0.62, 0.62);
        active = 1;
      };
      var onLeave = () => {
        active = 0;
        tx = 0;
        ty = 0;
      };
      this._onMove = onMove;
      this._onLeave = onLeave;
      this.addEventListener('pointermove', onMove, { passive: true });
      this.addEventListener('pointerleave', onLeave, { passive: true });

      // Geometria da marca existente, normalizada a partir do favicon.
      var normalize = (x, y) => [(x - 50) / 50, (50 - y) / 50];
      var polygon = (points) => points.map((point) => normalize(point[0], point[1]));
      // Silhueta única da marca. Antes os três pedaços eram extrudados e
      // contornados separadamente; em perspectiva as arestas internas
      // apareciam como rachaduras e a peça deixava de ler como um S.
      var silhouette = polygon([
        [24, 16], [86, 16], [86, 31], [48.88, 31],
        [67.12, 69], [76, 69], [76, 84], [14, 84],
        [14, 69], [44.08, 69], [31.92, 31], [24, 31]
      ]);
      var depth = 0.2;
      var FRONT = [122, 66, 196];
      var SIDE = [72, 34, 124];
      var BACK = [44, 20, 78];
      var COOL = [168, 196, 240];
      var WARM = [255, 214, 120];
      var channel = (value) => clamp(Math.round(value), 0, 255);
      var rgba = (color, multiplier, opacity) =>
        'rgba(' + channel(color[0] * multiplier) + ',' + channel(color[1] * multiplier) + ',' + channel(color[2] * multiplier) + ',' + opacity + ')';
      var mixColor = (from, to, amount) => [
        from[0] + (to[0] - from[0]) * amount,
        from[1] + (to[1] - from[1]) * amount,
        from[2] + (to[2] - from[2]) * amount
      ];
      var light = (() => {
        var vector = [-0.45, 0.72, 0.75];
        var length = Math.hypot.apply(null, vector);
        return vector.map((value) => value / length);
      })();

      var draw = (time, dt) => {
        mx += (tx - mx) * Math.min(1, 4 * dt);
        my += (ty - my) * Math.min(1, 4 * dt);
        ctx.clearRect(0, 0, w, h);

        var scale = Math.min(h * 0.36, w * 0.24);
        var cx = w * 0.5 + mx * scale * 0.055;
        var cy = h * 0.5 + my * scale * 0.035;
        var project = (point) => {
          var k = 3.4 / (3.4 - point[2]);
          return [cx + point[0] * scale * k, cy - point[1] * scale * k, k];
        };

        // Halo com respiração quase imperceptível.
        var pulse = 0.96 + Math.sin(time * 0.85) * 0.04;
        var halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale * 3.2 * pulse);
        halo.addColorStop(0, 'rgba(138,77,204,0.24)');
        halo.addColorStop(0.42, 'rgba(242,166,61,0.075)');
        halo.addColorStop(1, 'rgba(10,20,40,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(0, 0, w, h);

        // Plano de transformação: marca o ponto em que o fluxo encontra a Shift.
        var planeTop = project([0, 1.18, 0]);
        var planeBottom = project([0, -1.18, 0]);
        var planeGradient = ctx.createLinearGradient(planeTop[0], planeTop[1], planeBottom[0], planeBottom[1]);
        planeGradient.addColorStop(0, 'rgba(181,107,255,0)');
        planeGradient.addColorStop(0.5, 'rgba(181,107,255,0.2)');
        planeGradient.addColorStop(1, 'rgba(242,166,61,0)');
        ctx.strokeStyle = planeGradient;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(planeTop[0], planeTop[1]);
        ctx.lineTo(planeBottom[0], planeBottom[1]);
        ctx.stroke();

        // Trilhas aparecem gradualmente depois da marca.
        LANES.forEach((lane) => {
          var start = project([0.18, lane, 0]);
          var end = project([3.2, lane, 0]);
          var guide = ctx.createLinearGradient(start[0], start[1], end[0], end[1]);
          guide.addColorStop(0, 'rgba(242,166,61,0.2)');
          guide.addColorStop(0.68, 'rgba(242,166,61,0.09)');
          guide.addColorStop(1, 'rgba(242,166,61,0)');
          ctx.strokeStyle = guide;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(start[0], start[1]);
          ctx.lineTo(end[0], end[1]);
          ctx.stroke();
        });

        // A organização começa antes da marca e termina depois dela: sem salto.
        parts.forEach((part) => {
          var order = smoothstep(-0.62, 0.5, part.x);
          var chaos = 1 - order;
          var pointerPull = active * 0.42 * smoothstep(-2.7, -0.15, part.x) * (1 - smoothstep(-0.15, 0.4, part.x));
          part.x += part.speed * (1 + 0.15 * active * Math.max(0, mx)) * dt;
          part.y += Math.sin(time * part.frequency + part.phase) * part.drift * chaos * dt;
          part.z += Math.cos(time * (part.frequency * 0.78) + part.phase * 1.7) * part.drift * 0.74 * chaos * dt;
          part.y += (-my * 0.42 - part.y) * 1.1 * pointerPull * dt;
          part.z += (mx * 0.24 - part.z) * 0.72 * pointerPull * dt;

          var align = (1.2 + 4.8 * order) * order;
          part.y += (part.lane - part.y) * Math.min(1, align * dt);
          part.z += (0 - part.z) * Math.min(1, align * dt);
          part.y = clamp(part.y, -1.24, 1.24);
          part.z = clamp(part.z, -0.92, 0.92);

          if (part.x > 3.12) Object.assign(part, mk(true));
        });

        var drawParticle = (part) => {
          var point = project([part.x, part.y, part.z]);
          var order = smoothstep(-0.62, 0.5, part.x);
          var color = mixColor(COOL, WARM, order);
          var opacity = 0.42 + 0.48 * order;
          var radius = (1.45 + 0.65 * order) * point[2];
          ctx.fillStyle = rgba(color, 1, opacity);
          ctx.beginPath();
          ctx.arc(point[0], point[1], radius, 0, Math.PI * 2);
          ctx.fill();

          if (order > 0.08) {
            var trailLength = 0.08 + 0.22 * order;
            var trail = project([Math.max(-0.62, part.x - trailLength), part.y, part.z]);
            ctx.strokeStyle = 'rgba(255,201,61,' + (0.08 + 0.24 * order) + ')';
            ctx.lineWidth = Math.max(0.7, point[2]);
            ctx.beginPath();
            ctx.moveTo(trail[0], trail[1]);
            ctx.lineTo(point[0], point[1]);
            ctx.stroke();
          }
        };

        parts.forEach((part) => { if (part.z < -0.02) drawParticle(part); });

        // Marca extrudada em 3D com entrada suave e resposta limitada ao ponteiro.
        var intro = 1 - Math.pow(1 - clamp(time / 1.15, 0, 1), 3);
        var markScale = 0.9 + intro * 0.1;
        var ay = 0.3 + Math.sin(time * 0.26) * 0.14 + mx * 0.12;
        var ax = -0.14 + Math.sin(time * 0.17) * 0.035 - my * 0.08;
        var cosY = Math.cos(ay);
        var sinY = Math.sin(ay);
        var cosX = Math.cos(ax);
        var sinX = Math.sin(ax);
        var rotate = (x, y, z) => {
          x *= markScale;
          y *= markScale;
          z *= markScale;
          var x1 = x * cosY + z * sinY;
          var z1 = -x * sinY + z * cosY;
          return [x1, y * cosX - z1 * sinX, y * sinX + z1 * cosX];
        };
        var faces = [];
        var front = silhouette.map((point) => rotate(point[0], point[1], depth));
        var back = silhouette.map((point) => rotate(point[0], point[1], -depth));
        faces.push({ points: front, kind: 'front' });
        faces.push({ points: back.slice().reverse(), kind: 'back' });
        for (var i = 0; i < silhouette.length; i++) {
          var next = (i + 1) % silhouette.length;
          faces.push({ points: [front[i], front[next], back[next], back[i]], kind: 'side' });
        }
        faces.forEach((face) => {
          face.z = face.points.reduce((total, point) => total + point[2], 0) / face.points.length;
          var a = face.points[0];
          var b = face.points[1];
          var c = face.points[2];
          var u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
          var v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
          var normal = [
            u[1] * v[2] - u[2] * v[1],
            u[2] * v[0] - u[0] * v[2],
            u[0] * v[1] - u[1] * v[0]
          ];
          var length = Math.hypot.apply(null, normal) || 1;
          face.light = Math.max(0, (normal[0] * light[0] + normal[1] * light[1] + normal[2] * light[2]) / length);
        });
        // A face frontal única sempre fecha a peça por último. Ordenar apenas
        // pela média de profundidade fazia uma lateral passar por cima dela
        // em certos ângulos, criando os “quebres” que apareciam ao mover o
        // cursor.
        faces.sort((a, b) => {
          if (a.kind === 'front' && b.kind !== 'front') return 1;
          if (b.kind === 'front' && a.kind !== 'front') return -1;
          return a.z - b.z;
        });

        faces.forEach((face) => {
          var points = face.points.map(project);
          ctx.save();
          ctx.globalAlpha = intro;
          ctx.beginPath();
          points.forEach((point, index) => {
            if (index) ctx.lineTo(point[0], point[1]);
            else ctx.moveTo(point[0], point[1]);
          });
          ctx.closePath();

          var base = face.kind === 'front' ? FRONT : face.kind === 'side' ? SIDE : BACK;
          var multiplier = 0.62 + 0.72 * face.light;
          if (face.kind === 'front') {
            var xs = points.map((point) => point[0]);
            var ys = points.map((point) => point[1]);
            var faceGradient = ctx.createLinearGradient(Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys));
            faceGradient.addColorStop(0, rgba(base, multiplier * 1.22, 1));
            faceGradient.addColorStop(1, rgba(base, multiplier * 0.78, 1));
            ctx.fillStyle = faceGradient;
            ctx.shadowColor = 'rgba(181,107,255,0.22)';
            ctx.shadowBlur = 18;
          } else {
            ctx.fillStyle = rgba(base, multiplier, face.kind === 'back' ? 0.9 : 1);
          }
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = 'rgba(196,150,255,' + (0.1 + 0.34 * face.light) + ')';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
        });

        parts.forEach((part) => { if (part.z >= -0.02) drawParticle(part); });
        markReady();
      };

      var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var last = performance.now();
      var time = reduced ? 4.5 : 0;
      var running = false;
      var visible = true;
      var pageVisible = !document.hidden;

      redraw = () => draw(time, 0);

      var loop = (now) => {
        if (!running) return;
        var dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
        last = now;
        time += dt;
        draw(time, dt);
        this._raf = requestAnimationFrame(loop);
      };
      var start = () => {
        if (reduced) {
          draw(time, 0);
          return;
        }
        if (running || !visible || !pageVisible) return;
        running = true;
        last = performance.now();
        this._raf = requestAnimationFrame(loop);
      };
      var stop = () => {
        running = false;
        cancelAnimationFrame(this._raf);
      };
      var syncPlayback = () => {
        if (visible && pageVisible) start();
        else stop();
      };

      this._onVisibility = () => {
        pageVisible = !document.hidden;
        syncPlayback();
      };
      document.addEventListener('visibilitychange', this._onVisibility);

      if ('IntersectionObserver' in window) {
        this._io = new IntersectionObserver((entries) => {
          visible = entries[0] ? entries[0].isIntersecting : true;
          if (!visible) onLeave();
          syncPlayback();
        }, { rootMargin: '120px 0px' });
        this._io.observe(this);
      }

      start();
    }

    disconnectedCallback() {
      this._connected = false;
      cancelAnimationFrame(this._raf);
      this._ro && this._ro.disconnect();
      this._io && this._io.disconnect();
      this.removeEventListener('pointermove', this._onMove);
      this.removeEventListener('pointerleave', this._onLeave);
      this._onResize && window.removeEventListener('resize', this._onResize);
      this._onVisibility && document.removeEventListener('visibilitychange', this._onVisibility);
    }
  }

  if (!customElements.get('hero-shift')) customElements.define('hero-shift', HeroShift);
})();
