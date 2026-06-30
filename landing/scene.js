/* Shift Systems · WebGL film
 * a scroll-driven journey: the mark hangs whole → shatters into a chaotic
 * particle storm → the storm snaps into an ordered lattice → the mark reforms
 * behind the final CTA. camera flies through choreographed stations.
 * the whole thing is scrubbed by a single scroll progress value (0..1).
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const PURPLE = 0xB56BFF;
const PURPLE_DEEP = 0x8A4DCC;

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

function markReady() {
  window.__shiftSceneReady = true;
  window.dispatchEvent(new Event('shift:scene-ready'));
}

// global scroll progress (cinematic hook writes window.__shiftScrollN; we fall back)
function scrollProgress() {
  if (typeof window.__shiftScrollN === 'number') return window.__shiftScrollN;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
}

function boot() {
  const canvas = document.getElementById('webgl');
  if (!canvas) { markReady(); return; }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = window.matchMedia('(max-width: 768px)').matches;

  // ===== perf gate =====
  // the 3D film is a desktop showcase. on phones it's dimmed to near-invisible
  // anyway (see #webgl mobile opacity), yet a phone still pays full GPU cost for
  // the bloom composer + shaders every single frame — that's the main source of
  // the jank. so on touch/small screens, on very low-power machines, or when the
  // user asked for reduced motion, we skip WebGL entirely and let the CSS gradient
  // background carry the ambiance. no render loop = nothing to stutter.
  const lowPower =
    (typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 4) ||
    (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 2);
  if (isMobile || reduced || lowPower) {
    canvas.style.display = 'none';   // free the layer; page-bg gradient shows through
    return;
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { markReady(); return; }

  const W = () => window.innerWidth, H = () => window.innerHeight;
  // bloom is soft and the particle field is additive — full DPR is wasted GPU.
  // capping to 1.5 cuts per-pass fragment work ~40% with no visible change,
  // on retina desktops and phones alike (which often report DPR 2.5–3).
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1 : 1.15));
  renderer.setSize(W(), H());
  renderer.setClearColor(0x06060a, 1); // opaque dark base so light text stays readable
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x08080b, 0.026);
  const camera = new THREE.PerspectiveCamera(60, W() / H(), 0.1, 200);
  camera.position.set(0, 0, 16);

  scene.add(new THREE.AmbientLight(0x402a66, 1.1));
  const key = new THREE.PointLight(PURPLE, 70, 80); key.position.set(6, 6, 12); scene.add(key);
  const rim = new THREE.PointLight(0xffffff, 24, 80); rim.position.set(-8, -4, 8); scene.add(rim);

  // =================================================================
  // PARTICLES — chaotic cloud  ⇄  ordered lattice  (driven by uOrder)
  // =================================================================
  const COUNT = reduced ? 420 : (isMobile ? 720 : 1400);
  const positions = new Float32Array(COUNT * 3);   // base cloud
  const targets   = new Float32Array(COUNT * 3);   // ordered lattice
  const scales = new Float32Array(COUNT);
  const seeds  = new Float32Array(COUNT);
  const RX = 30, RY = 20, RZ = 20;

  // lattice dimensions
  const gx = Math.ceil(Math.cbrt(COUNT * (RX / RY)));
  const gy = Math.ceil(Math.cbrt(COUNT * (RY / RX)));
  const gz = Math.ceil(COUNT / (gx * gy));
  const LSX = 22, LSY = 13, LSZ = 14;
  let n = 0;
  for (let i = 0; i < COUNT; i++) {
    positions[i*3]   = (Math.random() * 2 - 1) * RX;
    positions[i*3+1] = (Math.random() * 2 - 1) * RY;
    positions[i*3+2] = (Math.random() * 2 - 1) * RZ;
    scales[i] = Math.random() * 0.9 + 0.28;
    seeds[i]  = Math.random() * 6.2831;
    const ix = n % gx, iy = Math.floor(n / gx) % gy, iz = Math.floor(n / (gx * gy));
    targets[i*3]   = (ix / (gx - 1) - 0.5) * LSX;
    targets[i*3+1] = (iy / (gy - 1) - 0.5) * LSY;
    targets[i*3+2] = (iz / Math.max(1, gz - 1) - 0.5) * LSZ;
    n++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aTarget', new THREE.BufferAttribute(targets, 3));
  geo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

  const NOISE = `
    vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x,289.0);}
    vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
    float snoise(vec3 v){
      const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
      vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
      vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
      vec3 x1=x0-i1+1.0*C.xxx; vec3 x2=x0-i2+2.0*C.xxx; vec3 x3=x0-1.0+3.0*C.xxx;
      i=mod(i,289.0);
      vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
      float n_=1.0/7.0; vec3 ns=n_*D.wyz-D.xzx;
      vec4 j=p-49.0*floor(p*ns.z*ns.z);
      vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
      vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
      vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
      vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
      vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
      vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
      vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
      p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
      vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
      return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
    }`;

  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uPixelRatio: { value: renderer.getPixelRatio() },
      uMouse: { value: new THREE.Vector2() },
      uOrder: { value: 0 },    // 0 = chaos cloud, 1 = ordered lattice
      uChaos: { value: 0 },    // extra turbulence during the "problem" act
      uColorA: { value: new THREE.Color(PURPLE) },
      uColorB: { value: new THREE.Color(0xffffff) },
    },
    vertexShader: `
      ${NOISE}
      uniform float uTime, uPixelRatio, uOrder, uChaos; uniform vec2 uMouse;
      attribute vec3 aTarget; attribute float aScale, aSeed;
      varying float vGlow, vOrder;
      void main(){
        float t = uTime * 0.06;
        vec3 cloud = position;
        float n1 = snoise(position * 0.06 + vec3(t, t*0.7, t*0.4));
        float n2 = snoise(position * 0.12 + vec3(-t*0.5, t, aSeed));
        cloud.x += n1 * (2.2 + uChaos * 4.0);
        cloud.y += n2 * (2.0 + uChaos * 4.0);
        cloud.z += n1 * (1.6 + uChaos * 3.0);
        cloud.xy += uMouse * (1.1 + aScale);

        // lattice breathes slightly so it feels alive even when ordered
        vec3 lat = aTarget;
        lat += 0.18 * vec3(sin(uTime*0.9+aSeed), cos(uTime*0.8+aSeed*1.3), sin(uTime*0.7+aSeed*0.6));

        float o = smoothstep(0.0, 1.0, uOrder);
        vec3 p = mix(cloud, lat, o);

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float twinkle = 0.6 + 0.4 * sin(uTime * 1.4 + aSeed * 3.0);
        gl_PointSize = aScale * (19.0 + o * 8.0) * uPixelRatio * twinkle / -mv.z;
        vGlow = twinkle * smoothstep(-26.0, 4.0, mv.z);
        vOrder = o;
      }`,
    fragmentShader: `
      uniform vec3 uColorA, uColorB;
      varying float vGlow, vOrder;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        if(d > 0.5) discard;
        float a = smoothstep(0.5, 0.0, d);
        vec3 col = mix(uColorA, uColorB, pow(a, 3.0) * (0.6 + vOrder * 0.3));
        gl_FragColor = vec4(col, a * vGlow * 0.32);
      }`,
  });
  const field = new THREE.Points(geo, mat);
  scene.add(field);

  // =================================================================
  // NODE NETWORK — subtle, always present, slowly rotating
  // =================================================================
  const netGroup = new THREE.Group(); scene.add(netGroup);
  const NODES = reduced ? 14 : (isMobile ? 22 : 34);
  const np = [];
  for (let i = 0; i < NODES; i++) {
    const r = 7 + Math.random() * 5, th = Math.random() * 6.2831, ph = Math.acos(Math.random() * 2 - 1);
    np.push(new THREE.Vector3(r*Math.sin(ph)*Math.cos(th), r*Math.sin(ph)*Math.sin(th)*0.7, r*Math.cos(ph)));
  }
  const npos = new Float32Array(NODES * 3);
  np.forEach((v, i) => { npos[i*3]=v.x; npos[i*3+1]=v.y; npos[i*3+2]=v.z; });
  const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.BufferAttribute(npos, 3));
  netGroup.add(new THREE.Points(ng, new THREE.PointsMaterial({ color: PURPLE, size: 0.15, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })));
  const lp = []; let seg = 0;
  const MAX_SEGS = reduced ? 34 : (isMobile ? 56 : 90);
  for (let i = 0; i < NODES && seg < MAX_SEGS; i++) for (let j = i+1; j < NODES && seg < MAX_SEGS; j++)
    if (np[i].distanceTo(np[j]) < 4.6) { lp.push(np[i].x,np[i].y,np[i].z, np[j].x,np[j].y,np[j].z); seg++; }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lp), 3));
  netGroup.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: PURPLE, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false })));

  // =================================================================
  // THE 3D MARK — shatters apart then reassembles
  // =================================================================
  const mark = new THREE.Group();
  const k = 0.085, depth = 1.15;
  const markMat = new THREE.MeshStandardMaterial({ color: PURPLE, emissive: PURPLE_DEEP, emissiveIntensity: 1.0, metalness: 0.55, roughness: 0.22 });
  const slabGeo = new RoundedBoxGeometry(60*k, 14*k, depth, 6, 0.22);
  const top = new THREE.Mesh(slabGeo, markMat);
  const bottom = new THREE.Mesh(slabGeo, markMat);
  const diagLen = Math.sqrt(24*24 + 36*36);
  const diag = new THREE.Mesh(new RoundedBoxGeometry(diagLen*k, 14*k, depth, 6, 0.22), markMat);
  const topBase = new THREE.Vector3((56-50)*k, (50-25)*k, 0);
  const botBase = new THREE.Vector3((44-50)*k, (50-75)*k, 0);
  const diagRot = Math.atan2(-36, 24);
  mark.add(top, bottom, diag);
  scene.add(mark);

  // =================================================================
  // POST — bloom
  // =================================================================
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomScale = isMobile ? 0.42 : 0.5;
  const bloom = new UnrealBloomPass(new THREE.Vector2(W() * bloomScale, H() * bloomScale), reduced ? 0.18 : 0.26, 0.34, 0.36);
  composer.addPass(bloom);
  composer.setSize(W(), H());

  // =================================================================
  // camera stations — the film's keyframes
  // =================================================================
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const stations = [
    { at: 0.00, pos: V(0, 0, 16),     look: V(0, 0, 0) },
    { at: 0.20, pos: V(2.4, -1, 12),  look: V(0.8, -1, 0) },
    { at: 0.45, pos: V(-2.6, -2, 9),  look: V(0, -2, 0) },     // ordered lattice — orbit
    { at: 0.66, pos: V(2.2, -3, 11),  look: V(0, -3, 0) },
    { at: 0.84, pos: V(0, -3.6, 9),   look: V(0, -3.6, 0) },
    { at: 1.00, pos: V(0, -4, 6.5),   look: V(0, -4, 0) },     // CTA portal
  ];
  const camTarget = new THREE.Vector3(), lookTarget = new THREE.Vector3();
  function sampleStations(s) {
    for (let i = 0; i < stations.length - 1; i++) {
      const a = stations[i], b = stations[i + 1];
      if (s <= b.at) {
        const t = (s - a.at) / (b.at - a.at), e = t * t * (3 - 2 * t);
        camTarget.lerpVectors(a.pos, b.pos, e);
        lookTarget.lerpVectors(a.look, b.look, e);
        return;
      }
    }
    const L = stations[stations.length - 1];
    camTarget.copy(L.pos); lookTarget.copy(L.look);
  }

  // =================================================================
  // interaction
  // =================================================================
  const mouse = new THREE.Vector2(), mtarget = new THREE.Vector2();
  window.addEventListener('mousemove', (e) => {
    mtarget.x = (e.clientX / W()) * 2 - 1;
    mtarget.y = -((e.clientY / H()) * 2 - 1);
  }, { passive: true });
  window.addEventListener('resize', () => {
    camera.aspect = W() / H(); camera.updateProjectionMatrix();
    renderer.setSize(W(), H()); composer.setSize(W(), H());
    bloom.setSize(W() * bloomScale, H() * bloomScale);
    mat.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  });

  // =================================================================
  // loop
  // =================================================================
  const clock = new THREE.Clock();
  let raf, lastFrame = 0;
  // ambient background — it doesn't need 60fps. capping the render rate leaves
  // GPU/CPU headroom every frame so scroll, custom cursor and backdrop-blur
  // (all compositor work) stay smooth instead of fighting the scene for the GPU.
  const MIN_FRAME_MS = reduced ? 80 : (isMobile ? 50 : 42);   // ~12/20/24fps
  const _look = new THREE.Vector3();
  function tick() {
    raf = requestAnimationFrame(tick);
    const now = performance.now();
    if (now - lastFrame < MIN_FRAME_MS) return;            // skip frame — keep the budget free
    lastFrame = now;

    const t = clock.getElapsedTime();
    const s = scrollProgress();
    mouse.x += (mtarget.x - mouse.x) * 0.045;
    mouse.y += (mtarget.y - mouse.y) * 0.045;

    // ---- particle acts ----
    // chaos peaks across the "problema" act, order peaks across "soluções"
    const chaos = smooth(0.08, 0.22, s) * (1 - smooth(0.34, 0.46, s));
    const order = smooth(0.34, 0.46, s) * (1 - smooth(0.60, 0.72, s));
    mat.uniforms.uTime.value = t;
    mat.uniforms.uMouse.value.set(mouse.x, mouse.y);
    mat.uniforms.uOrder.value += (order - mat.uniforms.uOrder.value) * 0.08;
    mat.uniforms.uChaos.value += (chaos - mat.uniforms.uChaos.value) * 0.08;

    field.rotation.y = t * 0.02 + s * 0.7;
    netGroup.rotation.y = t * 0.05;
    netGroup.rotation.x = t * 0.02 + mouse.y * 0.2;

    // ---- camera film ----
    sampleStations(s);
    camera.position.x += (camTarget.x + mouse.x * 1.4 - camera.position.x) * 0.06;
    camera.position.y += (camTarget.y + mouse.y * 0.9 - camera.position.y) * 0.06;
    camera.position.z += (camTarget.z - camera.position.z) * 0.06;
    _look.copy(lookTarget); _look.x += mouse.x * 0.6; _look.y += mouse.y * 0.4;
    camera.lookAt(_look);

    // ---- the mark: whole → shatter → (gone) → reform ----
    const heroWhole = 1 - smooth(0.04, 0.20, s);   // 1 at top, 0 after hero
    const endWhole  = smooth(0.78, 0.94, s);        // reassembles near CTA
    const assembled = Math.max(heroWhole, endWhole);
    const shatter = 1 - assembled;
    const vis = Math.max(heroWhole, endWhole * 0.95);

    mark.visible = vis > 0.02;
    if (mark.visible) {
      // slabs fly apart as it shatters, snap together as it reforms
      top.position.set(topBase.x + shatter * 1.6, topBase.y + shatter * 1.3, shatter * 1.2);
      bottom.position.set(botBase.x - shatter * 1.6, botBase.y - shatter * 1.3, -shatter * 1.2);
      diag.rotation.z = diagRot + shatter * 1.4;
      diag.position.set(0, 0, shatter * 0.6);

      // hero spot is center-right; CTA spot is centered
      const ex = endWhole;
      mark.position.x = lerp(isMobile ? 0 : 4.2, 0, ex);
      mark.position.y = lerp(0.2 + Math.sin(t * 0.8) * 0.22, -4, ex);
      mark.position.z = lerp(-1.5, 0.5, ex);
      mark.rotation.y = Math.sin(t * 0.3) * 0.5 + mouse.x * 0.4 + shatter * 1.2;
      mark.rotation.x = Math.cos(t * 0.25) * 0.16 - mouse.y * 0.3;
      const base = isMobile ? 0.8 : 1.05;
      mark.scale.setScalar(base * (0.7 + 0.45 * endWhole + 0.25 * heroWhole));
      markMat.emissiveIntensity = 1.0 * vis;
    }

    composer.render();
  }
  tick();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else { clock.start(); tick(); }
  });

  requestAnimationFrame(() => requestAnimationFrame(markReady));
}

// init the heavy 3D AFTER the site has formed in, so the entrance never janks
let booted = false;
function go() { if (booted) return; booted = true; boot(); }
window.addEventListener('shift:react-ready', function () { setTimeout(go, 400); }, { once: true });
setTimeout(go, 2600); // fallback if react never signals
