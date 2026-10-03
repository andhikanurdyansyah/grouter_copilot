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

  /* ============================================================
     SMOOTH SCROLL — virtual wheel (Lenis-style, ~zero-dep)
     Desktop + motion only. Touch/pinch/native tetap native.
     - wheel → virt.t (target), rAF lerp virt.y 10%/frame
     - scrollbar drag / eksternal scroll → resync otomatis
     - anchor + pagination + hint lompat lewat vscrollTo()
     ============================================================ */
  var virt = { y: window.scrollY || 0, t: window.scrollY || 0, on: false };
  var docEl = document.documentElement;
  function maxScroll() {
    return Math.max(0, (document.documentElement.scrollHeight || 0) - (window.innerHeight || 1));
  }
  function vscrollTo(y) {
    var m = maxScroll();
    virt.t = Math.min(m, Math.max(0, y));
    if (!virt.on) window.scrollTo(0, virt.t); /* fallback native */
  }
  if (fineHover.matches && motionAllowed()) {
    virt.on = true;
    docEl.style.scrollBehavior = 'auto'; /* smooth CSS mengganggu lerp per-frame */
    var wheelAcc = 0;
    window.addEventListener('wheel', function (e) {
      if (e.ctrlKey) return; /* pinch-zoom biarkan browser */
      e.preventDefault();
      wheelAcc += e.deltaY;
      if (Math.abs(wheelAcc) > 2000) wheelAcc = 0; /* guard spike */
      vscrollTo(virt.t + wheelAcc * 1.05);
    }, { passive: false });
    window.addEventListener('keydown', function (e) {
      var step = 0;
      if (e.key === 'ArrowDown') step = 90;
      else if (e.key === 'ArrowUp') step = -90;
      else if (e.key === 'PageDown' || e.key === ' ') step = window.innerHeight * 0.86;
      else if (e.key === 'PageUp') step = -window.innerHeight * 0.86;
      else if (e.key === 'Home') { vscrollTo(0); e.preventDefault(); return; }
      else if (e.key === 'End') { vscrollTo(maxScroll()); e.preventDefault(); return; }
      if (step) { vscrollTo(virt.t + step); e.preventDefault(); }
    });
    /* resync: scrollbar drag / find-in-page / restore-scroll */
    window.addEventListener('scroll', function () {
      if (Math.abs((window.scrollY || 0) - virt.y) > 90) {
        virt.y = virt.t = window.scrollY || 0;
      }
    }, { passive: true });
    /* loop lerp — digabung ke rAF utama di bawah (smoothStep) */
  }
  /* anchor in-page → lompat virtual halus */
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest && ev.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href').slice(1);
    var t = id && document.getElementById(id);
    if (!t) return;
    ev.preventDefault();
    var r = t.getBoundingClientRect();
    vscrollTo((window.scrollY || 0) + r.top - Math.max(70, (window.innerHeight - Math.min(r.height, window.innerHeight * 0.8)) / 2));
  });

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
    /* smooth scroll: lerp posisi virtual → native (10%/frame, terasa premium) */
    if (virt.on) {
      var dd = virt.t - virt.y;
      if (Math.abs(dd) > 0.12) {
        virt.y += dd * 0.095;
        window.scrollTo(0, Math.round(virt.y));
      } else if (virt.y !== virt.t) {
        virt.y = virt.t;
        window.scrollTo(0, Math.round(virt.y));
      }
    }
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

  /* ============================================================
     KINETIC WORDS — kata menyala berurutan mengikuti scroll
     ============================================================ */
  var kines = [];
  document.querySelectorAll('.kine').forEach(function (k) {
    kines.push({ el: k, words: Array.prototype.slice.call(k.querySelectorAll('.kw')) });
  });
  function updateKinetic() {
    var vh = window.innerHeight || 1;
    for (var i = 0; i < kines.length; i++) {
      var k = kines[i];
      var r = k.el.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) continue;
      var p = (vh - r.top) / (vh + r.height); /* 0→1 melintasi viewport */
      var n = k.words.length;
      for (var w = 0; w < n; w++) {
        var s = 0.30 + ((w + 0.5) * 0.42) / Math.max(1, n);
        k.words[w].classList.toggle('on', p >= s - 0.02);
      }
    }
  }

  /* ============================================================
     ANGKA RAKSASA — parallax depth cue
     ============================================================ */
  var bigs = Array.prototype.slice.call(document.querySelectorAll('.ch-bignum')).map(function (el) {
    return { el: el };
  });
  function updateBignum() {
    if (!motionAllowed()) return;
    var vh = window.innerHeight || 1;
    for (var i = 0; i < bigs.length; i++) {
      var b = bigs[i];
      var host = b.el.parentElement;
      if (!host) continue;
      var r = host.getBoundingClientRect();
      if (r.bottom < -240 || r.top > vh + 240) continue;
      var t = (r.top + r.height / 2 - vh / 2) / (vh + r.height);
      b.el.style.transform = 'translate3d(0,' + (t * -130).toFixed(1) + 'px,0)';
    }
  }

  /* ============================================================
     SCENE PUSH — babak scale-down halus saat menjauh dari center
     ============================================================ */
  function updatePush() {
    if (!motionAllowed()) return;
    var vh = window.innerHeight || 1;
    for (var i = 0; i < chapterEls.length; i++) {
      var r = chapterEls[i].el.getBoundingClientRect();
      var d = Math.abs(r.top + r.height / 2 - vh / 2) / (vh * 0.5 + r.height * 0.5);
      var push = Math.min(1, Math.max(0, (d - 0.35) / 0.65));
      chapterEls[i].el.style.setProperty('--push', push.toFixed(3));
    }
  }

  /* lompatan lewat virtual scroll (paginasi + hint) */
  function vjump(el) {
    if (!el) return;
    var r = el.getBoundingClientRect();
    vscrollTo((window.scrollY || 0) + r.top - (window.innerHeight - Math.min(r.height, window.innerHeight * 0.9)) / 2);
  }
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
      vjump(t);
    });
  });

  /* scroll-hint → babak berikutnya */
  var hint = document.querySelector('.scroll-hint');
  if (hint) hint.addEventListener('click', function () {
    vjump(document.getElementById('produk'));
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
      updateKinetic();
      updateBignum();
      updatePush();
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
    updateKinetic();
    updateBignum();
    updatePush();
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
  updateKinetic();
  updateBignum();
  updatePush();
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
