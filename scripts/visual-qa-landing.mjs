// Visual/responsive QA for the gRouter Copilot landing page and the public
// auth routes.
//
// WHY A SEPARATE PROBE: the landing page is a WebGL-heavy scroll scene. It
// never reaches 'networkidle' (RAF + sockets stay alive), and loading it
// repeatedly inside one browser process accumulates GPU/renderer pressure
// until the renderer crashes mid-run. An earlier single-process attempt died
// at 768px after three prior landing loads and left only 10 of 20 checks.
//
// ARCHITECTURE: this file is both the runner and the per-viewport worker.
//   - runner (default): spawns ONE child process per viewport, each with a
//     fresh browser, and merges the JSON each child prints. A crashed or
//     timed-out viewport is recorded as a failure instead of killing the run,
//     and incomplete coverage is itself a blocking finding.
//   - worker (--worker): measures all routes at one viewport, prints a single
//     JSON line, exits.
//
// A blank render can never pass: content routes must produce real DOM text,
// and form routes must produce real form controls.
//
// Usage:
//   CHROMIUM_PATH=/path/to/chrome node scripts/visual-qa-landing.mjs \
//     [--base http://localhost:4601] [--timeout 90] [--settle 2000] [--only 768]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const has = (name) => argv.includes(name);

const BASE = arg('--base', 'http://localhost:4601');
const TIMEOUT = Number(arg('--timeout', '90'));
const SETTLE_MS = Number(arg('--settle', '2000'));
const VIEWPORT_TIMEOUT_MS = Number(arg('--viewport-timeout', '240'));
const ONLY = arg('--only', '');

const ROUTES = [
  { path: '/', name: 'landing', kind: 'content' },
  { path: '/login', name: 'login', kind: 'content' },
  { path: '/sign-up', name: 'sign-up', kind: 'form' },
  { path: '/login/sign-up', name: 'login-sign-up', kind: 'form' },
];

const VIEWPORTS = [
  { w: 320, h: 720, label: '320-mobile-narrow' },
  { w: 390, h: 844, label: '390-mobile' },
  { w: 768, h: 1024, label: '768-tablet' },
  { w: 1024, h: 768, label: '1024-compact' },
  { w: 1440, h: 900, label: '1440-desktop' },
];

// ---------------------------------------------------------------- worker ----

async function runWorker(vp) {
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ['--disable-dev-shm-usage', '--no-sandbox'],
  });
  const results = [];
  try {
    for (const route of ROUTES) {
      const entry = { viewport: vp.label, width: vp.w, route: route.path, name: route.name };
      const consoleErrors = [];
      const failedRequests = [];
      let ctx = null;
      try {
        ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 });
        const page = await ctx.newPage();
        page.on('console', (m) => {
          if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
        });
        page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 300)}`));
        page.on('requestfailed', (r) => {
          const url = r.url();
          if (/favicon|\.map$/.test(url)) return;
          failedRequests.push(`${r.method()} ${url.slice(0, 160)} :: ${r.failure()?.errorText ?? ''}`);
        });

        // 'load' — never 'networkidle': the WebGL scene keeps RAF/sockets alive.
        const resp = await page.goto(`${BASE}${route.path}`, { waitUntil: 'load', timeout: TIMEOUT * 1000 });
        entry.status = resp?.status() ?? null;

        // Bounded settle so React mounts; raced against close so a crashed
        // page fails fast instead of hanging the whole viewport.
        await Promise.race([
          page.waitForTimeout(SETTLE_MS),
          new Promise((_, reject) => page.once('close', () => reject(new Error('page closed during settle')))),
        ]);

        entry.finalUrl = new URL(page.url()).pathname;

        // The landing canvas starves the main thread, so a full-DOM geometry
        // sweep can take a minute. Freeze RAF before measuring: DOM geometry
        // is unaffected (the canvas is a decorative background) and the text
        // length is read in the same evaluate, so a blank render still fails.
        await page.evaluate(() => {
          window.requestAnimationFrame = () => 0;
        }).catch(() => {});

        const metrics = await page.evaluate(async () => {
          const doc = document.documentElement;
          const scrollW = Math.max(doc.scrollWidth, document.body?.scrollWidth ?? 0);
          const clientW = doc.clientWidth;
          const all = [...document.querySelectorAll('body *')];
          const overflowing = [];
          const hScrollers = [];
          for (let i = 0; i < all.length; i++) {
            const el = all[i];
            const r = el.getBoundingClientRect();
            if (r.width !== 0 && r.height !== 0) {
              const style = getComputedStyle(el);
              if (style.position !== 'fixed' && style.visibility !== 'hidden'
                  && r.right > clientW + 2 && overflowing.length < 5) {
                const tag = el.tagName.toLowerCase();
                const cls = (el.className && typeof el.className === 'string')
                  ? el.className.split(/\s+/).slice(0, 3).join('.') : '';
                overflowing.push(`${tag}${cls ? '.' + cls : ''} right=${Math.round(r.right)} (vw=${clientW})`);
              }
              if ((style.overflowX === 'auto' || style.overflowX === 'scroll')
                  && el.scrollWidth > el.clientWidth + 2 && hScrollers.length < 5) {
                hScrollers.push(el.tagName.toLowerCase());
              }
            }
            if (i % 15 === 14) await new Promise((r) => setTimeout(r, 0));
          }

          const textEls = [...document.querySelectorAll('h1,h2,h3,p,span,td,th,button,a,label')];
          const clipped = [];
          for (let i = 0; i < textEls.length; i++) {
            const el = textEls[i];
            if (el.textContent && el.textContent.trim()) {
              const s = getComputedStyle(el);
              if (s.overflow !== 'visible' && el.scrollWidth > el.clientWidth + 2
                  && el.clientWidth > 0 && clipped.length < 5) {
                clipped.push(`${el.tagName.toLowerCase()}:"${el.textContent.trim().slice(0, 40)}" ${el.scrollWidth}>${el.clientWidth}`);
              }
            }
            if (i % 15 === 14) await new Promise((r) => setTimeout(r, 0));
          }

          const bodyText = (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim();
          return {
            scrollW, clientW,
            docOverflow: scrollW > clientW + 2,
            overflowing, clipped, hScrollers,
            bodyTextLength: bodyText.length,
            bodyText: bodyText.slice(0, 200),
            formControls: document.querySelectorAll('input,select,textarea,button[type=submit],form').length,
            canvasCount: document.querySelectorAll('canvas').length,
          };
        });

        Object.assign(entry, metrics);
        entry.consoleErrors = consoleErrors;
        entry.failedRequests = failedRequests;
      } catch (err) {
        entry.error = String(err).slice(0, 300);
      } finally {
        if (ctx) await ctx.close().catch(() => {});
      }
      results.push(entry);
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return results;
}

// ---------------------------------------------------------------- runner ----

async function runRunner() {
  const self = fileURLToPath(import.meta.url);
  const viewports = ONLY ? VIEWPORTS.filter((v) => v.label.includes(ONLY)) : VIEWPORTS;
  const perViewport = {};

  for (const vp of viewports) {
    const child = spawn(process.execPath, [self, '--worker', '--vp', String(vp.w), '--vplabel', vp.label,
      '--base', BASE, '--timeout', String(TIMEOUT), '--settle', String(SETTLE_MS)], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let errOut = '';
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { errOut += c; });

    const timer = setTimeout(() => { child.kill('SIGKILL'); }, VIEWPORT_TIMEOUT_MS * 1000);
    const code = await new Promise((resolve) => child.on('close', (c) => { clearTimeout(timer); resolve(c); }));

    let parsed = null;
    const line = out.split('\n').reverse().find((l) => l.trim().startsWith('['));
    if (line) { try { parsed = JSON.parse(line); } catch { parsed = null; } }

    if (parsed && Array.isArray(parsed)) {
      perViewport[vp.label] = parsed;
      console.log(`[${vp.label}] ${parsed.length}/${ROUTES.length} routes measured`);
    } else {
      perViewport[vp.label] = [];
      const lastErr = errOut.trim().split('\n').slice(-1)[0] ?? '';
      console.log(`[${vp.label}] FAILED (exit ${code}) ${lastErr}`.trim());
    }
  }

  // Merge in viewport order, then route order, so the evidence file is stable.
  const results = [];
  for (const vp of viewports) results.push(...(perViewport[vp.label] ?? []));

  const findings = [];
  for (const e of results) {
    const route = ROUTES.find((r) => r.path === e.route);
    const kind = route?.kind ?? 'content';
    if (e.error) {
      findings.push({ severity: 'blocking', kind: 'navigation-error', viewport: e.viewport, route: e.route, detail: e.error });
      continue;
    }
    const blankOk = kind === 'form' ? (e.formControls ?? 0) > 0 : (e.bodyTextLength ?? 0) > 100;
    if (!blankOk) {
      findings.push({
        severity: 'blocking', kind: 'blank-or-missing-render', viewport: e.viewport, route: e.route,
        detail: `textLen=${e.bodyTextLength} formControls=${e.formControls}; refusing to pass a blank render`,
      });
    }
    if (e.docOverflow) {
      findings.push({
        severity: 'blocking', kind: 'horizontal-overflow', viewport: e.viewport, route: e.route,
        detail: `scrollW ${e.scrollW} > clientW ${e.clientW}; ${(e.overflowing ?? []).join(' | ')}`,
      });
    }
    if ((e.clipped ?? []).length) {
      findings.push({ severity: 'warning', kind: 'clipped-text', viewport: e.viewport, route: e.route, detail: e.clipped.join(' | ') });
    }
    if ((e.consoleErrors ?? []).length) {
      findings.push({ severity: 'warning', kind: 'console-error', viewport: e.viewport, route: e.route, detail: e.consoleErrors.slice(0, 3).join(' | ') });
    }
    if ((e.failedRequests ?? []).length) {
      findings.push({ severity: 'warning', kind: 'failed-request', viewport: e.viewport, route: e.route, detail: e.failedRequests.slice(0, 3).join(' | ') });
    }
  }

  const expected = viewports.length * ROUTES.length;
  const missing = expected - results.length;
  if (missing > 0) {
    findings.push({
      severity: 'blocking', kind: 'incomplete-coverage',
      detail: `${results.length}/${expected} checks collected; ${missing} missing — partial evidence cannot be a pass`,
    });
  }

  const blocking = findings.filter((f) => f.severity === 'blocking');
  const warnings = findings.filter((f) => f.severity === 'warning');

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const outDir = path.join(scriptDir, '..', 'frontend', 'docs', 'evidence', '2026-10-18-visual-qa');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'landing-qa.json');
  fs.writeFileSync(outPath, JSON.stringify({
    base: BASE, generatedAt: new Date().toISOString(),
    expectedChecks: expected, collectedChecks: results.length,
    results, findings,
  }, null, 2));

  console.log(`checks=${results.length}/${expected} blocking=${blocking.length} warnings=${warnings.length}`);
  for (const f of blocking) console.log(`BLOCK ${f.kind} [${f.viewport ?? '-'}] ${f.route ?? '-'}: ${f.detail}`);
  for (const f of warnings.slice(0, 20)) console.log(`WARN  ${f.kind} [${f.viewport}] ${f.route}: ${f.detail}`);
  console.log(`evidence=${outPath}`);
  process.exit(blocking.length ? 1 : 0);
}

// ------------------------------------------------------------------ main ----

if (has('--worker')) {
  const vp = { w: Number(arg('--vp', '390')), h: 800, label: arg('--vplabel', 'worker') };
  const res = await runWorker(vp);
  console.log(JSON.stringify(res));
  process.exit(0);
} else {
  await runRunner();
}
