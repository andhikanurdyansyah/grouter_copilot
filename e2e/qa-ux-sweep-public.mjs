
import { chromium } from 'playwright'
import fs from 'node:fs'
const BASE = 'http://localhost:4601'
const exe = '/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell'
const PAGES = [
  { path: '/', name: 'public-intro' },
  { path: '/landing', name: 'public-landing' },
  { path: '/success', name: 'public-success' },
]
const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '1440', width: 1440, height: 900 },
]
const results = []
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
try {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await ctx.newPage()
    const consoleErrors = []
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 160)) })
    page.on('pageerror', (err) => consoleErrors.push('PAGEERROR: ' + String(err).slice(0, 160)))
    for (const p of PAGES) {
      try {
        consoleErrors.length = 0
        await page.goto(BASE + p.path, { waitUntil: 'load', timeout: 25000 })
        await page.waitForTimeout(1200)
        const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
        const shot = `/home/ubuntu/grouter_copilot/.hermes/qa-screens/${p.name}-${vp.name}.png`
        await page.screenshot({ path: shot })
        const overflow = m.sw - m.cw
        results.push({ page: p.name, vp: vp.name, overflow, status: overflow > 2 ? 'OVERFLOW' : 'ok', consoleErrors: [...consoleErrors].slice(0, 3) })
      } catch (e) {
        results.push({ page: p.name, vp: vp.name, status: 'NAV-FAIL', error: String(e).slice(0, 120) })
      }
    }
    await ctx.close()
  }
} finally { await browser.close() }
fs.writeFileSync('/home/ubuntu/grouter_copilot/.hermes/qa-screens/sweep-public.json', JSON.stringify(results, null, 1))
const bad = results.filter((r) => r.status !== 'ok')
console.log('TOTAL:', results.length, '| problems:', bad.length)
for (const b of bad) console.log(JSON.stringify(b).slice(0, 220))
