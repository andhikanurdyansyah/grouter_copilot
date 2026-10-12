
import { chromium } from 'playwright'
const exe = '/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell'
const stamp = Date.now().toString(36)
const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
const p = await ctx.newPage()
await p.goto('http://localhost:4601/register', { waitUntil: 'networkidle' })
await p.locator('#suName').fill(`QA p5 ${stamp}`)
await p.locator('#suEmail').fill(`qa.p5.${stamp}@gmail.com`)
await p.locator('#suPassword').fill(`Gr0ut3r-${stamp}-Zq!`)
await p.locator('#registerBtn').click()
await p.waitForURL('**/user', { timeout: 15000 })
await p.waitForLoadState('networkidle')
await p.waitForTimeout(1200)
const c = await p.evaluate(() => ({
  path: location.pathname,
  triggerLabels: [...document.querySelectorAll('button[aria-label]')].map(x => x.getAttribute('aria-label')).slice(0, 8),
  navA: document.querySelectorAll('nav a').length,
  navAria: [...document.querySelectorAll('nav')].map(n => n.getAttribute('aria-label')),
  dataSidebar: document.querySelectorAll('[data-sidebar]').length,
}))
console.log(JSON.stringify(c, null, 1))
await b.close()
