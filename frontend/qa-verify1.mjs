// Verifikasi cepat batch-1 fix: D1-D6
import { chromium } from 'playwright'
import fs from 'node:fs'

const outdir = '/root/shots-accept'
const adminToken = fs.readFileSync('/home/ubuntu/grouter_copilot/server/.env', 'utf8')
  .split('\n').find((l) => l.startsWith('ADMIN_TOKEN='))?.split('=').slice(1).join('=') ?? ''
const [qaEmail, qaPass] = fs.readFileSync('/root/shots-audit/qa-account.txt', 'utf8').trim().split('\n')

const browser = await chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

// Admin @1440: detail page (D1 Invalid Date, D2 badge, D6 nav ID)
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await ctx.newPage()
await page.addInitScript((t) => sessionStorage.setItem('adminToken', t), adminToken)
await page.goto('http://localhost:4601/admin/licenses/lic_mv0qz36v_2', { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(800)
const body = await page.evaluate(() => document.body.innerText)
console.log('D1 Invalid Date present:', body.includes('Invalid Date'))
console.log('D2 badge AKTIF present:', /AKTIF/.test(body))
console.log('D6 nav Indonesian:', body.includes('Lisensi') && body.includes('Orders & Pembayaran'))
await page.screenshot({ path: `${outdir}/after-detail-1440.png` })

// D4 overflow @768
await page.setViewportSize({ width: 768, height: 900 })
await page.goto('http://localhost:4601/admin/licenses/lic_mv0qz36v_2', { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
const sw = await page.evaluate(() => document.documentElement.scrollWidth)
console.log('D4 overflow@768 fixed:', sw <= 770, `(sw=${sw})`)
await page.screenshot({ path: `${outdir}/after-detail-768.png` })

// D3 mobile trigger @390
await page.setViewportSize({ width: 390, height: 844 })
await page.goto('http://localhost:4601/admin', { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
const trig = page.locator('button[data-sidebar=trigger], button[aria-label*=menu i], button[aria-label*=navigasi i]').first()
const trigVisible = await trig.isVisible().catch(() => false)
console.log('D3 sidebar trigger visible@390:', trigVisible)
if (trigVisible) {
  await trig.click()
  await page.waitForTimeout(600)
  const drawerItem = await page.locator('text=Lisensi').first().isVisible().catch(() => false)
  console.log('D3 drawer opens with nav:', drawerItem)
  await page.screenshot({ path: `${outdir}/after-drawer-390.png` })
}
// D5 ledger badge hijau
await page.setViewportSize({ width: 1440, height: 1000 })
await page.goto('http://localhost:4601/admin/ledger', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
const greenOk = await page.evaluate(() => {
  const badge = [...document.querySelectorAll('span')].find((s) => s.textContent?.trim() === 'sukses')
  return badge ? getComputedStyle(badge).color : 'no-badge'
})
console.log('D5 sukses badge color:', greenOk)
await page.screenshot({ path: `${outdir}/after-ledger-1440.png` })
await ctx.close()

// Customer nav ID (D6)
const cctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const cp = await cctx.newPage()
await cp.goto('http://localhost:4601/login', { waitUntil: 'networkidle' })
await cp.waitForTimeout(500)
const tog = cp.locator('a, button', { hasText: /masuk|sign in/i }).first()
try { await tog.click({ timeout: 3000 }); await cp.waitForTimeout(500) } catch {}
const f = cp.locator('form:has(input[name=email]):not(:has(input[name=name]))').first()
await f.locator('input[name=email]').fill(qaEmail)
await f.locator('input[name=password]').fill(qaPass)
await f.locator('button[type=submit], button[name=submit]').first().click()
await cp.waitForTimeout(2000)
const navText = await cp.evaluate(() => document.body.innerText)
console.log('D6 cust nav Indonesian:', navText.includes('Copilot Saya') && navText.includes('Paket & Perpanjangan') && navText.includes('Profil & Keamanan'))
await cp.screenshot({ path: `${outdir}/after-cust-overview-1440.png` })
await cctx.close()
await browser.close()
console.log('VERIFY DONE')
