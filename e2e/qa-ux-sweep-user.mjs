
import { chromium } from 'playwright'
import fs from 'node:fs'

const BASE = 'http://localhost:4601'
const exe = '/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell'
const stamp = Date.now().toString(36)
const account = {
  name: `QA uxsweep ${stamp}`,
  email: `qa.uxsweep.${stamp}@gmail.com`,
  password: `Gr0ut3r-${stamp}-Zq!`,
}

const PAGES = [
  { path: '/user', name: 'user-overview' },
  { path: '/user/install', name: 'user-install' },
  { path: '/user/usage', name: 'user-usage' },
  { path: '/user/orders', name: 'user-orders' },
  { path: '/user/payments', name: 'user-payments' },
  { path: '/user/account', name: 'user-account' },
]
const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1440', width: 1440, height: 900 },
]

const results = []
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
try {
  // Sekali register per viewport (context terpisah).
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await ctx.newPage()
    const consoleErrors = []
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200)) })
    page.on('pageerror', (err) => consoleErrors.push('PAGEERROR: ' + String(err).slice(0, 200)))

    // Register — email UNIK per viewport (duplikat email = gagal daftar).
    const acct = { ...account, email: account.email.replace('@', `.${vp.name}@`) }
    await page.goto(BASE + '/register', { waitUntil: 'networkidle' })
    const signupForm = page.locator('#signupForm, form:has(#suEmail)').first()
    if (!(await signupForm.isVisible().catch(() => false))) {
      await page.locator('#toSignup').first().click()
      await page.waitForTimeout(300)
    }
    await page.locator('#suName').fill(acct.name)
    await page.locator('#suEmail').fill(acct.email)
    await page.locator('#suPassword').fill(acct.password)
    await page.locator('#registerBtn').click()
    await page.waitForURL('**/user', { timeout: 15000 }).catch(() => {})
    const loggedIn = page.url().includes('/user')
    if (!loggedIn) {
      results.push({ page: 'REGISTER', vp: vp.name, status: 'REGISTER-FAIL', url: page.url() })
      await ctx.close()
      continue
    }

    for (const p of PAGES) {
      try {
        consoleErrors.length = 0
        await page.goto(BASE + p.path, { waitUntil: 'networkidle', timeout: 20000 })
        await page.waitForTimeout(600)
        const m = await page.evaluate(() => ({
          sw: document.documentElement.scrollWidth,
          cw: document.documentElement.clientWidth,
        }))
        const overflow = m.sw - m.cw
        const shot = `/home/ubuntu/grouter_copilot/.hermes/qa-screens/${p.name}-${vp.name}.png`
        await page.screenshot({ path: shot })
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
fs.writeFileSync('/home/ubuntu/grouter_copilot/.hermes/qa-screens/sweep-user.json', JSON.stringify(results, null, 1))
const bad = results.filter((r) => r.status !== 'ok')
console.log('TOTAL:', results.length, '| problems:', bad.length)
for (const b of bad) console.log(JSON.stringify(b).slice(0, 200))
