// Visual/responsive QA probe for gRouter Copilot.
//
// Measures what a user actually experiences at each required viewport class:
// horizontal overflow, console errors, failed requests, and clipped/overlapping
// text. It is deliberately measurement-first (no screenshots required to reach
// a verdict) so results are machine-checkable, and it writes screenshots for
// human review when asked.
//
// Usage:
//   node scripts/visual-qa.mjs --base http://localhost:4601 [--shots dir]
//
// Exit code 1 when any route/viewport reports a blocking finding.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};

const BASE = arg('--base', 'http://localhost:4601');
const SHOT_DIR = arg('--shots', '');
const ONLY = arg('--only', '');
const TIMEOUT = Number(arg('--timeout', '20000'));

// Public + authenticated routes. Authenticated ones are expected to redirect to
// /login when no session is present — that redirect itself is recorded, because
// a redirect loop or a blank screen is the defect we care about.
const ROUTES = [
  { path: '/', name: 'landing' },
  { path: '/login', name: 'login' },
  { path: '/sign-up', name: 'sign-up' },
  { path: '/user', name: 'customer-overview' },
  { path: '/user/orders', name: 'customer-orders' },
  { path: '/user/payments', name: 'customer-payments' },
  { path: '/user/licenses', name: 'customer-licenses' },
  { path: '/user/usage', name: 'customer-usage' },
  { path: '/user/install', name: 'customer-install' },
  { path: '/user/account', name: 'customer-account' },
  { path: '/admin', name: 'admin-overview' },
  { path: '/admin/orders', name: 'admin-orders' },
  { path: '/admin/licenses', name: 'admin-licenses' },
  { path: '/admin/packages', name: 'admin-packages' },
  { path: '/admin/usage', name: 'admin-usage' },
  { path: '/admin/ledger', name: 'admin-ledger' },
  { path: '/admin/settings', name: 'admin-settings' },
];

const VIEWPORTS = [
  { w: 320, h: 720, label: '320-mobile-narrow' },
  { w: 390, h: 844, label: '390-mobile' },
  { w: 768, h: 1024, label: '768-tablet' },
  { w: 1024, h: 768, label: '1024-compact' },
  { w: 1440, h: 900, label: '1440-desktop' },
];

const routes = ONLY ? ROUTES.filter((r) => r.name.includes(ONLY)) : ROUTES;

const browser = await chromium.launch({
  // Honour an explicitly provisioned browser binary. The installed Playwright
  // build expects a revision that may not be the one cached on this host, and
  // failing here would silently reduce "visual QA" to nothing.
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
const findings = [];
const results = [];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    deviceScaleFactor: 1,
  });
  for (const route of routes) {
    const page = await ctx.newPage();
    const consoleErrors = [];
    const failedRequests = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
    });
    page.on('requestfailed', (r) => {
      const url = r.url();
      // Favicon/analytics noise is not a product defect.
      if (/favicon|\.map$/.test(url)) return;
      failedRequests.push(`${r.method()} ${url.slice(0, 160)} :: ${r.failure()?.errorText ?? ''}`);
    });

    const entry = { viewport: vp.label, route: route.path, name: route.name };
    try {
      const resp = await page.goto(`${BASE}${route.path}`, {
        waitUntil: 'networkidle',
        timeout: TIMEOUT,
      });
      entry.status = resp?.status() ?? null;
      entry.finalUrl = new URL(page.url()).pathname;

      // Let React Query settle so a loading skeleton is not measured as content.
      await page.waitForTimeout(600);

      const metrics = await page.evaluate(() => {
        const doc = document.documentElement;
        const scrollW = Math.max(doc.scrollWidth, document.body?.scrollWidth ?? 0);
        const clientW = doc.clientWidth;

        // Elements that stick out past the right edge (classic mobile overflow).
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

        // Text that is visually clipped by its own box.
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

        // Horizontal scrollers are acceptable only for tables.
        const hScrollers = [];
        for (const el of document.querySelectorAll('body *')) {
          const s = getComputedStyle(el);
          if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 2) {
            hScrollers.push(el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/)[0] : ''));
            if (hScrollers.length >= 5) break;
          }
        }

        return {
          scrollW,
          clientW,
          docOverflow: scrollW > clientW + 2,
          overflowing,
          clipped,
          hScrollers,
          bodyText: (document.body?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 200),
          hasMain: !!document.querySelector('main'),
        };
      });

      Object.assign(entry, metrics);
      entry.consoleErrors = consoleErrors;
      entry.failedRequests = failedRequests;

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

      if (SHOT_DIR) {
        fs.mkdirSync(SHOT_DIR, { recursive: true });
        const file = path.join(SHOT_DIR, `${vp.label}--${route.name}.png`);
        await page.screenshot({ path: file, fullPage: true });
        entry.screenshot = file;
      }
    } catch (err) {
      entry.error = String(err).slice(0, 300);
      findings.push({
        severity: 'blocking',
        kind: 'navigation-error',
        viewport: vp.label,
        route: route.path,
        detail: entry.error,
      });
    }
    results.push(entry);
    await page.close();
  }
  await ctx.close();
}

await browser.close();

const blocking = findings.filter((f) => f.severity === 'blocking');
const warnings = findings.filter((f) => f.severity === 'warning');

const outDir = 'docs/evidence/2026-10-18-visual-qa';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, 'visual-qa.json'),
  JSON.stringify({ base: BASE, generatedAt: new Date().toISOString(), results, findings }, null, 2),
);

console.log(`routes=${routes.length} viewports=${VIEWPORTS.length} checks=${results.length}`);
console.log(`blocking=${blocking.length} warnings=${warnings.length}`);
for (const f of blocking) console.log(`BLOCK ${f.kind} [${f.viewport}] ${f.route}: ${f.detail}`);
for (const f of warnings.slice(0, 25)) console.log(`WARN  ${f.kind} [${f.viewport}] ${f.route}: ${f.detail}`);
console.log(`evidence=${path.join(outDir, 'visual-qa.json')}`);
process.exit(blocking.length ? 1 : 0);
