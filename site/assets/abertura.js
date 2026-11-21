/*
 * Abertura da home (~3 s): pontos vêm do fundo em 3D e montam a logo,
 * a logo se endireita com um brilho e a câmera atravessa a marca.
 * Só transform/opacity no DOM; os pontos são desenhados num canvas 2D com
 * perspectiva calculada à mão, sem biblioteca. Se algo falhar, o CSS tira a
 * abertura sozinho (ver .abertura em brand-linho.css).
 */
(() => {
  const raiz = document.documentElement;
  const tela = document.querySelector('.abertura');
  if (!tela) return;
  if (raiz.classList.contains('sem-abertura')) { tela.remove(); return; }

  const canvas = tela.querySelector('canvas');
  const caixa = tela.querySelector('.abertura-logo');
  const ctx = canvas.getContext('2d');
  let largura = 0, altura = 0, encerrada = false, iniciou = false;

  const encerrar = () => {
    if (encerrada) return;
    encerrada = true;
    tela.classList.add('abertura-saindo');
    setTimeout(() => tela.remove(), 700);
  };
  // Quem toca ou aperta uma tecla não precisa esperar.
  addEventListener('keydown', encerrar, { once: true });
  tela.addEventListener('pointerdown', encerrar, { once: true });

  const medir = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    largura = innerWidth; altura = innerHeight;
    canvas.width = largura * dpr; canvas.height = altura * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const imagem = new Image();
  imagem.onerror = encerrar;
  // Imagem lenta: sem partículas, mostra a logo direto.
  setTimeout(() => {
    if (iniciou) return;
    iniciou = true;
    tela.classList.add('abertura-direta', 'abertura-pronta');
    setTimeout(encerrar, 1100);
  }, 900);

  imagem.onload = () => {
    if (iniciou || encerrada) return;
    iniciou = true;
    medir();
    // Posição final da logo, sem a inclinação inicial: centralizada na tela.
    const area = {
      width: caixa.offsetWidth, height: caixa.offsetHeight,
      left: (largura - caixa.offsetWidth) / 2, top: (altura - caixa.offsetHeight) / 2,
    };

    // Amostra a logo numa grade pequena: cada pixel opaco vira um ponto.
    const amostraL = Math.round(Math.min(300, Math.max(180, area.width * 0.6)));
    const amostraA = Math.round(amostraL * imagem.naturalHeight / imagem.naturalWidth);
    const off = document.createElement('canvas');
    off.width = amostraL; off.height = amostraA;
    const octx = off.getContext('2d', { willReadFrequently: true });
    octx.drawImage(imagem, 0, 0, amostraL, amostraA);
    let dados;
    try { dados = octx.getImageData(0, 0, amostraL, amostraA).data; } catch { encerrar(); return; }

    const escala = area.width / amostraL;
    const alvos = [];
    for (let y = 0; y < amostraA; y++) {
      for (let x = 0; x < amostraL; x++) {
        if (dados[(y * amostraL + x) * 4 + 3] > 120) alvos.push([area.left + (x + 0.5) * escala, area.top + (y + 0.5) * escala, x / amostraL]);
      }
    }
    const limite = largura < 700 ? 2600 : 5200;
    const passo = Math.max(1, Math.ceil(alvos.length / limite));
    const cx = largura / 2, cy = altura / 2, foco = 700;
    const pontos = [];
    for (let i = 0; i < alvos.length; i += passo) {
      const [tx, ty, coluna] = alvos[i];
      const ang = Math.random() * Math.PI * 2, raio = 0.4 + Math.random() * 1.1;
      pontos.push({
        tx: tx - cx, ty: ty - cy,
        sx: Math.cos(ang) * largura * raio, sy: Math.sin(ang) * altura * raio * 0.8,
        sz: 500 + Math.random() * 2200,
        giro: (Math.random() - 0.5) * 2.6,
        atraso: coluna * 420 + Math.random() * 160,
        tam: 0.8 + Math.random() * 1.3,
        tom: Math.random() < 0.82 ? '234,229,220' : '182,179,170',
      });
    }

    const suave = (t) => 1 - Math.pow(1 - t, 5);
    const inicio = performance.now();
    const DURACAO = 1050;
    // Linha do tempo (ms): os pontos chegam; entre FUNDE e TROCA eles viram a imagem
    // dentro do próprio canvas; em TROCA a logo do DOM, idêntica, assume sem salto.
    const FUNDE = 1250, TROCA = 1850, SAI = 2700;

    const quadro = (agora) => {
      if (encerrada) return;
      const decorrido = agora - inicio;
      const f = Math.min(1, Math.max(0, (decorrido - FUNDE) / (TROCA - FUNDE)));
      const fusao = f * f * (3 - 2 * f);
      ctx.clearRect(0, 0, largura, altura);
      for (const p of pontos) {
        const t = Math.min(1, Math.max(0, (decorrido - p.atraso) / DURACAO));
        const e = suave(t);
        // Posição 3D: parte do fundo, gira em torno do eixo vertical e chega em z = 0.
        let x = p.sx + (p.tx - p.sx) * e;
        const y = p.sy + (p.ty - p.sy) * e;
        let z = p.sz * (1 - e);
        const a = p.giro * (1 - e);
        const cos = Math.cos(a), sin = Math.sin(a);
        const xr = x * cos - z * sin * 0.35;
        z = x * sin * 0.35 + z * cos;
        x = xr;
        const k = foco / (foco + Math.max(z, -foco * 0.6));
        // Na fusão, cada ponto incha um pouco e some enquanto a imagem aparece por baixo dele.
        const r = p.tam * k * (1 + fusao * 0.9);
        ctx.fillStyle = `rgba(${p.tom},${((0.15 + 0.85 * e) * (1 - fusao)).toFixed(3)})`;
        ctx.fillRect(cx + x * k - r / 2, cy + y * k - r / 2, r, r);
      }
      if (fusao > 0) {
        ctx.globalAlpha = fusao;
        ctx.drawImage(imagem, area.left, area.top, area.width, area.height);
        ctx.globalAlpha = 1;
      }
      if (decorrido < TROCA) requestAnimationFrame(quadro);
      else tela.classList.add('abertura-pronta');
    };
    requestAnimationFrame(quadro);

    setTimeout(encerrar, SAI);
  };
  imagem.src = caixa.querySelector('img').src;
})();
