
// QA visual UX sweep — ukur overflow horizontal + console errors per halaman/viewport.
// Jalankan: node e2e/qa-ux-sweep.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'

const BASE = 'http://localhost:4601'
const env = fs.readFileSync('/home/ubuntu/grouter_copilot/server/.env', 'utf8')
const ADMIN_TOKEN = (env.match(/^ADMIN_TOKEN=(.+)$/m) || [])[1]?.trim() || ''

const PAGES = [
  { path: '/login', auth: null, name: 'login' },
  { path: '/register', auth: null, name: 'register' },
  { path: '/admin/licenses', auth: 'admin', name: 'admin-licenses' },
  { path: '/admin/orders', auth: 'admin', name: 'admin-orders' },
  { path: '/admin/packages', auth: 'admin', name: 'admin-packages' },
  { path: '/admin/settings', auth: 'admin', name: 'admin-settings' },
  { path: '/admin/ledger', auth: 'admin', name: 'admin-ledger' },
  { path: '/admin', auth: 'admin', name: 'admin-overview' },
  { path: '/admin/usage', auth: 'admin', name: 'admin-usage' },
]

const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1440', width: 1440, height: 900 },
]

const results = []
const exe = '/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell'
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
try {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await ctx.newPage()
    const consoleErrors = []
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200)) })
    page.on('pageerror', (err) => consoleErrors.push('PAGEERROR: ' + String(err).slice(0, 200)))

    for (const p of PAGES) {
      try {
        if (p.auth === 'admin') {
          await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' })
          const hasGate = await page.locator('#admin-token').count().catch(() => 0)
          if (hasGate) {
            await page.fill('#admin-token', ADMIN_TOKEN).catch(async () => {
              await page.locator('input[type=password]').first().fill(ADMIN_TOKEN)
            })
            await page.keyboard.press('Enter')
            await page.waitForTimeout(800)
          }
        }
        consoleErrors.length = 0
        await page.goto(BASE + p.path, { waitUntil: 'networkidle', timeout: 20000 })
        await page.waitForTimeout(600)
        const m = await page.evaluate(() => ({
          sw: document.documentElement.scrollWidth,
          cw: document.documentElement.clientWidth,
          vh: window.innerHeight,
        }))
        const overflow = m.sw - m.cw
        // screenshot
        const shot = `/home/ubuntu/grouter_copilot/.hermes/qa-screens/${p.name}-${vp.name}.png`
        await page.screenshot({ path: shot, fullPage: false })
        results.push({
          page: p.name, vp: vp.name, overflow,
          status: overflow > 2 ? 'OVERFLOW' : 'ok',
          consoleErrors: [...consoleErrors].slice(0, 3),
        })
      } catch (e) {
        results.push({ page: p.name, vp: vp.name, status: 'NAV-FAIL', error: String(e).slice(0, 120) })
      }
    }
    await ctx.close()
  }
} finally {
  await browser.close()
}
fs.writeFileSync('/home/ubuntu/grouter_copilot/.hermes/qa-screens/sweep.json', JSON.stringify(results, null, 1))
const bad = results.filter((r) => r.status !== 'ok')
console.log('TOTAL:', results.length, '| problems:', bad.length)
for (const b of bad) console.log(JSON.stringify(b))
for (const r of results.filter((x) => x.status === 'ok')) console.log(`ok ${r.page}@${r.vp} overflow=${r.overflow}`)
