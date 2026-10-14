// Read-only SPA render probe (QA tool). Loads every SPA route in a real browser
// and reports console errors, page errors, CSP violations, failed requests, and
// basic a11y (unlabeled inputs). GET-only — never mutates state.
//
// Usage:  node scripts/qa-spa-probe.mjs            # public routes
//         node scripts/qa-spa-probe.mjs --all      # + customer + admin (uses ADMIN_TOKEN from server/.env)
//
// The admin token is read from server/.env and injected into sessionStorage; its
// value is NEVER printed (length only). Safe to point at production for read-only
// checks.
import { chromium } from 'playwright'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const BASE = process.env.QA_BASE_URL || 'http://localhost:4601'
const ALL = process.argv.includes('--all')

function adminTokenFromEnv() {
  try {
    const env = readFileSync(path.join(repo, 'server', '.env'), 'utf8')
    const m = env.match(/^ADMIN_TOKEN=(.*)$/m)
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
  } catch { return '' }
}

const TOKEN = ALL ? adminTokenFromEnv() : ''
console.log(`[qa-spa] base=${BASE} mode=${ALL ? 'all' : 'public'} tokenPresent=${TOKEN.length > 0} (value never printed)`)

const CUSTOMER_ROUTES = ['/app/user', '/app/user/usage', '/app/user/orders', '/app/user/payments', '/app/user/account', '/app/user/install', '/app/user/licenses']
const ADMIN_ROUTES = ['/app/admin', '/app/admin/licenses', '/app/admin/orders', '/app/admin/ledger', '/app/admin/usage', '/app/admin/packages', '/app/admin/settings']
const PUBLIC_ROUTES = ['/app/', '/app/admin-gate', '/app/sign-up', '/app/login/sign-up', '/app/does-not-exist']

function findChromium() {
  if (process.env.QA_CHROMIUM) return process.env.QA_CHROMIUM
  // Playwright's pinned revision may not match what is cached on this host, so
  // resolve any installed chrome-headless-shell (or full chrome) dynamically.
  const cache = '/root/.cache/ms-playwright'
  try {
    const dirs = readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-') || d.startsWith('chromium-'))
    for (const d of dirs) {
      for (const rel of [
        'chrome-headless-shell-linux-arm64/chrome-headless-shell',
        'chrome-headless-shell-linux64/chrome-headless-shell',
        'chrome-linux-arm64/chrome',
        'chrome-linux/chrome',
      ]) {
        const p = `${cache}/${d}/${rel}`
        if (existsSync(p)) return p
      }
    }
  } catch { /* fall through */ }
  return undefined // let Playwright resolve its bundled browser
}

const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox'] })

async function probe(routes, { admin = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  if (admin && TOKEN) {
    await ctx.addInitScript((t) => { try { sessionStorage.setItem('adminToken', t) } catch { /* ignore */ } }, TOKEN)
  }
  const page = await ctx.newPage()
  const out = []
  for (const route of routes) {
    const errs = [], bad = [], reqFails = []
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)) })
    page.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e.message).slice(0, 300)))
    page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`) })
    page.on('requestfailed', (r) => reqFails.push(`${r.failure()?.errorText} ${new URL(r.url()).pathname}`))
    await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 }).catch((e) => errs.push('GOTO: ' + e.message.slice(0, 160)))
    await page.waitForTimeout(1800)
    const info = await page.evaluate(() => ({
      url: location.pathname,
      h1: Array.from(document.querySelectorAll('h1,h2,h3')).map((e) => e.textContent.trim()).filter(Boolean).slice(0, 4),
      textLen: document.body.innerText.length,
      unlabeled: Array.from(document.querySelectorAll('input:not([type=hidden]),select,textarea')).filter((el) => {
        const id = el.id
        return !(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (id && document.querySelector(`label[for="${id}"]`)) || el.closest('label'))
      }).length,
    }))
    out.push({ route, ...info, errs: [...new Set(errs)], bad: [...new Set(bad)], reqFails: [...new Set(reqFails)] })
    page.removeAllListeners()
  }
  await ctx.close()
  return out
}

const all = [
  ...(await probe(PUBLIC_ROUTES, { admin: ALL })),
  ...(ALL ? await probe(CUSTOMER_ROUTES) : []),
  ...(ALL ? await probe(ADMIN_ROUTES, { admin: true }) : []),
]
await browser.close()

const cspErrs = all.flatMap((r) => r.errs.filter((e) => /Content Security Policy/i.test(e)).map((e) => `${r.route}: ${e.slice(0, 120)}`))
const pageErrs = all.flatMap((r) => r.errs.filter((e) => /PAGEERROR/i.test(e)).map((e) => `${r.route}: ${e.slice(0, 120)}`))

console.log(JSON.stringify(all, null, 1))
console.log('\n── ringkasan ──')
console.log('routes:', all.length)
console.log('CSP violations:', cspErrs.length); cspErrs.forEach((e) => console.log('  ', e))
console.log('page errors:', pageErrs.length); pageErrs.forEach((e) => console.log('  ', e))
console.log('unlabeled inputs:', all.reduce((n, r) => n + r.unlabeled, 0))
process.exit(cspErrs.length || pageErrs.length ? 1 : 0)
