/* ============================================================
   gRouter Copilot — landing-saas engine (DRAFT)
   Hero 3D ala Linear-restrained: starfield + "core" intelijensi
   dengan BLOOM SUNGGUHAN via EffectComposer + UnrealBloomPass +
   OutputPass (pola selective-bloom dari skill threejs-postprocessing).
   Perf: hero-only render (IO gate), dpr cap, mobile star count turun,
   reduced-motion = render statis.
   ============================================================ */

import * as THREE from '/assets/vendor/three.module.min.js';
import { EffectComposer } from '/assets/vendor/three-addons/postprocessing/EffectComposer.js';
import { RenderPass } from '/assets/vendor/three-addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '/assets/vendor/three-addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '/assets/vendor/three-addons/postprocessing/OutputPass.js';

const canvas = document.getElementById('saasCanvas');
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOBILE = () => innerWidth < 640;

let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
} catch {
  // WebGL tak tersedia — hero tetap terbaca (bg CSS sama)
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x08090a);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(0, 0.2, 7.2);

/* ---------- lights ---------- */
scene.add(new THREE.AmbientLight(0x2a3038, 1.1));
const rim = new THREE.DirectionalLight(0x9fd8ea, 1.6);
rim.position.set(-4, 3, 5);
scene.add(rim);
const coreLight = new THREE.PointLight(0x22d3ee, 14, 12, 2);
coreLight.position.set(0, 0, 0);
scene.add(coreLight);

/* ---------- starfield (diam-diam, restrained) ---------- */
const starN = MOBILE() ? 420 : 900;
const starGeo = new THREE.BufferGeometry();
const sp = new Float32Array(starN * 3);
for (let i = 0; i < starN; i++) {
  sp[i * 3] = (Math.random() - 0.5) * 46;
  sp[i * 3 + 1] = (Math.random() - 0.5) * 26;
  sp[i * 3 + 2] = -2 - Math.random() * 22;
}
starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
  color: 0x9fb2bd, size: 0.045, transparent: true, opacity: 0.85,
  depthWrite: false, sizeAttenuation: true,
}));
scene.add(stars);

/* ---------- core: icosa wireframe + inti terang (yang bloom) ---------- */
const coreGroup = new THREE.Group();

const shell = new THREE.Mesh(
  new THREE.IcosahedronGeometry(1.55, 1),
  new THREE.MeshStandardMaterial({
    color: 0x0f1011, metalness: 0.92, roughness: 0.32,
    transparent: true, opacity: 0.94,
  }),
);
coreGroup.add(shell);

const wire = new THREE.LineSegments(
  new THREE.EdgesGeometry(shell.geometry),
  new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.42 }),
);
coreGroup.add(wire);

const heart = new THREE.Mesh(
  new THREE.SphereGeometry(0.5, 28, 20),
  new THREE.MeshBasicMaterial({ color: 0xbdf0ff }), // BRIGHT → tertangkap bloom
);
coreGroup.add(heart);

// orbit node kecil — skill satellites
const satGeo = new THREE.SphereGeometry(0.05, 10, 8);
const satMat = new THREE.MeshBasicMaterial({ color: 0x67e8f9 });
const sats = [];
for (let i = 0; i < 3; i++) {
  const s = new THREE.Mesh(satGeo, satMat);
  s.userData.a = (i / 3) * Math.PI * 2;
  s.userData.r = 2.15;
  s.userData.sp = 0.32 + i * 0.05;
  coreGroup.add(s);
  sats.push(s);
}

// posisi: bawah hero, jauh di bawah blok teks — pola Linear
coreGroup.position.set(0, -2.45, 0);
coreGroup.scale.setScalar(0.7);
scene.add(coreGroup);

/* ---------- composer: RenderPass → Bloom → Output ---------- */
let composer = null;
let bloomPass = null;
if (renderer) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(innerWidth, innerHeight),
    1.15,  // strength
    0.8,   // radius lebar — halus, tanpa artefak kotak
    0.75,  // threshold
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
}

function resize() {
  const w = innerWidth, h = Math.max(1, canvas.clientHeight || innerHeight);
  if (renderer) {
    renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE() ? 1.75 : 2));
    renderer.setSize(w, h, false);
  }
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (composer) composer.setSize(w, h);
}

/* ---------- pointer parallax (halus) ---------- */
const target = { x: 0, y: 0 };
if (matchMedia('(hover:hover) and (pointer:fine)').matches && !REDUCED) {
  addEventListener('pointermove', (e) => {
    target.x = (e.clientX / innerWidth - 0.5) * 2;
    target.y = (e.clientY / innerHeight - 0.5) * 2;
  }, { passive: true });
}

/* ---------- loop (hero-only) ---------- */
let running = true;
let rafId = 0;
const clock = new THREE.Clock();

function frame() {
  rafId = 0;
  if (!running) return;
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  coreGroup.rotation.y += dt * 0.12;
  wire.rotation.y -= dt * 0.05;
  heart.scale.setScalar(1 + Math.sin(t * 1.4) * 0.045);
  coreLight.intensity = 14 + Math.sin(t * 1.1) * 1.6;
  for (const s of sats) {
    const a = s.userData.a + t * s.userData.sp;
    s.position.set(Math.cos(a) * s.userData.r, Math.sin(a * 1.7) * 0.5, Math.sin(a) * s.userData.r);
  }
  stars.rotation.y += dt * 0.006;

  camera.position.x += ((target.x * 0.35) - camera.position.x) * 0.04;
  camera.position.y += ((0.2 - target.y * 0.22) - camera.position.y) * 0.04;
  camera.lookAt(0, -0.2, 0);

  if (composer) composer.render();
  else if (renderer) renderer.render(scene, camera);
  rafId = requestAnimationFrame(frame);
}

function start() { if (!rafId && running) rafId = requestAnimationFrame(frame); }
function stop() { if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } }

/* render statis untuk reduced-motion */
function renderStatic() {
  resize();
  camera.lookAt(0, -0.2, 0);
  if (composer) composer.render();
  else if (renderer) renderer.render(scene, camera);
}

resize();
addEventListener('resize', () => { resize(); if (REDUCED) renderStatic(); });

if (REDUCED) {
  renderStatic();
} else {
  // IO gate: hanya render saat hero terlihat
  new IntersectionObserver((entries) => {
    running = entries[0].isIntersecting;
    if (running) start(); else stop();
  }, { threshold: 0.02 }).observe(canvas.closest('.hero'));
  start();
}

/* ================= halaman ================= */

// topbar solid saat scroll
const body = document.body;
let uiTick = false;
addEventListener('scroll', () => {
  if (uiTick) return;
  uiTick = true;
  requestAnimationFrame(() => {
    uiTick = false;
    body.classList.toggle('tb-solid', window.scrollY > 24);
  });
}, { passive: true });

// reveal + "Linear Effect" glow per section
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) {
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  }
}, { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

const glowIO = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) {
      e.target.classList.add('lit');
      glowIO.unobserve(e.target);
    }
  }
}, { threshold: 0.25 });
document.querySelectorAll('.glow-sect').forEach((el) => glowIO.observe(el));

// pricing — server truth, pola sama dengan landing utama
const plansEl = document.getElementById('plans');
function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function money(v) { return 'Rp ' + Number(v).toLocaleString('id-ID'); }

fetch('/api/plans')
  .then((r) => { if (!r.ok) throw new Error('plans'); return r.json(); })
  .then((data) => {
    const list = (data.plans || []).filter((p) => p.active !== false);
    if (!list.length) throw new Error('empty');
    plansEl.innerHTML = list.map((p, i) =>
      '<article class="plan-card' + (i === 1 ? ' plan-featured' : '') + ' reveal">'
      + (i === 1 ? '<span class="plan-badge">Direkomendasikan</span>' : '')
      + '<span class="mono-label">' + esc(p.key || '') + '</span>'
      + '<h3>' + esc(p.name || p.key) + '</h3>'
      + '<div class="plan-price"><strong>' + esc(money(p.amount)) + '</strong>'
      + (p.expiresInDays ? '<span>/ ' + esc(p.expiresInDays) + ' hari</span>' : '') + '</div>'
      + '<p class="plan-quota">' + esc(p.quota || '') + '</p>'
      + '<ul class="plan-features">' + (p.features || []).slice(0, 5).map((f) => '<li>' + esc(f) + '</li>').join('') + '</ul>'
      + '<a class="btn ' + (i === 1 ? 'btn-primary' : 'btn-ghost') + ' btn-lg btn-block" href="/register" aria-label="Pilih paket ' + esc(p.name || p.key) + '">Pilih paket</a>'
      + '</article>').join('');
    plansEl.querySelectorAll('.reveal').forEach((el) => io.observe(el));
  })
  .catch(() => {
    plansEl.innerHTML = '<p class="plan-error">Katalog plan belum tersedia. Silakan coba lagi nanti.</p>';
  });
