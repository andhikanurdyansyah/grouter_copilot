/* ============================================================
   gRouter Copilot — landing.js (SCRUB CUT v2 · CINEMATIC GLASS)
   300-frame scroll scrub di canvas (Apple-style image sequence)
   + babak sinematik bernomor + pagination 01–04 + komponen ground.
   Semua gerakan di-gate motionAllowed(); ?motion=1 memaksa
   gerakan walau OS melaporkan prefers-reduced-motion (QA).
   Zero dependencies.
   ============================================================ */
(function () {
  'use strict';

  var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var fineHover = window.matchMedia('(hover: hover) and (pointer: fine)');
  var forceMotion = /[?&]motion=1/.test(location.search);
  function motionAllowed() { return forceMotion || !reduceMQ.matches; }

  /* ---------------- nav scrolled state ---------------- */
  var nav = document.getElementById('siteNav');
  function navState() {
    if (nav) nav.classList.toggle('is-scrolled', (window.scrollY || 0) > 20);
  }
  window.addEventListener('scroll', navState, { passive: true });
  navState();

  /* ---------------- IO reveals (once, stateless) ---------------- */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      en.target.classList.add('is-in');
      io.unobserve(en.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });

  /* ============================================================
     THE SCRUB — 300-frame image sequence on canvas
     - progres = journey-only (ground membekukan frame 300)
     - lerp eksponensial (0.16) = scrub halus walau scroll kasar
     - best-effort nearest-loaded frame = tidak pernah blank
     ============================================================ */
  var canvas = document.getElementById('scrubCanvas');
  var journey = document.getElementById('journey');
  var ctx = canvas ? canvas.getContext('2d', { alpha: false }) : null;

  var FRAME_COUNT = 300;
  var FRAME_AT_GROUND = 300;
  var FRAME_BASE = '/assets/landing-bot/ezgif-2c442a8b14192578-jpg/ezgif-frame-';
  var FRAME_EXT = '.jpg';
  var images = new Array(FRAME_COUNT + 1);
  var currentFrame = 1;
  var targetFrame = 1;
  var lastDrawn = -1;
  var dprCap = 2;
  var resizeDirty = false;

  function frameUrl(i) {
    return FRAME_BASE + String(i).padStart(3, '0') + FRAME_EXT;
  }
  function isReady(img) {
    return img && img.complete && img.naturalWidth > 0;
  }
  function loadFrame(i) {
    if (i < 1 || i > FRAME_COUNT) return null;
    if (images[i]) return images[i];
    var img = new Image();
    img.decoding = 'async';
    images[i] = img;
    img.onload = function () {
      if (Math.round(currentFrame) === i) drawNow();
    };
    img.src = frameUrl(i);
    return img;
  }
  function bestImage(idx) {
    if (isReady(images[idx])) return images[idx];
    loadFrame(idx);
    for (var off = 1; off < FRAME_COUNT; off++) {
      var p = idx - off;
      if (p >= 1 && isReady(images[p])) return images[p];
      var n = idx + off;
      if (n <= FRAME_COUNT && isReady(images[n])) return images[n];
    }
    return isReady(images[1]) ? images[1] : null;
  }

  function resizeCanvas() {
    if (!canvas || !ctx) return;
    var dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    var w = window.innerWidth || document.documentElement.clientWidth;
    var h = window.innerHeight || document.documentElement.clientHeight;
    var nw = Math.max(1, Math.round(w * dpr));
    var nh = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== nw || canvas.height !== nh) {
      canvas.width = nw;
      canvas.height = nh;
      lastDrawn = -1;
      resizeDirty = true;
      drawNow();
    }
  }

  function drawNow() {
    if (!ctx) return;
    var idx = Math.round(currentFrame);
    idx = Math.min(FRAME_COUNT, Math.max(1, idx));
    var img = bestImage(idx);
    if (!img) return;
    var cw = canvas.width, ch = canvas.height;
    var iw = img.naturalWidth, ih = img.naturalHeight;
    if (!iw || !ih) return;
    /* cover + sedikit overscan (1.02) supaya resize tidak menampakkan tepi */
    var scale = Math.max(cw / iw, ch / ih) * 1.02;
    var sw = iw * scale, sh = ih * scale;
    var x = (cw - sw) / 2, y = (ch - sh) / 2;
    ctx.drawImage(img, x, y, sw, sh);
    lastDrawn = idx;
    resizeDirty = false;
  }

  /* progres journey (bukan seluruh dokumen) */
  function journeyProgress() {
    if (!journey) return 0;
    var rect = journey.getBoundingClientRect();
    var vh = window.innerHeight || 1;
    var total = rect.height - vh;
    if (total <= 0) return rect.top < 0 ? 1 : 0;
    return Math.min(1, Math.max(0, -rect.top / total));
  }
  function updateTarget() {
    var p = journeyProgress();
    targetFrame = 1 + p * (FRAME_AT_GROUND - 1);
    /* journey selesai → kontrol babak memudar (ground bersih) */
    document.body.classList.toggle('jch-ui-off', p >= 0.985);
  }

  var idleArmed = true;
  var breathe = {z: 1, y: 0, curZ: 1.04, curY: 0};
  function renderStage() {
    if (!journey || !ctx) return;
    var vh = window.innerHeight || 1;
    var mid = window.scrollY + vh / 2;
    /* babak aktif = berisi viewport center */
    var idx = 0;
    for (var i = 0; i < chapterEls.length; i++) {
      if (mid >= chapterEls[i].el.offsetTop) idx = i;
    }
    var el = chapterEls[idx].el;
    var top = el.offsetTop, h = el.offsetHeight;
    var bt = Math.min(1, Math.max(0, (mid - top) / Math.max(1, h)));
    /* kamera per babak: push-in pelan + drift vertikal (feel sinematik) */
    breathe.z = 1.03 + bt * 0.05 + idx * 0.006;
    breathe.y = (0.5 - bt) * 3.2;
  }
  function loop() {
    var diff = targetFrame - currentFrame;
    if (Math.abs(diff) > 0.004) {
      currentFrame += diff * 0.16;
      idleArmed = true;
      drawNow();
    } else if (idleArmed) {
      currentFrame = targetFrame;
      drawNow();
      idleArmed = false;
    }
    /* breathing: canvas selalu hidup pelan (kamera), walau frame diam */
    if (motionAllowed() && journey && journey.getBoundingClientRect().bottom > 0) {
      breathe.curZ += (breathe.z - breathe.curZ) * 0.06;
      breathe.curY += (breathe.y - breathe.curY) * 0.06;
      if (Math.abs(breathe.z - breathe.curZ) > 0.0001 || Math.abs(breathe.y - breathe.curY) > 0.001) {
        var cv = canvas.style;
        var t = 'scale(' + breathe.curZ.toFixed(4) + ') translate3d(0,' + breathe.curY.toFixed(2) + '%,0)';
        if (cv.transform !== t) cv.transform = t;
      }
    }
    requestAnimationFrame(loop);
  }

  function preload() {
    [1, 5, 95, 195, 295, 300].forEach(loadFrame);
    var i;
    for (i = 6; i <= FRAME_COUNT; i += 6) loadFrame(i);
    setTimeout(function () {
      for (i = 1; i <= FRAME_COUNT; i++) if (i % 6 !== 0) loadFrame(i);
    }, 1200);
  }

  /* ============================================================
     PAGINATION BABAK 01–04 (referensi: 01 02 03 + garis aktif)
     - aktif = babak yang copy-nya paling dekat ke tengah viewport
     - garis ice-cyan merayap di bawah angka aktif
     - klik = lompat halus ke babak tersebut
     ============================================================ */
  var chapterEls = [];
  document.querySelectorAll('.jch').forEach(function (el) {
    chapterEls.push({ el: el, copy: el.querySelector('.copy') });
  });
  var pagBtns = Array.prototype.slice.call(document.querySelectorAll('.ch-pagination button'));
  var pagLine = document.getElementById('chPagLine');

  function updatePagination() {
    if (!pagBtns.length) return;
    var vh = window.innerHeight || 1;
    var best = 0, bestDist = Infinity;
    for (var i = 0; i < chapterEls.length; i++) {
      var r = chapterEls[i].el.getBoundingClientRect();
      var d = Math.abs(r.top + r.height / 2 - vh / 2);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    for (var b = 0; b < pagBtns.length; b++) {
      pagBtns[b].classList.toggle('is-active', b === best);
    }
    if (pagLine && pagBtns[best]) {
      var pb = pagBtns[best];
      pagLine.style.left = pb.offsetLeft + 'px';
      pagLine.style.width = pb.offsetWidth + 'px';
    }
  }
  pagBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var t = document.getElementById(btn.getAttribute('data-target'));
      if (!t) return;
      t.scrollIntoView({ behavior: motionAllowed() ? 'smooth' : 'auto', block: 'center' });
    });
  });

  /* scroll-hint → babak berikutnya */
  var hint = document.querySelector('.scroll-hint');
  if (hint) hint.addEventListener('click', function () {
    var t = document.getElementById('produk');
    if (t) t.scrollIntoView({ behavior: motionAllowed() ? 'smooth' : 'auto', block: 'center' });
  });

  /* ============================================================
     Parallax ringan babak (hanya saat motion diizinkan)
     ============================================================ */
  function parallax() {
    if (!motionAllowed()) return;
    var vh = window.innerHeight || 1;
    for (var i = 0; i < chapterEls.length; i++) {
      var c = chapterEls[i];
      if (!c.copy) continue;
      var r = c.el.getBoundingClientRect();
      if (r.bottom < -80 || r.top > vh + 80) continue;
      var t = (r.top + r.height / 2 - vh / 2) / (vh + r.height);
      c.copy.style.transform = 'translate3d(0,' + (t * 26).toFixed(1) + 'px,0)';
    }
  }

  /* ============================================================
     3D CARDS — event delegation di document:
     - rotateX/Y mengikuti posisi pointer relatif kartu terdekat
     - konten melayang (translateZ di CSS) + sheen --sx/--sy
     - bekerja juga untuk .plan-card hasil fetch (delegated)
     - gate motionAllowed() DI SAAT EVENT + pointer fine saja
     ============================================================ */
  function card3dDelegation() {
    if (!fineHover.matches) return;
    var active = null, raf = 0, lastEv = null;
    function apply() {
      raf = 0;
      if (!active || !lastEv) return;
      if (!motionAllowed()) { active.style.transform = ''; active = null; return; }
      var el = active;
      var r = el.getBoundingClientRect();
      var nx = (lastEv.clientX - r.left) / Math.max(1, r.width) - 0.5;
      var ny = (lastEv.clientY - r.top) / Math.max(1, r.height) - 0.5;
      var max = 9;
      el.style.transform = 'perspective(900px) rotateX(' + (ny * -max).toFixed(2) + 'deg) rotateY(' + (nx * max).toFixed(2) + 'deg) translateZ(8px) scale(1.015)';
      el.style.setProperty('--sx', ((nx + 0.5) * 100).toFixed(1) + '%');
      el.style.setProperty('--sy', ((ny + 0.5) * 100).toFixed(1) + '%');
    }
    document.addEventListener('pointerover', function (ev) {
      var el = ev.target && ev.target.closest ? ev.target.closest('.card3d') : null;
      if (el && el !== active) { if (active) active.style.transform = ''; active = el; }
    });
    document.addEventListener('pointermove', function (ev) {
      if (!active) return;
      var still = ev.target && ev.target.closest && ev.target.closest('.card3d') === active;
      if (!still) { active.style.transform = ''; active = null; return; }
      lastEv = ev;
      if (!raf) raf = requestAnimationFrame(apply);
    }, { passive: true });
    document.addEventListener('pointerout', function (ev) {
      if (!active) return;
      var to = ev.relatedTarget;
      if (!to || !to.closest || to.closest('.card3d') !== active) {
        active.style.transform = '';
        active = null;
      }
    });
  }

  /* ---------------- wiring ---------------- */
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      updateTarget();
      updatePagination();
      parallax();
      renderStage();
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () {
    resizeCanvas();
    onScroll();
  }, { passive: true });
  window.addEventListener('orientationchange', function () {
    resizeCanvas();
  }, { passive: true });
  window.addEventListener('load', function () {
    resizeCanvas();
    updateTarget();
    updatePagination();
    parallax();
    renderStage();
  });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { resizeDirty = true; drawNow(); }
  });

  resizeCanvas();
  updateTarget();
  updatePagination();
  drawNow();
  preload();
  card3dDelegation();
  renderStage();
  requestAnimationFrame(loop);

  /* reduced-motion: scrub langsung tanpa lerp (kanvas = konten) */
  if (!motionAllowed()) {
    var direct = function () {
      currentFrame = targetFrame = 1 + journeyProgress() * (FRAME_AT_GROUND - 1);
      drawNow();
    };
    window.addEventListener('scroll', direct, { passive: true });
    direct();
  }
})();
