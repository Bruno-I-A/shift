/* Shift Systems · WebGL scene
 * a "living system": glowing particle flow-field + node network +
 * the 3D-extruded Shift mark, lit with bloom. mouse-parallax + scroll dolly.
 * pure three.js (module) — runs independently of the React/Babel layer.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const PURPLE = 0xB56BFF;
const PURPLE_DEEP = 0x8A4DCC;

function markReady() {
  window.__shiftSceneReady = true;
  window.dispatchEvent(new Event('shift:scene-ready'));
}

function boot() {
  const canvas = document.getElementById('webgl');
  if (!canvas) { markReady(); return; }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = window.matchMedia('(max-width: 768px)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: true, powerPreference: 'high-performance',
    });
  } catch (e) {
    // no webgl — let the CSS background carry the page
    markReady();
    return;
  }

  const W = () => window.innerWidth;
  const H = () => window.innerHeight;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W(), H());
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x08080b, 0.028);

  const camera = new THREE.PerspectiveCamera(58, W() / H(), 0.1, 120);
  camera.position.set(0, 0, 16);

  // ---- lights (for the standard-material mark) ----------------------
  scene.add(new THREE.AmbientLight(0x402a66, 1.1));
  const key = new THREE.PointLight(PURPLE, 60, 60); key.position.set(6, 6, 10); scene.add(key);
  const rim = new THREE.PointLight(0xffffff, 22, 60); rim.position.set(-8, -4, 6); scene.add(rim);

  // =================================================================
  // 1 · PARTICLE FLOW-FIELD
  // =================================================================
  const COUNT = reduced ? 900 : (isMobile ? 1600 : 3600);
  const positions = new Float32Array(COUNT * 3);
  const scales = new Float32Array(COUNT);
  const seeds = new Float32Array(COUNT);
  const RX = 26, RY = 18, RZ = 18;
  for (let i = 0; i < COUNT; i++) {
    positions[i * 3]     = (Math.random() * 2 - 1) * RX;
    positions[i * 3 + 1] = (Math.random() * 2 - 1) * RY;
    positions[i * 3 + 2] = (Math.random() * 2 - 1) * RZ;
    scales[i] = Math.random() * 0.9 + 0.25;
    seeds[i]  = Math.random() * 6.2831;
  }
  const fieldGeo = new THREE.BufferGeometry();
  fieldGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  fieldGeo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
  fieldGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

  // compact ashima simplex noise (3d) for organic drift
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

  const fieldMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uPixelRatio: { value: renderer.getPixelRatio() },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uColorA: { value: new THREE.Color(PURPLE) },
      uColorB: { value: new THREE.Color(0xffffff) },
    },
    vertexShader: `
      ${NOISE}
      uniform float uTime; uniform float uPixelRatio; uniform vec2 uMouse;
      attribute float aScale; attribute float aSeed;
      varying float vGlow;
      void main(){
        vec3 p = position;
        float t = uTime * 0.06;
        float n1 = snoise(p * 0.06 + vec3(t, t*0.7, t*0.4));
        float n2 = snoise(p * 0.12 + vec3(-t*0.5, t, aSeed));
        p.x += n1 * 2.2;  p.y += n2 * 2.0;  p.z += n1 * 1.6;
        // gentle pull toward cursor
        p.xy += uMouse * (1.2 + aScale);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float twinkle = 0.6 + 0.4 * sin(uTime * 1.4 + aSeed * 3.0);
        gl_PointSize = aScale * 26.0 * uPixelRatio * twinkle / -mv.z;
        vGlow = twinkle * smoothstep(-22.0, 4.0, mv.z);
      }`,
    fragmentShader: `
      uniform vec3 uColorA; uniform vec3 uColorB;
      varying float vGlow;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        if(d > 0.5) discard;
        float a = smoothstep(0.5, 0.0, d);
        vec3 col = mix(uColorA, uColorB, pow(a, 3.0) * 0.7);
        gl_FragColor = vec4(col, a * vGlow);
      }`,
  });
  const field = new THREE.Points(fieldGeo, fieldMat);
  scene.add(field);

  // =================================================================
  // 2 · NODE NETWORK  (nodes + connecting lines, slowly rotating)
  // =================================================================
  const netGroup = new THREE.Group();
  scene.add(netGroup);
  const NODES = reduced ? 26 : 54;
  const nodePts = [];
  for (let i = 0; i < NODES; i++) {
    // biased to a shell so the center stays readable
    const r = 6 + Math.random() * 5;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    nodePts.push(new THREE.Vector3(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta) * 0.7,
      r * Math.cos(phi),
    ));
  }
  const nodePos = new Float32Array(NODES * 3);
  nodePts.forEach((v, i) => { nodePos[i*3]=v.x; nodePos[i*3+1]=v.y; nodePos[i*3+2]=v.z; });
  const nodeGeo = new THREE.BufferGeometry();
  nodeGeo.setAttribute('position', new THREE.BufferAttribute(nodePos, 3));
  const nodeMat = new THREE.PointsMaterial({
    color: PURPLE, size: 0.16, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  netGroup.add(new THREE.Points(nodeGeo, nodeMat));

  // connections within a threshold (capped)
  const linePos = [];
  const maxSeg = 160; let seg = 0;
  for (let i = 0; i < NODES && seg < maxSeg; i++) {
    for (let j = i + 1; j < NODES && seg < maxSeg; j++) {
      if (nodePts[i].distanceTo(nodePts[j]) < 4.4) {
        linePos.push(nodePts[i].x, nodePts[i].y, nodePts[i].z,
                     nodePts[j].x, nodePts[j].y, nodePts[j].z);
        seg++;
      }
    }
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(linePos), 3));
  const lineMat = new THREE.LineBasicMaterial({
    color: PURPLE, transparent: true, opacity: 0.14,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  netGroup.add(new THREE.LineSegments(lineGeo, lineMat));

  // =================================================================
  // 3 · THE 3D SHIFT MARK  (extruded from the SVG geometry)
  // =================================================================
  const mark = new THREE.Group();
  const k = 0.085; // svg→world scale
  const depth = 1.15;
  const markMat = new THREE.MeshStandardMaterial({
    color: PURPLE, emissive: PURPLE_DEEP, emissiveIntensity: 1.35,
    metalness: 0.55, roughness: 0.22,
  });
  const slabGeo = new THREE.RoundedBoxGeometry(60 * k, 14 * k, depth, 6, 0.22);
  // top slab  (svg center 56,25 → world, y flipped about 50)
  const top = new THREE.Mesh(slabGeo, markMat);
  top.position.set((56 - 50) * k, (50 - 25) * k, 0);
  // bottom slab (svg center 44,75)
  const bottom = new THREE.Mesh(slabGeo, markMat);
  bottom.position.set((44 - 50) * k, (50 - 75) * k, 0);
  // diagonal (svg 38,32 → 62,68), length 43.27, angle in flipped space
  const diagLen = Math.sqrt(24 * 24 + 36 * 36);
  const diag = new THREE.Mesh(new THREE.RoundedBoxGeometry(diagLen * k, 14 * k, depth, 6, 0.22), markMat);
  diag.rotation.z = Math.atan2(-36, 24);
  mark.add(top, bottom, diag);
  mark.position.set(isMobile ? 0 : 4.2, isMobile ? 4.5 : 0.2, isMobile ? -4 : -1.5);
  mark.scale.setScalar(isMobile ? 0.8 : 1.18);
  scene.add(mark);

  // =================================================================
  // POST · bloom
  // =================================================================
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W(), H()),
    reduced ? 0.55 : 0.95, 0.62, 0.0);
  composer.addPass(bloom);
  composer.setSize(W(), H());

  // =================================================================
  // interaction state
  // =================================================================
  const mouse = new THREE.Vector2(0, 0);
  const target = new THREE.Vector2(0, 0);
  window.addEventListener('mousemove', (e) => {
    target.x = (e.clientX / W()) * 2 - 1;
    target.y = -((e.clientY / H()) * 2 - 1);
  }, { passive: true });

  let scrollN = 0; // 0..1 over the whole page
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    scrollN = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  window.addEventListener('resize', () => {
    camera.aspect = W() / H(); camera.updateProjectionMatrix();
    renderer.setSize(W(), H()); composer.setSize(W(), H());
    fieldMat.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  });

  // =================================================================
  // loop
  // =================================================================
  const clock = new THREE.Clock();
  let raf;
  function tick() {
    const t = clock.getElapsedTime();
    mouse.x += (target.x - mouse.x) * 0.04;
    mouse.y += (target.y - mouse.y) * 0.04;

    fieldMat.uniforms.uTime.value = t;
    fieldMat.uniforms.uMouse.value.set(mouse.x, mouse.y);

    // scroll = fly forward + descend through the field
    camera.position.x += (mouse.x * 1.6 - camera.position.x) * 0.05;
    camera.position.y += ((mouse.y * 1.1 - scrollN * 4.0) - camera.position.y) * 0.05;
    camera.position.z = 16 - scrollN * 9.0;
    camera.lookAt(0, -scrollN * 2.0, 0);

    field.rotation.y = t * 0.02 + scrollN * 0.6;
    netGroup.rotation.y = t * 0.05;
    netGroup.rotation.x = t * 0.02 + mouse.y * 0.2;

    // mark floats, rotates, follows cursor, fades out past the hero
    mark.rotation.y = Math.sin(t * 0.3) * 0.5 + mouse.x * 0.4;
    mark.rotation.x = Math.cos(t * 0.25) * 0.18 - mouse.y * 0.3;
    mark.position.y = (isMobile ? 4.5 : 0.2) + Math.sin(t * 0.8) * 0.22;
    const markFade = Math.max(0, 1 - scrollN * 3.2);
    markMat.emissiveIntensity = 1.35 * markFade;
    mark.visible = markFade > 0.02;
    mark.scale.setScalar((isMobile ? 0.8 : 1.18) * (0.6 + 0.4 * markFade));

    composer.render();
    raf = requestAnimationFrame(tick);
  }
  tick();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(raf); }
    else { clock.start(); tick(); }
  });

  // first frame is on screen — tell the preloader it can lift
  requestAnimationFrame(() => requestAnimationFrame(markReady));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
