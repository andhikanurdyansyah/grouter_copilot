/* ============================================================
   gRouter Copilot — landing-igloo engine (DRAFT)
   Iglo balok-es menyala dari dalam (three.js vendored, zero npm)
   + salju, kabut, ring telemetry, kamera orbit-ikut-scroll.
   Metafora produk: data aplikasi terkunci dalam balok es —
   Copilot menerangi dari dalam, hanya lewat skill read-only.
   ============================================================ */

import * as THREE from '/assets/vendor/three.module.min.js';

const canvas = document.getElementById('iglooCanvas');
const teleEl = document.getElementById('hudTele');
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
} catch {
  // WebGL tak tersedia — halaman tetap terbaca (CSS bg di belakang canvas)
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050d14);
scene.fog = new THREE.FogExp2(0x050d14, 0.052);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 120);

/* ---------- lights ---------- */
scene.add(new THREE.AmbientLight(0x22323f, 0.9));
const keyLight = new THREE.DirectionalLight(0xbfd9e8, 1.15);
keyLight.position.set(5, 8, 4);
scene.add(keyLight);
// cahaya DI DALAM iglo — "lapisan inteligensi"
const innerLight = new THREE.PointLight(0x7ed6f3, 3.6, 12, 2);
innerLight.position.set(0, 0.9, 0);
scene.add(innerLight);

/* ---------- ground + ring telemetry ---------- */
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(46, 48),
  new THREE.MeshStandardMaterial({ color: 0x0a141d, roughness: 1, metalness: 0 }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

for (const [rIn, rOut, op] of [[3.3, 3.34, 0.16], [4.4, 4.42, 0.1], [5.8, 5.82, 0.06]]) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(rIn, rOut, 96),
    new THREE.MeshBasicMaterial({ color: 0x7ed6f3, transparent: true, opacity: op, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.012;
  scene.add(ring);
}

/* ---------- iglo: balok es menyala dari dalam ---------- */
const igloo = new THREE.Group();

const ICE = new THREE.MeshStandardMaterial({
  color: 0xcfe6f2, roughness: 0.26, metalness: 0.06,
  transparent: true, opacity: 0.92,
});
const EDGE = new THREE.LineBasicMaterial({ color: 0x7ed6f3, transparent: true, opacity: 0.32 });

const domeR = 2.9;
const ROWS = 5;
const rowH = 0.52;

function addEdges(mesh) {
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 18), EDGE);
  mesh.add(edges);
}

for (let r = 0; r < ROWS; r++) {
  const frac = r / ROWS;                       // 0 = dasar
  const rowR = domeR * Math.cos(frac * Math.PI * 0.42);
  const y = 0.1 + r * rowH;
  const circ = 2 * Math.PI * rowR;
  const n = Math.max(7, Math.round(circ / 1.15));
  const arc = (Math.PI * 2) / n;

  for (let i = 0; i < n; i++) {
    const center = i * arc;
    // pintu di depan (menghadap kamera, theta = PI/2): skip balok baris dasar
    if (r === 0) {
      let d = Math.abs(center - Math.PI / 2);
      d = Math.min(d, Math.PI * 2 - d);
      if (d < arc * 0.62) continue;
    }
    const block = new THREE.Mesh(
      new THREE.CylinderGeometry(rowR, rowR, rowH * 0.88, 10, 1, false, center, arc * 0.86),
      ICE,
    );
    block.position.y = y;
    addEdges(block);
    igloo.add(block);
  }
}

// topi kubah
const cap = new THREE.Mesh(
  new THREE.SphereGeometry(
    domeR * Math.cos((ROWS / ROWS) * Math.PI * 0.42) + 0.02,
    28, 14, 0, Math.PI * 2, 0, Math.PI * 0.26,
  ),
  ICE,
);
cap.position.y = 0.1 + ROWS * rowH;
addEdges(cap);
igloo.add(cap);

// inti cahaya + halo sprite (bloom murah tanpa postprocessing)
const core = new THREE.Mesh(
  new THREE.SphereGeometry(0.58, 20, 14),
  new THREE.MeshBasicMaterial({ color: 0xffffff }),
);
core.position.set(0, 0.85, 0);
igloo.add(core);

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(158,228,250,0.9)');
  grad.addColorStop(0.35, 'rgba(126,214,243,0.32)');
  grad.addColorStop(1, 'rgba(126,214,243,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}
const halo = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
}));
halo.scale.set(9.5, 9.5, 1);
halo.position.set(0, 1.0, 0);
igloo.add(halo);

// halo luar kedua — pendar luas seperti bloom igloo.inc
const halo2 = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55,
}));
halo2.scale.set(16, 16, 1);
halo2.position.set(0, 1.0, 0);
igloo.add(halo2);

scene.add(igloo);

/* ---------- salju ---------- */
const SNOW_N = (innerWidth < 640 ? 420 : 760);
const snowGeo = new THREE.BufferGeometry();
const snowPos = new Float32Array(SNOW_N * 3);
const snowVel = new Float32Array(SNOW_N);
for (let i = 0; i < SNOW_N; i++) {
  snowPos[i * 3] = (Math.random() - 0.5) * 30;
  snowPos[i * 3 + 1] = Math.random() * 14;
  snowPos[i * 3 + 2] = (Math.random() - 0.5) * 30;
  snowVel[i] = 0.35 + Math.random() * 0.5;
}
snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({
  color: 0xdfeef7, size: 0.075, transparent: true, opacity: 0.8, depthWrite: false, sizeAttenuation: true,
}));
scene.add(snow);

/* ---------- kamera & loop ---------- */
let p = 0;                 // progress scroll 0..1
let pTarget = 0;
const camPos = new THREE.Vector3();
const lookAt = new THREE.Vector3();

function progress() {
  const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  return Math.min(1, Math.max(0, window.scrollY / max));
}

function placeCamera() {
  const ang = 0.5 + p * 0.95;
  const dist = 7.4 - p * 1.1;
  camPos.set(Math.sin(ang) * dist, 1.7 + p * 3.3, Math.cos(ang) * dist);
  camera.position.copy(camPos);
  lookAt.set(0, 0.9 + p * 0.7, 0);
  camera.lookAt(lookAt);
}

function placeCameraInstant() {
  p = pTarget = progress();
  placeCamera();
}

function resize() {
  const w = innerWidth, h = innerHeight;
  if (renderer) {
    renderer.setPixelRatio(Math.min(devicePixelRatio, w < 640 ? 1.75 : 2));
    renderer.setSize(w, h, false);
  }
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

let lastT = performance.now();
let teleLast = 0;

function frame(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000);
  lastT = t;

  p += (pTarget - p) * 0.075;
  placeCamera();

  igloo.rotation.y += dt * 0.05;
  innerLight.intensity = 2.4 + Math.sin(t * 0.0016) * 0.3;
  halo.material.opacity = 0.85 + Math.sin(t * 0.0011) * 0.12;

  // salju turun + goyang tipis
  const arr = snowGeo.attributes.position.array;
  for (let i = 0; i < SNOW_N; i++) {
    arr[i * 3 + 1] -= snowVel[i] * dt;
    arr[i * 3] += Math.sin(t * 0.0005 + i * 0.37) * 0.0016;
    if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 14;
  }
  snowGeo.attributes.position.needsUpdate = true;

  if (renderer) renderer.render(scene, camera);

  if (t - teleLast > 180 && teleEl) {
    teleLast = t;
    const deg = (((camPos.x / Math.max(0.001, camPos.z)) * 57.2958) + 360) % 360;
    teleEl.textContent = `// cam ${deg.toFixed(1)}° · d ${camPos.length().toFixed(1)} · p ${Math.round(p * 100)}%`;
  }
  requestAnimationFrame(frame);
}

/* ---------- init ---------- */
resize();
placeCameraInstant();
addEventListener('resize', () => { resize(); if (REDUCED && renderer) renderer.render(scene, camera); });

if (REDUCED) {
  // statis: render sekali + saat scroll/resize
  if (renderer) renderer.render(scene, camera);
  addEventListener('scroll', () => {
    placeCameraInstant();
    if (renderer) renderer.render(scene, camera);
  }, { passive: true });
} else {
  addEventListener('scroll', () => { pTarget = progress(); }, { passive: true });
  requestAnimationFrame(frame);
}

/* ---------- HUD fade + topbar + reveal ---------- */
const body = document.body;
let uiTick = false;
function updateUI() {
  if (uiTick) return;
  uiTick = true;
  requestAnimationFrame(() => {
    uiTick = false;
    const y = window.scrollY;
    body.classList.toggle('hud-off', y > innerHeight * 0.55);
    body.classList.toggle('tb-on', y > innerHeight * 0.9);
  });
}
addEventListener('scroll', updateUI, { passive: true });
updateUI();

const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) {
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  }
}, { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
