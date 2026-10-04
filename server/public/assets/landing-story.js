/* ============================================================
   gRouter Copilot — landing-story engine (DRAFT)
   Pola aeronet.id terbukti dari recon live:
   - SATU canvas WebGL fixed persisten sepanjang halaman
   - spacer track per babak (100–170vh) = sumber progress
   - kamera + seluruh objek di-lerp kontinyu oleh scroll
   - bloom sungguhan (EffectComposer + UnrealBloomPass + OutputPass)
   - layer copy 2D crossfade per babak + stepper kanan
   Objek dunia (tema AI/automation): chip AI di papan sirkuit
   (aplikasi Anda) → kepala bot (skill read-only) → orb asisten +
   waveform (percakapan) → rak server + padlock (kunci di runtime)
   → pengiring menuju pricing/final.
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
  renderer.toneMappingExposure = 0.95;
} catch { /* WebGL mati — copy 2D tetap terbaca */ }

if (renderer) {
  renderer.shadowMap.enabled = !MOBILE();
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x040814);
scene.fog = new THREE.FogExp2(0x040814, 0.05);

const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 120);

/* ---------- lights ---------- */
scene.add(new THREE.AmbientLight(0x2a3850, 0.95));
const rim = new THREE.DirectionalLight(0x9fd8ea, 1.05);
rim.position.set(-5, 6, 4);
scene.add(rim);
const fill = new THREE.DirectionalLight(0x8fb8d8, 0.4);
fill.position.set(1.5, 2, 8);
scene.add(fill);
const coreLight = new THREE.PointLight(0x22d3ee, 1.2, 6, 2);
scene.add(coreLight);
// matahari bayangan — mengikuti titik pandang kamera (di-update per frame)
const sun = new THREE.DirectionalLight(0xbfe9ff, 2.1);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -3.4; sun.shadow.camera.right = 3.4;
sun.shadow.camera.top = 3.4; sun.shadow.camera.bottom = -3.4;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 22;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

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

/* kotak bersudut bulat (bevel) — kunci kesan 3D nyata: bevel menangkap cahaya */
function roundedBoxGeo(w, h, d, r, seg = 3) {
  r = Math.max(0.01, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01));
  const W = w - r * 2, H = h - r * 2, hw = W / 2, hh = H / 2;
  const s = new THREE.Shape();
  s.moveTo(-hw, -hh + r);
  s.lineTo(-hw, hh - r);
  s.quadraticCurveTo(-hw, hh, -hw + r, hh);
  s.lineTo(hw - r, hh);
  s.quadraticCurveTo(hw, hh, hw, hh - r);
  s.lineTo(hw, -hh + r);
  s.quadraticCurveTo(hw, -hh, hw - r, -hh);
  s.lineTo(-hw + r, -hh);
  s.quadraticCurveTo(-hw, -hh, -hw, -hh + r);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - r * 2, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: seg, steps: 1, curveSegments: 4 });
  g.translate(0, 0, -(d - r * 2) / 2);
  return g;
}

/* ---------- babak 0-1: CHIP AI — die + pin + jejak sirkuit (aplikasi Anda) ---------- */
const core = new THREE.Group();

const chipBody = new THREE.Mesh(
  roundedBoxGeo(1.55, 0.16, 1.55, 0.05),
  new THREE.MeshStandardMaterial({ color: 0x16283f, metalness: 0.45, roughness: 0.6 }),
);
chipBody.castShadow = true;
chipBody.position.y = -0.22;
core.add(chipBody);

const die = new THREE.Mesh(
  roundedBoxGeo(0.82, 0.12, 0.82, 0.035),
  new THREE.MeshStandardMaterial({ color: 0x101c30, metalness: 0.35, roughness: 0.75, emissive: 0x0a3a4a, emissiveIntensity: 0.2 }),
);
die.castShadow = true;
die.position.y = -0.09;
core.add(die);

const dieEdges = new THREE.LineSegments(
  new THREE.EdgesGeometry(die.geometry),
  new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.5 }),
);
dieEdges.position.y = -0.09;
core.add(dieEdges);

// inti pemrosesan yang denyut (otak chip)
const heart = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.26), new THREE.MeshBasicMaterial({ color: 0x1f5568 }));
heart.position.y = -0.01;
core.add(heart);

// pin chip (4 sisi)
const pins = [];
{
  const pinGeo = new THREE.BoxGeometry(0.05, 0.03, 0.3);
  const pinMat = new THREE.MeshStandardMaterial({ color: 0x56697e, metalness: 0.55, roughness: 0.5 });
  for (let s = 0; s < 4; s++) {
    for (let i = 0; i < 6; i++) {
      const pin = new THREE.Mesh(pinGeo, pinMat);
      const off = -0.625 + i * 0.25;
      if (s === 0) pin.position.set(off, -0.22, 0.95);
      else if (s === 1) { pin.position.set(off, -0.22, -0.95); pin.rotation.y = Math.PI; }
      else if (s === 2) { pin.position.set(0.95, -0.22, off); pin.rotation.y = Math.PI / 2; }
      else { pin.position.set(-0.95, -0.22, off); pin.rotation.y = -Math.PI / 2; }
      core.add(pin);
      pins.push(pin);
    }
  }
}

// jejak sirkuit keluar dari pin (garis terang di papan gelap) + pulsa data berjalan
const traces = [];
const pulses = [];
{
  const boardMat = new THREE.MeshStandardMaterial({ color: 0x081120, metalness: 0.4, roughness: 0.7 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.06, 2.8), boardMat);
  board.position.y = -0.31;
  core.add(board);

  const traceMat = new THREE.LineBasicMaterial({ color: 0x2c8ba8, transparent: true, opacity: 1 });
  for (let s = 0; s < 4; s++) {
    for (let i = 0; i < 6; i++) {
      const pts = [];
      const off = -0.625 + i * 0.25;
      const lane = off * 1.9;
      if (s === 0) pts.push(new THREE.Vector3(off, -0.28, 1.1), new THREE.Vector3(off, -0.28, lane + 0.6), new THREE.Vector3(lane * 1.25, -0.28, lane + 0.6));
      else if (s === 1) pts.push(new THREE.Vector3(off, -0.28, -1.1), new THREE.Vector3(off, -0.28, lane - 0.6), new THREE.Vector3(lane * 1.25, -0.28, lane - 0.6));
      else if (s === 2) pts.push(new THREE.Vector3(1.1, -0.28, off), new THREE.Vector3(lane + 0.6, -0.28, off), new THREE.Vector3(lane + 0.6, -0.28, -lane * 1.25));
      else pts.push(new THREE.Vector3(-1.1, -0.28, off), new THREE.Vector3(lane - 0.6, -0.28, off), new THREE.Vector3(lane - 0.6, -0.28, lane * 1.25));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), traceMat);
      core.add(line);
      traces.push(line);

      // pulsa: titik terang yang berjalan menyusuri jejak
      const pulse = makeNode(i % 2 ? CYAN : AMBER);
      pulse.scale.setScalar(0.55);
      pulse.userData = { pts, off: (s * 6 + i) / 24, sp: 0.16 + (i % 3) * 0.05 };
      core.add(pulse);
      pulses.push(pulse);
    }
  }
}

// node orbit (modul AI — sengaja redup agar tak bersaing dengan chip)
const orbitNodes = [];
for (let i = 0; i < 3; i++) {
  const n = makeNode(i % 2 ? 0xa9741f : 0x1e7a92);
  n.scale.setScalar(0.75);
  n.userData = { a: (i / 3) * Math.PI * 2, r: 2.2 + i * 0.35, sp: 0.25 + i * 0.04, tilt: (i - 1) * 0.3 };
  core.add(n);
  orbitNodes.push(n);
}

core.position.set(2.0, -1.0, 0);
core.scale.setScalar(0.92);
scene.add(core);

/* ---------- babak 2: BOT — kepala robot (skill read-only) ---------- */
const gate = new THREE.Group(); // nama variabel dipertahankan — direferensikan loop animasi & STOPS
{
  // kepala bot: kotak bevel solid (bevel menangkap cahaya — kesan 3D nyata, tanpa edges wireframe)
  const head = new THREE.Mesh(
    roundedBoxGeo(1.5, 1.15, 1.2, 0.16),
    new THREE.MeshStandardMaterial({ color: 0x182c46, metalness: 0.8, roughness: 0.35 }),
  );
  head.castShadow = true;
  gate.add(head);

  // leher + bahu
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.2, 0.3, 10),
    new THREE.MeshStandardMaterial({ color: 0x16273e, metalness: 0.8, roughness: 0.4 }),
  );
  neck.position.y = -0.72;
  gate.add(neck);

  // visor: kaca gelap clearcoat (refleksi env map — terlihat solid & mengilap)
  const visor = new THREE.Mesh(
    roundedBoxGeo(1.22, 0.5, 0.1, 0.06),
    new THREE.MeshPhysicalMaterial({ color: 0x050b14, metalness: 0.4, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.1 }),
  );
  visor.position.set(0, 0.08, 0.6);
  gate.add(visor);

  // mata: dua kapsul menyala di dalam visor (berkedip via scale)
  const eyeGeo = new THREE.CapsuleGeometry(0.055, 0.14, 4, 10);
  eyeGeo.rotateZ(Math.PI / 2);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x67e8f9 });
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.3, 0.08, 0.66);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeR.position.set(0.3, 0.08, 0.66);
  gate.add(eyeL, eyeR);
  gate.userData.eyes = [eyeL, eyeR];

  // antena: tiang + bola beacon yang denyut
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.42, 8),
    new THREE.MeshStandardMaterial({ color: 0x9fb2c9, metalness: 0.9, roughness: 0.3 }),
  );
  stem.position.set(0.42, 0.78, 0);
  gate.add(stem);
  const beacon = makeNode(AMBER);
  beacon.position.set(0.42, 1.04, 0);
  gate.add(beacon);
  gate.userData.beacon = beacon;

  // telinga/side pod
  const podGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.16, 12);
  podGeo.rotateZ(Math.PI / 2);
  const podMat = new THREE.MeshStandardMaterial({ color: 0x1b3a52, metalness: 0.85, roughness: 0.35 });
  const podL = new THREE.Mesh(podGeo, podMat);
  podL.position.set(-0.83, 0.05, 0);
  const podR = new THREE.Mesh(podGeo, podMat);
  podR.position.set(0.83, 0.05, 0);
  gate.add(podL, podR);

  // cincin halo read-only mengorbit atas kepala (sisa bahasa "gate" — batasan skill)
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(1.4, 0.024, 10, 72),
    new THREE.MeshBasicMaterial({ color: 0xbfeffd, transparent: true, opacity: 0.5 }),
  );
  halo.rotation.x = Math.PI / 1.9;
  halo.position.y = 0.52;
  gate.add(halo);
  gate.userData.halo = halo;
}
gate.position.set(3.2, -0.65, -7);
gate.scale.setScalar(0.72);
scene.add(gate);

/* ---------- babak 3: ASISTEN — orb + waveform + aliran Q/A (percakapan) ---------- */
const helix = new THREE.Group(); // nama dipertahankan — direferensikan loop animasi & STOPS
{
  // companion bot mini (kerabat bot SKILL — karakter konsisten) mengapung di atas waveform
  const bot = new THREE.Group();
  const bhead = new THREE.Mesh(
    roundedBoxGeo(0.7, 0.56, 0.56, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x26456a, metalness: 0.75, roughness: 0.35 }),
  );
  bhead.castShadow = true;
  bot.add(bhead);
  const bvisor = new THREE.Mesh(
    roundedBoxGeo(0.5, 0.2, 0.06, 0.04),
    new THREE.MeshPhysicalMaterial({ color: 0x050b14, metalness: 0.4, roughness: 0.12, clearcoat: 1 }),
  );
  bvisor.position.set(0, 0.03, 0.25);
  bot.add(bvisor);
  const beyeGeo = new THREE.CapsuleGeometry(0.028, 0.06, 4, 8);
  beyeGeo.rotateZ(Math.PI / 2);
  const beyeMat = new THREE.MeshBasicMaterial({ color: 0x67e8f9 });
  const beyeL = new THREE.Mesh(beyeGeo, beyeMat);
  beyeL.position.set(-0.12, 0.03, 0.27);
  const beyeR = new THREE.Mesh(beyeGeo, beyeMat);
  beyeR.position.set(0.12, 0.03, 0.27);
  bot.add(beyeL, beyeR);
  const bstem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.16, 8),
    new THREE.MeshStandardMaterial({ color: 0x9fb2c9, metalness: 0.9, roughness: 0.3 }),
  );
  bstem.position.set(0.16, 0.32, 0);
  bot.add(bstem);
  const bbeacon = makeNode(AMBER);
  bbeacon.scale.setScalar(0.8);
  bbeacon.position.set(0.16, 0.44, 0);
  bot.add(bbeacon);
  bot.position.set(-0.1, 1.62, 0.25);
  bot.rotation.y = 0.35;
  helix.add(bot);
  helix.userData.bot = bot;
  helix.userData.botBeacon = bbeacon;
  helix.userData.botEyes = [beyeL, beyeR];

  // orb asisten: bola menyala lembut (inti energi di bawah bot)
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 28, 20), new THREE.MeshBasicMaterial({ color: 0xa8ecff }));
  orb.position.y = 0.78;
  helix.add(orb);
  // aura pemrosesan: dua arc berputar (bukan cincin penuh — hindai kesan planet)
  const arcGeo = new THREE.TorusGeometry(0.44, 0.015, 8, 40, Math.PI * 0.7);
  const arcMat = new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.6 });
  const arcA = new THREE.Mesh(arcGeo, arcMat);
  arcA.position.y = 0.78;
  arcA.rotation.set(Math.PI / 2.8, 0, 0);
  const arcB = new THREE.Mesh(arcGeo, arcMat.clone());
  arcB.position.y = 0.78;
  arcB.rotation.set(Math.PI / 2.8, 0, Math.PI);
  helix.add(arcA, arcB);
  helix.userData.orb = orb;
  helix.userData.orbAura = arcA;
  helix.userData.orbAura2 = arcB;

  // waveform: bar menari di bawah orb (jawaban yang "bersuara")
  const bars = [];
  const barGeo = new THREE.BoxGeometry(0.13, 1, 0.13);
  const barMat = new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x0e4a5e, emissiveIntensity: 0.9, metalness: 0.4, roughness: 0.4 });
  const NB = MOBILE() ? 9 : 13;
  for (let i = 0; i < NB; i++) {
    const bar = new THREE.Mesh(barGeo, barMat);
    bar.position.set((i - (NB - 1) / 2) * 0.26, -0.45, 0);
    helix.add(bar);
    bars.push(bar);
  }
  helix.userData.bars = bars;

  // aliran percakapan: pertanyaan (amber) mengalir masuk, jawaban (cyan) keluar
  const qPath = [new THREE.Vector3(-2.6, 1.5, 0.3), new THREE.Vector3(-0.9, 1.1, 0.1), new THREE.Vector3(-0.2, 0.95, 0)];
  const aPath = [new THREE.Vector3(0.2, 0.8, 0), new THREE.Vector3(1.1, 0.55, 0.15), new THREE.Vector3(2.7, 0.2, 0.35)];
  const flowMatQ = new THREE.LineBasicMaterial({ color: 0x8a5a12, transparent: true, opacity: 0.5 });
  const flowMatA = new THREE.LineBasicMaterial({ color: 0x1e5f74, transparent: true, opacity: 0.5 });
  helix.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(qPath), flowMatQ));
  helix.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(aPath), flowMatA));

  const flows = [];
  for (let i = 0; i < 6; i++) {
    const isQ = i % 2 === 0;
    const node = makeNode(isQ ? AMBER : CYAN);
    node.scale.setScalar(0.6);
    node.userData = { path: isQ ? qPath : aPath, off: i / 6, sp: 0.22 + (i % 3) * 0.06 };
    helix.add(node);
    flows.push(node);
  }
  helix.userData.flows = flows;
}
helix.position.set(3.1, -0.3, -14);
scene.add(helix);

/* ---------- babak 4: SERVER RACK + PADLOCK — kunci di runtime (kendali) ---------- */
const dome = new THREE.Group(); // nama dipertahankan — direferensikan loop animasi & STOPS
{
  // tiga slab server bertumpuk — bevel + clearcoat panel depan (solid, bukan wireframe)
  const slabGeo = roundedBoxGeo(1.5, 0.34, 1.05, 0.045);
  const slabMat = new THREE.MeshStandardMaterial({ color: 0x0d1a2c, metalness: 0.7, roughness: 0.42 });
  const faceMat = new THREE.MeshStandardMaterial({ color: 0x10233a, metalness: 0.5, roughness: 0.3 });
  const leds = [];
  for (let i = 0; i < 3; i++) {
    const y = -0.5 + i * 0.46;
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.position.y = y;
    slab.castShadow = true;
    dome.add(slab);
    // panel muka mengilap
    const face = new THREE.Mesh(roundedBoxGeo(1.36, 0.2, 0.03, 0.03), faceMat);
    face.position.set(0, y + 0.02, 0.5);
    dome.add(face);
    // LED aktivitas di muka slab + slot drive
    for (let l = 0; l < 3; l++) {
      const led = makeNode(l === 1 ? AMBER : CYAN);
      led.scale.setScalar(0.5);
      led.position.set(-0.5 + l * 0.16, y + 0.08, 0.54);
      dome.add(led);
      leds.push(led);
    }
    const slot = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.045, 0.02),
      new THREE.MeshBasicMaterial({ color: 0x1b3a52 }),
    );
    slot.position.set(0.28, y + 0.06, 0.54);
    dome.add(slot);
  }
  dome.userData.leds = leds;

  // padlock melayang di depan atas rak (kunci tidak pernah keluar)
  const lock = new THREE.Group();
  const shackle = new THREE.Mesh(
    new THREE.TorusGeometry(0.17, 0.045, 10, 24, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x9fb2c9, metalness: 0.9, roughness: 0.25 }),
  );
  shackle.position.y = 0.14;
  lock.add(shackle);
  const body = new THREE.Mesh(
    roundedBoxGeo(0.4, 0.32, 0.16, 0.05),
    new THREE.MeshPhysicalMaterial({ color: 0x132c42, metalness: 0.65, roughness: 0.3, clearcoat: 0.8 }),
  );
  body.castShadow = true;
  lock.add(body);
  const keyhole = makeNode(CYAN);
  keyhole.scale.setScalar(0.55);
  keyhole.position.set(0, 0.02, 0.09);
  lock.add(keyhole);
  lock.position.set(0, 1.15, 0.55);
  dome.add(lock);
  dome.userData.lock = lock;
}
dome.position.set(3.3, -0.8, -21);
dome.scale.setScalar(0.72);
scene.add(dome);

/* ---------- fade per babak: objek babak lain meredup (fokus satu babak, bukan diorama) ---------- */
const FADES = [
  { obj: core, a: -0.2, b: 1.4 },
  { obj: gate, a: 1.4, b: 2.7 },
  { obj: helix, a: 2.4, b: 3.7 },
  { obj: dome, a: 3.4, b: 6.2 },
];
for (const fd of FADES) {
  fd.mats = [];
  fd.obj.traverse((o) => {
    if (o.material && o.material.color) fd.mats.push({ m: o.material, c: o.material.color.clone() });
  });
}
function applyFades(f) {
  for (const fd of FADES) {
    let k;
    if (f >= fd.a && f <= fd.b) k = 1;
    else if (f < fd.a) k = Math.max(0.08, 1 - (fd.a - f) / 0.7);
    else k = Math.max(0.08, 1 - (f - fd.b) / 0.7);
    for (const e of fd.mats) e.m.color.copy(e.c).multiplyScalar(k);
  }
}

/* ---------- lingkungan & lantai: env map PBR + grid + bayangan (kedalaman nyata) ---------- */
let envReady = false;
if (renderer) {
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.background = null;
    envScene.add(new THREE.Mesh(
      new THREE.SphereGeometry(40, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0x0a1428, side: THREE.BackSide }),
    ));
    const e1 = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 12), new THREE.MeshBasicMaterial({ color: 0x2b6a80 }));
    e1.position.set(-14, 10, -6);
    const e2 = new THREE.Mesh(new THREE.SphereGeometry(1.8, 16, 12), new THREE.MeshBasicMaterial({ color: 0x8a5a1a }));
    e2.position.set(12, -6, -14);
    envScene.add(e1, e2);
    const envRT = pmrem.fromScene(envScene, 0.04);
    scene.environment = envRT.texture;
    pmrem.dispose();
    envReady = true;
  } catch { /* env gagal — material tetap jalan tanpa refleksi */ }
}

const FLOOR_Y = -2.1;
{
  // lantai gelap menerima bayangan
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x05090f, metalness: 0.2, roughness: 0.85 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  floor.receiveShadow = true;
  scene.add(floor);

  // grid halus — garis perspektif yang memberi kedalaman
  const grid = new THREE.GridHelper(80, 40, 0x123048, 0x0c2032);
  grid.position.y = FLOOR_Y + 0.01;
  grid.material.transparent = true;
  grid.material.opacity = 0.5;
  grid.material.fog = true;
  scene.add(grid);
}

// drifter: balok bervolume melayang sepanjang perjalanan (parallax depth saat kamera lewat)
const drifters = [];
{
  const dGeos = [roundedBoxGeo(0.5, 0.5, 0.5, 0.09), roundedBoxGeo(0.34, 0.7, 0.34, 0.07), new THREE.OctahedronGeometry(0.3)];
  const N = MOBILE() ? 10 : 18;
  for (let i = 0; i < N; i++) {
    const m = new THREE.Mesh(
      dGeos[i % 3],
      new THREE.MeshStandardMaterial({ color: 0x152440, metalness: 0.6, roughness: 0.5 }),
    );
    m.material.color.setHex(0x152440);
    const side = i % 2 ? 1 : -1;
    m.position.set(side * (2.2 + Math.random() * 2.6), -1.5 + Math.random() * 2.6, 2 - (i / N) * 32);
    m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    m.userData = { sp: 0.1 + Math.random() * 0.25, ph: Math.random() * Math.PI * 2, y0: m.position.y };
    m.castShadow = true;
    scene.add(m);
    drifters.push(m);
  }
}

/* ---------- koridor terbang: dinding blok instanced + gerbang cincin (fly-through feel) ---------- */
const AXIS = { x: 1.2, y: -0.5 };
let corridor = null; // hoisted — dirujuk loop animasi (sway halus)
{
  const N = MOBILE() ? 90 : 220;
  const blockGeo = roundedBoxGeo(0.3, 0.3, 0.3, 0.05, 2);
  const blockMat = new THREE.MeshStandardMaterial({ color: 0x1b3a52, metalness: 0.75, roughness: 0.32 });
  corridor = new THREE.InstancedMesh(blockGeo, blockMat, N);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < N; i++) {
    const z = 7 - (i / N) * 38 - Math.random() * 0.8;
    const ang = Math.random() * Math.PI * 2;
    const rad = 2.7 + Math.random() * 2.7;
    dummy.position.set(
      AXIS.x + Math.cos(ang) * rad * 1.25,
      AXIS.y + Math.sin(ang) * rad * 0.75,
      z,
    );
    dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    dummy.scale.setScalar(0.6 + Math.random() * 1.5);
    dummy.updateMatrix();
    corridor.setMatrixAt(i, dummy.matrix);
  }
  corridor.instanceMatrix.needsUpdate = true;
  corridor.castShadow = true;
  corridor.receiveShadow = true;
  scene.add(corridor);
}

// cincin gerbang yang DILEWATI kamera (flyby moment antar babak)
const gateRings = [];
{
  const ringMat = new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.14 });
  for (const z of [-3.2, -8.2, -13.2, -18.2]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.02, 8, 64), ringMat.clone());
    ring.position.set(AXIS.x, AXIS.y, z);
    ring.rotation.y = Math.random() * 0.4 - 0.2;
    scene.add(ring);
    gateRings.push(ring);
  }
}

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
  { pos: [0.0, 0.6, 7.2], look: [1.35, -0.5, -2.5] },   // intro — terbang masuk ke koridor
  { pos: [2.6, -0.2, 1.2], look: [1.1, -0.6, -3.0] },   // data — keliling chip, menghadap lorong
  { pos: [1.15, -0.45, -3.6], look: [1.5, -0.5, -7.5] },  // skill — bot di depan, terbang rendah
  { pos: [1.25, -0.55, -9.4], look: [1.45, -0.5, -14.5] }, // chat — threading antar gate rings
  { pos: [1.1, -0.7, -15.8], look: [1.55, -0.6, -21.5] },  // kendali — rak di depan
  { pos: [0.9, 0.4, -22.8], look: [1.2, -0.4, -26.0] },   // harga — naik, dunia mengalir di bawah
  { pos: [0.8, 1.2, -26.5], look: [-1.2, 0.2, -33.0] },   // final — keluar koridor ke ruang terbuka
];
// mobile: layar sempit & copy stack di atas — objek ditempatkan di sepertiga BAWAH frame
// (look.y dinaikkan → objek turun di layar; look.x sedikit ke objek; kamera mundur)
if (MOBILE()) {
  for (const s of STOPS) {
    s.pos = [s.pos[0] * 0.85, s.pos[1] + 0.4, s.pos[2] + 1.6];
    s.look = [s.look[0] + 0.4, s.look[1] + 1.6, s.look[2]];
  }
}

const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
const A = new THREE.Vector3();
const B = new THREE.Vector3();
let lastSf = 0; // kecepatan kamera utk FOV/banking

function progress01() {
  const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  return Math.min(1, Math.max(0, window.scrollY / max));
}

// progress 0..1 → segmen STOPS (0..6) kontinyu
function stopFloat(p) {
  return p * (STOPS.length - 1);
}

/* ---------- mouse parallax (desktop) — kamera hidup merespons pointer ---------- */
const par = { x: 0, y: 0, tx: 0, ty: 0 };
if (!REDUCED && matchMedia('(pointer:fine)').matches) {
  addEventListener('pointermove', (e) => {
    par.tx = (e.clientX / innerWidth - 0.5) * 2;
    par.ty = (e.clientY / innerHeight - 0.5) * 2;
  }, { passive: true });
}

function applyStop(f) {
  const i = Math.min(STOPS.length - 2, Math.floor(f));
  const t = f - i;
  A.fromArray(STOPS[i].pos); B.fromArray(STOPS[i + 1].pos);
  camPos.lerpVectors(A, B, t);
  A.fromArray(STOPS[i].look); B.fromArray(STOPS[i + 1].look);
  camLook.lerpVectors(A, B, t);
  // parallax offset kecil pada posisi + target (desktop)
  par.x += (par.tx - par.x) * 0.04;
  par.y += (par.ty - par.y) * 0.04;
  if (!MOBILE()) {
    camPos.x += par.x * 0.18; camPos.y += -par.y * 0.12;
    camLook.x += par.x * 0.32; camLook.y += -par.y * 0.2;
  }
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  // kecepatan → FOV melebar (sensasi terbang) + banking mengikuti arah belok (ala igloo/aeronet)
  const vel = f - lastSf;
  lastSf = f;
  const targetFov = 72 + Math.min(15, Math.abs(vel) * 420);
  camera.fov += (targetFov - camera.fov) * 0.09;
  camera.updateProjectionMatrix();
  const bank = Math.max(-0.12, Math.min(0.12, -vel * 160)) + Math.sin(clock.elapsedTime * 0.5) * 0.012;
  camera.rotateZ(bank);
}

/* ---------- composer ---------- */
let composer = null;
if (renderer) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.8, 0.9));
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
  const sf = stopFloat(p);
  applyStop(sf);
  applyFades(sf);

  // matahari bayangan mengikuti titik pandang
  sun.position.set(camPos.x - 3, camPos.y + 5.5, camPos.z - 2);
  sun.target.position.set(camPos.x + 0.6, FLOOR_Y, camPos.z - 2.5);
  sun.target.updateMatrixWorld();

  // — chip AI: rotasi + denyut inti + pulsa data menyusuri jejak sirkuit
  core.rotation.y += dt * 0.22;
  dieEdges.rotation.y -= dt * 0.05;
  heart.scale.setScalar(1 + Math.sin(t * 2.4) * 0.12);
  coreLight.position.copy(heart.getWorldPosition(new THREE.Vector3()));
  coreLight.intensity = 16 + Math.sin(t * 1.6) * 2.4;
  for (const pl of pulses) {
    const u = (pl.userData.off + t * pl.userData.sp) % 1;
    const seg = u < 0.5 ? 0 : 1;
    pl.position.lerpVectors(pl.userData.pts[seg], pl.userData.pts[seg + 1], (u - seg * 0.5) * 2);
  }
  for (const n of orbitNodes) {
    const a = n.userData.a + t * n.userData.sp;
    n.position.set(Math.cos(a) * n.userData.r, Math.sin(a * 1.4) * 0.8 + n.userData.tilt * 0.4, Math.sin(a) * n.userData.r);
  }

  // — bot: sway menghadap + kedip mata + beacon denyut + halo berputar
  gate.rotation.y = Math.sin(t * 0.5) * 0.3;
  gate.userData.halo.rotation.z = t * 0.5;
  const bt = t % 3.4;
  const eyeS = bt < 3.2 ? 1 : Math.max(0.1, Math.abs(1 - (bt - 3.2) * 12));
  for (const e of gate.userData.eyes) e.scale.y = eyeS;
  gate.userData.beacon.scale.setScalar(1 + Math.sin(t * 3.2) * 0.3);

  // — asisten: orb bernafas + arc berputar + bar waveform menari + bot mini mengapung + node Q/A mengalir
  helix.userData.orb.scale.setScalar(1 + Math.sin(t * 2.2) * 0.06);
  helix.userData.orbAura.rotation.z = t * 0.8;
  helix.userData.orbAura2.rotation.z = -t * 0.8 + Math.PI;
  helix.userData.bot.position.y = 1.62 + Math.sin(t * 1.4) * 0.07;
  helix.userData.bot.rotation.y = 0.35 + Math.sin(t * 0.6) * 0.22;
  helix.userData.botBeacon.scale.setScalar(0.8 + Math.sin(t * 3.4) * 0.25);
  const bars = helix.userData.bars;
  for (let i = 0; i < bars.length; i++) {
    const h = 0.25 + Math.abs(Math.sin(t * 2.6 + i * 0.55)) * 0.75;
    bars[i].scale.y = h;
    bars[i].position.y = -0.45 + (h - 1) / 2;
  }
  for (const f of helix.userData.flows) {
    const u = (f.userData.off + t * f.userData.sp) % 1;
    const seg = u < 0.5 ? 0 : 1;
    f.position.lerpVectors(f.userData.path[seg], f.userData.path[seg + 1], (u - seg * 0.5) * 2);
  }

  // — rak server: LED denyut bergelombang + padlock melayang (kunci tetap di runtime)
  const leds = dome.userData.leds;
  for (let i = 0; i < leds.length; i++) {
    leds[i].scale.setScalar(0.35 + Math.max(0, Math.sin(t * 3 - i * 0.9)) * 0.35);
  }
  dome.userData.lock.position.y = 1.15 + Math.sin(t * 1.8) * 0.06;
  dome.userData.lock.rotation.y = Math.sin(t * 0.6) * 0.25;

  // — koridor hidup: cincin spin + denyut, dinding sway halus
  for (let i = 0; i < gateRings.length; i++) {
    const r = gateRings[i];
    r.rotation.z = t * (i % 2 ? 0.18 : -0.14);
    r.material.opacity = 0.11 + Math.abs(Math.sin(t * 0.9 + i * 1.3)) * 0.1;
  }
  corridor.rotation.y = Math.sin(t * 0.05) * 0.025;

  // — drifter: mengapung + berputar pelan (parallax depth)
  for (const d of drifters) {
    d.position.y = d.userData.y0 + Math.sin(t * d.userData.sp + d.userData.ph) * 0.3;
    d.rotation.x += dt * 0.08; d.rotation.y += dt * 0.11;
  }
  stars.rotation.y = t * 0.004;

  if (composer) composer.render();
  else if (renderer) renderer.render(scene, camera);
  rafId = requestAnimationFrame(frame);
}

function renderOnce() {
  const sf = stopFloat(pTarget);
  applyStop(sf);
  applyFades(sf);
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
