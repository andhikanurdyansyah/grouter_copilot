// Visual/responsive QA probe for the gRouter Copilot landing page (/),
// plus /login and /sign-up as public lightweight controls.
//
// Why separate from scripts/visual-qa.mjs: the landing page is WebGL-heavy
// (Three.js scroll scene) and keeps RAF/sockets alive forever, so it never
// reaches 'networkidle' and the shared probe times out on it. This probe
// therefore uses waitUntil 'load' + a bounded settle wait, and gates every
// verdict on real DOM text (body innerText length > 100) so a blank or
// WebGL-stubbed render can never be recorded as a pass.
//
// Reuses the measurement approach (overflow / clipped text / console errors /
// failed requests) from scripts/visual-qa.mjs verbatim in spirit.
//
// Usage:
//   CHROMIUM_PATH=/root/.cache/ms-playwright/chromium-1248/chrome-linux-arm64/chrome \
//     node scripts/visual-qa-landing.mjs [--base http://localhost:4601]
//
// Exit code 1 when any route/viewport reports a blocking finding.
// Evidence: frontend/docs/evidence/2026-10-18-visual-qa/landing-qa.json
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};

const BASE = arg('--base', 'http://localhost:4601');
const TIMEOUT = Number(arg('--timeout', '30000'));
const SETTLE_MS = Number(arg('--settle', '2500'));

const ROUTES = [
  { path: '/', name: 'landing' },
  { path: '/login', name: 'login' },
  // NOTE: /sign-up is a hard 404 on this server (verified via curl + probe);
  // the real sign-up route linked from /login is /login/sign-up. Both are
  // measured so the 404 is recorded as evidence, not hidden.
  { path: '/sign-up', name: 'sign-up' },
  { path: '/login/sign-up', name: 'login-sign-up' },
];

const VIEWPORTS = [
  { w: 320, h: 720, label: '320-mobile-narrow' },
  { w: 390, h: 844, label: '390-mobile' },
  { w: 768, h: 1024, label: '768-tablet' },
  { w: 1024, h: 768, label: '1024-compact' },
  { w: 1440, h: 900, label: '1440-desktop' },
];

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: [
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--disable-dev-shm-usage',
    '--disable-gpu-sandbox',
    '--no-sandbox',
    '--js-flags=--max-old-space-size=512',
  ],
});
const findings = [];
const results = [];

for (const vp of VIEWPORTS) {
  // Fresh context per route (not per viewport): the WebGL landing scene
  // accumulates GPU/renderer pressure in a shared context and crashed the
  // browser mid-run on the 768 pass. Isolating per route keeps a crash
  // attributable to one route/viewport instead of killing the whole run.
  for (const route of ROUTES) {
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    const consoleErrors = [];
    const failedRequests = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
    });
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 300)}`));
    page.on('requestfailed', (r) => {
      const url = r.url();
      if (/favicon|\.map$/.test(url)) return;
      failedRequests.push(`${r.method()} ${url.slice(0, 160)} :: ${r.failure()?.errorText ?? ''}`);
    });

    const entry = { viewport: vp.label, width: vp.w, route: route.path, name: route.name };
    try {
      // NOT networkidle: WebGL RAF + sockets never idle on the landing page.
      const resp = await page.goto(`${BASE}${route.path}`, {
        waitUntil: 'load',
        timeout: TIMEOUT,
      });
      entry.status = resp?.status() ?? null;
      entry.finalUrl = new URL(page.url()).pathname;

      // Bounded settle: let React mount + fonts/scene init, but never hang.
      // Race against page close so a crashed/closed page fails fast instead
      // of hanging the whole run.
      await Promise.race([
        page.waitForTimeout(SETTLE_MS),
        new Promise((_, reject) => page.once('close', () => reject(new Error('page closed during settle')))),
      ]);

      const metrics = await page.evaluate(() => {
        const doc = document.documentElement;
        const scrollW = Math.max(doc.scrollWidth, document.body?.scrollWidth ?? 0);
        const clientW = doc.clientWidth;

        const overflowing = [];
        const all = document.querySelectorAll('body *');
        for (const el of all) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const style = getComputedStyle(el);
          if (style.position === 'fixed' || style.visibility === 'hidden') continue;
          if (r.right > clientW + 2) {
            const tag = el.tagName.toLowerCase();
            const cls = (el.className && typeof el.className === 'string')
              ? el.className.split(/\s+/).slice(0, 3).join('.')
              : '';
            overflowing.push(`${tag}${cls ? '.' + cls : ''} right=${Math.round(r.right)} (vw=${clientW})`);
            if (overflowing.length >= 5) break;
          }
        }

        const clipped = [];
        for (const el of document.querySelectorAll('h1,h2,h3,p,span,td,th,button,a,label')) {
          if (!el.textContent || !el.textContent.trim()) continue;
          const s = getComputedStyle(el);
          if (s.overflow === 'visible') continue;
          if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
            const txt = el.textContent.trim().slice(0, 40);
            clipped.push(`${el.tagName.toLowerCase()}:"${txt}" ${el.scrollWidth}>${el.clientWidth}`);
            if (clipped.length >= 5) break;
          }
        }

        const hScrollers = [];
        for (const el of document.querySelectorAll('body *')) {
          const s = getComputedStyle(el);
          if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 2) {
            hScrollers.push(el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/)[0] : ''));
            if (hScrollers.length >= 5) break;
          }
        }

        const bodyTextRaw = document.body?.innerText ?? '';
        return {
          scrollW,
          clientW,
          docOverflow: scrollW > clientW + 2,
          overflowing,
          clipped,
          hScrollers,
          bodyTextLength: bodyTextRaw.replace(/\s+/g, ' ').trim().length,
          bodyText: bodyTextRaw.replace(/\s+/g, ' ').slice(0, 200),
          hasMain: !!document.querySelector('main'),
          canvasCount: document.querySelectorAll('canvas').length,
        };
      });

      Object.assign(entry, metrics);
      entry.consoleErrors = consoleErrors;
      entry.failedRequests = failedRequests;
      entry.textPresent = metrics.bodyTextLength > 100;

      if (!entry.textPresent) {
        findings.push({
          severity: 'blocking',
          kind: 'blank-or-missing-text',
          viewport: vp.label,
          route: route.path,
          detail: `body innerText length ${metrics.bodyTextLength} <= 100; refusing to pass a blank render`,
        });
      }
      if (metrics.docOverflow) {
        findings.push({
          severity: 'blocking',
          kind: 'horizontal-overflow',
          viewport: vp.label,
          route: route.path,
          detail: `document scrollWidth ${metrics.scrollW} > clientWidth ${metrics.clientW}; ${metrics.overflowing.join(' | ')}`,
        });
      }
      if (metrics.clipped.length) {
        findings.push({
          severity: 'warning',
          kind: 'clipped-text',
          viewport: vp.label,
          route: route.path,
          detail: metrics.clipped.join(' | '),
        });
      }
      if (consoleErrors.length) {
        findings.push({
          severity: 'warning',
          kind: 'console-error',
          viewport: vp.label,
          route: route.path,
          detail: consoleErrors.slice(0, 3).join(' | '),
        });
      }
      if (failedRequests.length) {
        findings.push({
          severity: 'warning',
          kind: 'failed-request',
          viewport: vp.label,
          route: route.path,
          detail: failedRequests.slice(0, 3).join(' | '),
        });
      }
    } catch (err) {
      entry.error = String(err).slice(0, 300);
      entry.textPresent = false;
      findings.push({
        severity: 'blocking',
        kind: 'navigation-error',
        viewport: vp.label,
        route: route.path,
        detail: entry.error,
      });
    }
    results.push(entry);
    console.log(
      `[${vp.label}] ${route.path} status=${entry.status ?? 'ERR'} scrollW=${entry.scrollW ?? '-'} clientW=${entry.clientW ?? '-'} overflow=${entry.docOverflow ?? '-'} textLen=${entry.bodyTextLength ?? '-'} textPresent=${entry.textPresent} canvases=${entry.canvasCount ?? '-'} consoleErr=${(entry.consoleErrors ?? []).length} failedReq=${(entry.failedRequests ?? []).length}${entry.error ? ' ERROR=' + entry.error : ''}`,
    );
    await page.close().catch(() => {});
    await ctx.close().catch(() => {});
  }
}

await browser.close();

const blocking = findings.filter((f) => f.severity === 'blocking');
const warnings = findings.filter((f) => f.severity === 'warning');

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(scriptDir, '..', 'frontend', 'docs', 'evidence', '2026-10-18-visual-qa');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'landing-qa.json');
fs.writeFileSync(
  outPath,
  JSON.stringify({ base: BASE, generatedAt: new Date().toISOString(), results, findings }, null, 2),
);

console.log(`routes=${ROUTES.length} viewports=${VIEWPORTS.length} checks=${results.length}`);
console.log(`blocking=${blocking.length} warnings=${warnings.length}`);
for (const f of blocking) console.log(`BLOCK ${f.kind} [${f.viewport}] ${f.route}: ${f.detail}`);
for (const f of warnings) console.log(`WARN  ${f.kind} [${f.viewport}] ${f.route}: ${f.detail}`);
console.log(`evidence=${outPath}`);
process.exit(blocking.length ? 1 : 0);
