// Capture semua rute admin+customer × 4 viewport (1440/1280/768/390)
// Output: /root/shots-accept/<role>-<route>-<w>.png
import { chromium } from 'playwright'
import fs from 'node:fs'

const outdir = '/root/shots-accept'
fs.mkdirSync(outdir, { recursive: true })
const adminToken = fs.readFileSync('/home/ubuntu/grouter_copilot/server/.env', 'utf8')
  .split('\n').find((l) => l.startsWith('ADMIN_TOKEN='))?.split('=').slice(1).join('=') ?? ''
const [qaEmail, qaPass] = fs.readFileSync('/root/shots-audit/qa-account.txt', 'utf8').trim().split('\n')
const VIEWPORTS = [[1440, 900], [1280, 800], [768, 900], [390, 844]]
const ADMIN_ROUTES = ['', 'licenses', 'licenses/lic_mv0qz36v_2', 'packages', 'orders', 'ledger', 'usage', 'settings']
const CUST_ROUTES = ['', 'install', 'usage', 'orders', 'payments', 'account']

const browser = await chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

async function shotAll(ctx, base, routes, prefix, isDark) {
  const page = await ctx.newPage()
  for (const [w, h] of VIEWPORTS) {
    await page.setViewportSize({ width: w, height: h })
    for (const p of routes) {
      const name = (p || 'overview').replace(/[/$]/g, '_')
      const url = `${base}${p ? '/' + p : ''}`
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => null)
      await page.waitForTimeout(800)
      await page.screenshot({ path: `${outdir}/${prefix}-${name}-${w}.png` })
      const sw = await page.evaluate(() => document.documentElement.scrollWidth)
      if (sw > w + 2) console.log(`OVERFLOW ${prefix}/${p || 'root'} @${w}: sw=${sw}`)
    }
  }
  await page.close()
}

// Admin sessions per viewport
for (const [w, h] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } })
  const page = await ctx.newPage()
  await page.addInitScript((t) => sessionStorage.setItem('adminToken', t), adminToken)
  for (const p of ADMIN_ROUTES) {
    const name = (p || 'overview').replace(/[/$]/g, '_')
    await page.goto(`http://localhost:4601/admin${p ? '/' + p : ''}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => null)
    await page.waitForTimeout(700)
    await page.screenshot({ path: `${outdir}/admin-${name}-${w}.png` })
    const sw = await page.evaluate(() => document.documentElement.scrollWidth)
    if (sw > w + 2) console.log(`OVERFLOW admin/${p || 'root'} @${w}: sw=${sw}`)
  }
  await ctx.close()
}

// Customer: login sekali (cookie di context), capture semua viewport
const cctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const cp = await cctx.newPage()
await cp.goto('http://localhost:4601/login', { waitUntil: 'networkidle' })
await cp.waitForTimeout(600)
const tog = cp.locator('a, button', { hasText: /masuk|sign in/i }).first()
try { await tog.click({ timeout: 3000 }); await cp.waitForTimeout(500) } catch {}
const f = cp.locator('form:has(input[name=email]):not(:has(input[name=name]))').first()
await f.locator('input[name=email]').fill(qaEmail)
await f.locator('input[name=password]').fill(qaPass)
await f.locator('button[type=submit], button[name=submit]').first().click()
await cp.waitForTimeout(2200)
console.log('cust login:', cp.url())

for (const [w, h] of VIEWPORTS) {
  await cp.setViewportSize({ width: w, height: h })
  for (const p of CUST_ROUTES) {
    const name = (p || 'overview').replace(/[/$]/g, '_')
    await cp.goto(`http://localhost:4601/user${p ? '/' + p : ''}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => null)
    await cp.waitForTimeout(700)
    await cp.screenshot({ path: `${outdir}/cust-${name}-${w}.png` })
    const sw = await cp.evaluate(() => document.documentElement.scrollWidth)
    if (sw > w + 2) console.log(`OVERFLOW cust/${p || 'root'} @${w}: sw=${sw}`)
  }
}
await cctx.close()
await browser.close()
console.log('CAPTURE DONE:', fs.readdirSync(outdir).length, 'files')
