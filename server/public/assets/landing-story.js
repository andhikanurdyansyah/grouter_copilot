/* ============================================================
   gRouter Copilot — landing-story engine (DRAFT)
   Pola aeronet.id terbukti dari recon live:
   - SATU canvas WebGL fixed persisten sepanjang halaman
   - spacer track per babak (100–170vh) = sumber progress
   - kamera + seluruh objek di-lerp kontinyu oleh scroll
   - bloom sungguhan (EffectComposer + UnrealBloomPass + OutputPass)
   - layer copy 2D crossfade per babak + stepper kanan
   Objek dunia: starfield → core blok data (aplikasi) → gate ring
   (skill read-only) → paket pesan (percakapan) → kubah kendali
   (runtime server) → pengiring menuju pricing/final.
   ============================================================ */

import * as THREE from '/assets/vendor/three.module.min.js';
import { EffectComposer } from '/assets/vendor/three-addons/postprocessing/EffectComposer.js';
import { RenderPass } from '/assets/vendor/three-addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '/assets/vendor/three-addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '/assets/vendor/three-addons/postprocessing/OutputPass.js';

const canvas = document.getElementById('storyCanvas');
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOBILE = () => innerWidth < 640;

let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
} catch { /* WebGL mati — copy 2D tetap terbaca */ }

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x040814);
scene.fog = new THREE.FogExp2(0x040814, 0.028);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);

/* ---------- lights ---------- */
scene.add(new THREE.AmbientLight(0x2a3850, 1.2));
const rim = new THREE.DirectionalLight(0x9fd8ea, 1.4);
rim.position.set(-5, 6, 4);
scene.add(rim);
const coreLight = new THREE.PointLight(0x22d3ee, 16, 14, 2);
scene.add(coreLight);

/* ---------- starfield ---------- */
const starN = MOBILE() ? 380 : 850;
const starGeo = new THREE.BufferGeometry();
{
  const p = new Float32Array(starN * 3);
  for (let i = 0; i < starN; i++) {
    p[i * 3] = (Math.random() - 0.5) * 60;
    p[i * 3 + 1] = (Math.random() - 0.5) * 34;
    p[i * 3 + 2] = -4 - Math.random() * 30;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(p, 3));
}
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
  color: 0x9fb2c9, size: 0.05, transparent: true, opacity: 0.8, depthWrite: false,
}));
scene.add(stars);

/* ---------- helpers ---------- */
const CYAN = 0x22d3ee;
const AMBER = 0xf59e0b;

function glowingTorus(radius, tube, color, opacity = 1) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, 12, 64),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  ));
  return g;
}

function makeNode(color) {
  // bola node kecil yang bloom (MeshBasic terang)
  return new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), new THREE.MeshBasicMaterial({ color }));
}

/* ---------- babak 0-1: CORE — blok data aplikasi (kubus wireframe + inti) ---------- */
const core = new THREE.Group();

const dataCube = new THREE.Mesh(
  new THREE.BoxGeometry(1.7, 1.7, 1.7),
  new THREE.MeshStandardMaterial({ color: 0x0c1526, metalness: 0.85, roughness: 0.35, transparent: true, opacity: 0.96 }),
);
core.add(dataCube);

const cubeEdges = new THREE.LineSegments(
  new THREE.EdgesGeometry(dataCube.geometry),
  new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.5 }),
);
core.add(cubeEdges);

const heart = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 18), new THREE.MeshBasicMaterial({ color: 0xd9f6ff }));
core.add(heart);

// node orbit amber + cyan (khas aeronet)
const orbitNodes = [];
for (let i = 0; i < 5; i++) {
  const n = makeNode(i % 2 ? AMBER : CYAN);
  n.userData = { a: (i / 5) * Math.PI * 2, r: 2.5 + (i % 2) * 0.5, sp: 0.25 + i * 0.04, tilt: (i - 2) * 0.3 };
  core.add(n);
  orbitNodes.push(n);
}

core.position.set(0, 0.1, 0);
scene.add(core);

/* ---------- babak 2: GATE — dua cincin (skill read-only) ---------- */
const gate = new THREE.Group();
const ringA = new THREE.Mesh(
  new THREE.TorusGeometry(1.55, 0.045, 12, 72),
  new THREE.MeshBasicMaterial({ color: 0xbfeffd }),
);
const ringB = new THREE.Mesh(
  new THREE.TorusGeometry(1.95, 0.03, 12, 72),
  new THREE.MeshBasicMaterial({ color: AMBER }),
);
ringB.rotation.x = Math.PI / 2.4;
gate.add(ringA, ringB);
const gateKey = makeNode(CYAN);
gateKey.scale.setScalar(1.3);
gate.add(gateKey);
gate.position.set(3.2, 0.2, -7);
gate.scale.setScalar(0.72);
scene.add(gate);

/* ---------- babak 3: PAKET PESAN — helix partikel (percakapan) ---------- */
const helix = new THREE.Group();
{
  const N = MOBILE() ? 260 : 420;
  const p = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const t = i / N;
    const a = t * Math.PI * 6;
    const r = 1.1 + Math.sin(t * Math.PI) * 0.55;
    p[i * 3] = Math.cos(a) * r;
    p[i * 3 + 1] = (t - 0.5) * 4.6;
    p[i * 3 + 2] = Math.sin(a) * r;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  helix.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x67e8f9, size: 0.06, transparent: true, opacity: 0.9, depthWrite: false })));
  const q = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  helix.add(q);
}
helix.position.set(3.1, 0, -14);
scene.add(helix);

/* ---------- babak 4: KUBAH KENDALI — geodesic dome (runtime server) ---------- */
const dome = new THREE.Group();
const domeMesh = new THREE.Mesh(
  new THREE.IcosahedronGeometry(1.8, 1),
  new THREE.MeshStandardMaterial({ color: 0x0a1424, metalness: 0.9, roughness: 0.3, transparent: true, opacity: 0.92, side: THREE.DoubleSide }),
);
dome.add(domeMesh);
const domeWire = new THREE.LineSegments(
  new THREE.EdgesGeometry(domeMesh.geometry),
  new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.45 }),
);
dome.add(domeWire);
const domeCore = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), new THREE.MeshBasicMaterial({ color: 0xbdf0ff }));
dome.add(domeCore);
dome.position.set(3.3, 0.4, -21);
dome.scale.setScalar(0.72);
scene.add(dome);

/* ---------- pilar jalan (kedalaman sepanjang perjalanan) ---------- */
{
  const N = 26;
  for (let i = 0; i < N; i++) {
    const z = 4 - i * 1.6;
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.9 + Math.random() * 1.4, 6),
      new THREE.MeshBasicMaterial({ color: i % 3 ? 0x14263c : 0x1b3a52, transparent: true, opacity: 0.8 }),
    );
    const side = i % 2 ? 1 : -1;
    pillar.position.set(side * (4.6 + Math.random() * 2.2), -2.4, z);
    scene.add(pillar);
  }
}

/* ---------- kamera per babak (posisi + lookAt, di-lerp) ---------- */
const STOPS = [
  { pos: [0, 0.3, 6.4], look: [0, 0.1, 0] },     // intro — core di depan
  { pos: [2.6, 0.9, 4.6], look: [0, 0.1, 0] },   // data — orbit angle
  { pos: [1.2, 0.4, -3.2], look: [1.7, 0.2, -7] },   // gate — objek kanan, copy kiri
  { pos: [1.1, 0.1, -10.0], look: [1.5, 0, -14] },   // helix
  { pos: [1.2, 0.5, -17.0], look: [1.6, 0.4, -21] }, // dome
  { pos: [0, 2.6, -24.5], look: [1.2, 0, -21] },   // harga — naik tinggi melihat dunia
  { pos: [0, 2.8, -27.8], look: [-2.0, 1.4, -33] }, // final — menembus keluar, dunia tinggal starfield
];

const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
const A = new THREE.Vector3();
const B = new THREE.Vector3();

function progress01() {
  const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  return Math.min(1, Math.max(0, window.scrollY / max));
}

// progress 0..1 → segmen STOPS (0..6) kontinyu
function stopFloat(p) {
  return p * (STOPS.length - 1);
}

function applyStop(f) {
  const i = Math.min(STOPS.length - 2, Math.floor(f));
  const t = f - i;
  A.fromArray(STOPS[i].pos); B.fromArray(STOPS[i + 1].pos);
  camPos.lerpVectors(A, B, t);
  A.fromArray(STOPS[i].look); B.fromArray(STOPS[i + 1].look);
  camLook.lerpVectors(A, B, t);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}

/* ---------- composer ---------- */
let composer = null;
if (renderer) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 1.0, 0.75, 0.78));
  composer.addPass(new OutputPass());
}

function resize() {
  const w = innerWidth, h = innerHeight;
  if (renderer) {
    renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE() ? 1.75 : 2));
    renderer.setSize(w, h, false);
  }
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (composer) composer.setSize(w, h);
}

/* ---------- loop ---------- */
let pTarget = 0;
let p = 0;
const clock = new THREE.Clock();
let rafId = 0;

function frame() {
  rafId = 0;
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  p += (pTarget - p) * Math.min(1, dt * 7);
  applyStop(stopFloat(p));

  // hidup: rotasi konstan + orbit node + denyut inti
  core.rotation.y += dt * 0.22;
  cubeEdges.rotation.y -= dt * 0.08;
  heart.scale.setScalar(1 + Math.sin(t * 2) * 0.08);
  coreLight.position.copy(heart.getWorldPosition(new THREE.Vector3()));
  coreLight.intensity = 16 + Math.sin(t * 1.6) * 2.4;
  for (const n of orbitNodes) {
    const a = n.userData.a + t * n.userData.sp;
    n.position.set(Math.cos(a) * n.userData.r, Math.sin(a * 1.4) * 0.8 + n.userData.tilt * 0.4, Math.sin(a) * n.userData.r);
  }
  gate.rotation.z += dt * 0.16;
  ringB.rotation.z -= dt * 0.24;
  helix.rotation.y += dt * 0.4;
  dome.rotation.y += dt * 0.12;
  stars.rotation.y = t * 0.004;

  if (composer) composer.render();
  else if (renderer) renderer.render(scene, camera);
  rafId = requestAnimationFrame(frame);
}

function renderOnce() {
  applyStop(stopFloat(pTarget));
  if (composer) composer.render();
  else if (renderer) renderer.render(scene, camera);
}

/* ---------- UI: layer copy crossfade + stepper + hint ---------- */
const chps = [...document.querySelectorAll('.chp')];
const dotsEl = document.getElementById('stepDots');
const stepLabel = document.getElementById('stepLabel');
const LABELS = ['INTRO', 'DATA', 'SKILL', 'CHAT', 'KENDALI', 'HARGA', 'MULAI'];
const SP_IDS = ['sp-0', 'sp-1', 'sp-2', 'sp-3', 'sp-4', 'sp-5', 'sp-6'];

// stepper dots
const dotBtns = LABELS.map((lab, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('aria-label', 'Ke babak ' + lab);
  const d = document.createElement('i');
  b.appendChild(d);
  b.addEventListener('click', () => {
    document.getElementById(SP_IDS[i]).scrollIntoView({ behavior: REDUCED ? 'instant' : 'smooth', block: i <= 4 ? 'start' : 'start' });
  });
  dotsEl.appendChild(b);
  return b;
});

// layer copy: hero fixed layer hanya aktif untuk babak 0-4; babak 5-6 = konten flow di track
const FIXED_STEPS = 5;

let uiTick = false;
function updateUI() {
  if (uiTick) return;
  uiTick = true;
  requestAnimationFrame(() => {
    uiTick = false;
    const y = window.scrollY;
    pTarget = progress01();

    // babak aktif = posisi scroll relatif terhadap spacer
    let active = 0;
    for (let i = 0; i < SP_IDS.length; i++) {
      const el = document.getElementById(SP_IDS[i]);
      if (!el) continue;
      const top = el.offsetTop;
      const bottom = top + el.offsetHeight;
      if (y >= top - innerHeight * 0.45 && y < bottom - innerHeight * 0.45) active = i;
    }

    for (let i = 0; i < chps.length; i++) {
      const on = i === active && active < FIXED_STEPS;
      chps[i].classList.toggle('on', on);
      chps[i].classList.toggle('visible', on);
    }
    dotBtns.forEach((b, i) => b.firstChild.classList.toggle('on', i === active));
    if (stepLabel) stepLabel.textContent = LABELS[active];
    document.body.classList.toggle('hint-off', y > innerHeight * 0.6);
  });
}

addEventListener('scroll', updateUI, { passive: true });
addEventListener('resize', () => { resize(); if (REDUCED) renderOnce(); });

/* ---------- init ---------- */
resize();
pTarget = progress01();
p = pTarget;
updateUI();

if (REDUCED) {
  renderOnce();
  // tetap update copy layer saat scroll (tanpa animasi 3D kontinyu)
  addEventListener('scroll', () => { pTarget = progress01(); renderOnce(); }, { passive: true });
} else {
  rafId = requestAnimationFrame(frame);
}

/* ---------- pricing (server truth) ---------- */
const plansEl = document.getElementById('plans');
function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function money(v) { return 'Rp ' + Number(v).toLocaleString('id-ID'); }

fetch('/api/plans')
  .then((r) => { if (!r.ok) throw new Error('plans'); return r.json(); })
  .then((data) => {
    const list = (data.plans || []).filter((x) => x.active !== false);
    if (!list.length) throw new Error('empty');
    plansEl.innerHTML = list.map((x, i) =>
      '<article class="plan-card' + (i === 1 ? ' plan-featured' : '') + '">'
      + (i === 1 ? '<span class="plan-badge">Direkomendasikan</span>' : '')
      + '<span class="mono-label">' + esc(x.key || '') + '</span>'
      + '<h3>' + esc(x.name || x.key) + '</h3>'
      + '<div class="plan-price"><strong>' + esc(money(x.amount)) + '</strong>'
      + (x.expiresInDays ? '<span>/ ' + esc(x.expiresInDays) + ' hari</span>' : '') + '</div>'
      + '<p class="plan-quota">' + esc(x.quota || '') + '</p>'
      + '<ul class="plan-features">' + (x.features || []).slice(0, 5).map((f) => '<li>' + esc(f) + '</li>').join('') + '</ul>'
      + '<a class="btn ' + (i === 1 ? 'btn-primary' : 'btn-ghost') + ' btn-lg" style="width:100%" href="/register" aria-label="Pilih paket ' + esc(x.name || x.key) + '">Pilih paket</a>'
      + '</article>').join('');
  })
  .catch(() => {
    plansEl.innerHTML = '<p class="plan-error">Katalog plan belum tersedia. Silakan coba lagi nanti.</p>';
  });
