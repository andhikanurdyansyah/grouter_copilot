/* ============================================================
   gRouter Copilot — landing.js (SCRUB CUT v1, 2026-10-03)
   300-frame scroll scrub di canvas (Apple-style image sequence)
   + babak cerita mengambang + komponen ground.
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

  /* ---------------- giant letters split ----------------
     <span data-word="COPILOT" data-acc="2"> → .g outline / .ga accent,
     stagger via --i, entrance saat .giant dapat .is-in (IO). */
  document.querySelectorAll('.giant span[data-word]').forEach(function (el) {
    var word = el.getAttribute('data-word') || '';
    var acc = parseInt(el.getAttribute('data-acc') || '-1', 10);
    var frag = '';
    for (var i = 0; i < word.length; i++) {
      frag += '<span class="' + (i === acc ? 'ga' : 'g') + '" style="--i:' + i + '">' + word[i] + '</span>';
    }
    el.innerHTML = frag;
  });

  /* ---------------- IO reveals (once, stateless) ---------------- */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      en.target.classList.add('is-in');
      io.unobserve(en.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  document.querySelectorAll('.reveal, .giant').forEach(function (el) { io.observe(el); });

  /* ============================================================
     THE SCRUB — 300-frame image sequence on canvas
     - .journey (4 babak) = track scroll utama; total panjang
       didorong tinggi babak + GROUND di bawahnya.
     - frame target = progres scroll 0→1 memetakan 1→300,
       TAPI dibatasi sampai FRAME_AT_GROUND: setelah journey
       selesai lewat viewport, canvas membeku di frame ambient.
     - lerp eksponensial (0.16) = scrub halus walau scroll kasar.
     - best-effort nearest-loaded frame = tidak pernah blank.
     ============================================================ */
  var canvas = document.getElementById('scrubCanvas');
  var scrubBar = document.getElementById('scrubBar');
  var journey = document.getElementById('journey');
  var ctx = canvas ? canvas.getContext('2d', { alpha: false }) : null;

  var FRAME_COUNT = 300;
  var FRAME_AT_GROUND = 300; /* frame saat konten ground menutupi layar */
  var FRAME_BASE = '/assets/landing-bot/ezgif-2c442a8b14192578-jpg/ezgif-frame-';
  var FRAME_EXT = '.jpg';
  var images = new Array(FRAME_COUNT + 1);
  var currentFrame = 1;
  var targetFrame = 1;
  var lastDrawn = -1;
  var scrubReady = false;

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

  var dprCap = 2;
  var resizeDirty = false;
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

  /* progres journey (bukan seluruh dokumen):
     0 saat journey top menyentuh atas viewport,
     1 saat journey bottom menyentuh bawah viewport. */
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
    if (scrubBar) scrubBar.style.width = (p * 100).toFixed(2) + '%';
    targetFrame = 1 + p * (FRAME_AT_GROUND - 1);
  }

  var idleArmed = true;
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
    requestAnimationFrame(loop);
  }

  function preload() {
    /* frame kunci tiap babak + sampel tiap 6 frame dulu, lalu sisanya */
    [1, 34, 108, 188, 244, 300].forEach(loadFrame);
    var i;
    for (i = 6; i <= FRAME_COUNT; i += 6) loadFrame(i);
    /* sisanya bertahap supaya bandwidth halus */
    setTimeout(function () {
      for (i = 1; i <= FRAME_COUNT; i++) if (i % 6 !== 0) loadFrame(i);
    }, 1200);
  }

  /* ============================================================
     Parallax ringan babak (hanya saat motion diizinkan):
     .copy bergeser sedikit lebih lambat dari scroll — depth halus.
     ============================================================ */
  var chapters = [];
  document.querySelectorAll('.jch').forEach(function (el) {
    chapters.push({ el: el, copy: el.querySelector('.copy') });
  });
  function parallax() {
    if (!motionAllowed()) return;
    var vh = window.innerHeight || 1;
    for (var i = 0; i < chapters.length; i++) {
      var c = chapters[i];
      if (!c.copy) continue;
      var r = c.el.getBoundingClientRect();
      if (r.bottom < -80 || r.top > vh + 80) continue;
      var t = (r.top + r.height / 2 - vh / 2) / (vh + r.height);
      c.copy.style.transform = 'translate3d(0,' + (t * 26).toFixed(1) + 'px,0)';
    }
  }

  /* ============================================================
     Pointer tilt (bento/chat panel) + cursor glow (--gx/--gy)
     — gate motionAllowed() DI SAAT EVENT (UA bisa salah lapor
     reduce saat boot; keputusan final saat pointer bergerak).
     ============================================================ */
  function attachPointer() {
    if (!fineHover.matches) return;
    document.querySelectorAll('.tilt').forEach(function (el) {
      var max = parseFloat(el.getAttribute('data-tilt-max')) || 6;
      var raf = 0;
      el.addEventListener('pointermove', function (ev) {
        if (!motionAllowed()) return;
        if (raf) return;
        raf = requestAnimationFrame(function () {
          raf = 0;
          var r = el.getBoundingClientRect();
          var nx = (ev.clientX - r.left) / Math.max(1, r.width) - 0.5;
          var ny = (ev.clientY - r.top) / Math.max(1, r.height) - 0.5;
          el.style.transform = 'perspective(800px) rotateX(' + (ny * -max).toFixed(2) + 'deg) rotateY(' + (nx * max).toFixed(2) + 'deg)';
        });
      });
      el.addEventListener('pointerleave', function () {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        el.style.transform = '';
      });
    });
    document.querySelectorAll('.cell').forEach(function (el) {
      el.addEventListener('pointermove', function (ev) {
        var r = el.getBoundingClientRect();
        el.style.setProperty('--gx', ((ev.clientX - r.left) / Math.max(1, r.width) * 100).toFixed(1) + '%');
        el.style.setProperty('--gy', ((ev.clientY - r.top) / Math.max(1, r.height) * 100).toFixed(1) + '%');
      });
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
      parallax();
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () {
    resizeDirty = true;
    resizeCanvas();
    onScroll();
  }, { passive: true });
  window.addEventListener('orientationchange', function () {
    resizeDirty = true;
    resizeCanvas();
  }, { passive: true });
  window.addEventListener('load', function () {
    resizeCanvas();
    updateTarget();
    parallax();
  });
  document.addEventListener('visibilitychange', function () {
    /* kembali dari tab tersembunyi: pastikan canvas sesuai frame */
    if (!document.hidden) { resizeDirty = true; drawNow(); }
  });

  resizeCanvas();
  updateTarget();
  drawNow();
  preload();
  attachPointer();
  requestAnimationFrame(loop);

  /* Jika pengguna lebih suka gerak minimal: frame tetap discrub
     (kanvas itu konten, bukan dekorasi) TANPA lerp — langsung. */
  if (!motionAllowed()) {
    var direct = function () {
      currentFrame = targetFrame = 1 + journeyProgress() * (FRAME_AT_GROUND - 1);
      drawNow();
    };
    window.addEventListener('scroll', direct, { passive: true });
    direct();
  }
})();
