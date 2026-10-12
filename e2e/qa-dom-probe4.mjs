
import { chromium } from 'playwright'
import fs from 'node:fs'
const env = fs.readFileSync('/home/ubuntu/grouter_copilot/server/.env', 'utf8')
const ADMIN_TOKEN = (env.match(/^ADMIN_TOKEN=(.+)$/m) || [])[1]?.trim()
const exe = '/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell'
const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] })

// (a) admin licenses nav landmark
const ctxA = await b.newContext({ viewport: { width: 1440, height: 900 } })
const pa = await ctxA.newPage()
await pa.goto('http://localhost:4601/admin', { waitUntil: 'domcontentloaded' })
await pa.locator('input[type=password], input[name=token]').first().fill(ADMIN_TOKEN)
await pa.keyboard.press('Enter')
await pa.waitForTimeout(900)
await pa.goto('http://localhost:4601/admin/licenses', { waitUntil: 'networkidle' })
await pa.waitForTimeout(400)
const a = await pa.evaluate(() => ({
  nav: document.querySelectorAll('nav').length,
  sidebarData: document.querySelectorAll('[data-sidebar]').length,
  navRoles: [...document.querySelectorAll('[role=navigation]')].length,
}))
console.log('admin/licenses:', JSON.stringify(a))

// (b) customer mobile DOM
const stamp = Date.now().toString(36)
const ctxB = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
const pb = await ctxB.newPage()
await pb.goto('http://localhost:4601/register', { waitUntil: 'networkidle' })
await pb.locator('#suName').fill(`QA p4 ${stamp}`)
await pb.locator('#suEmail').fill(`qa.p4.${stamp}@gmail.com`)
await pb.locator('#suPassword').fill(`Gr0ut3r-${stamp}-Zq!`)
await pb.locator('#registerBtn').click()
await pb.waitForURL('**/user', { timeout: 15000 })
const c = await pb.evaluate(() => ({
  triggerLabels: [...document.querySelectorAll('button[aria-label]')].map(x => x.getAttribute('aria-label')).slice(0, 8),
  bottomNav: document.querySelectorAll('nav a').length,
  dataSidebar: document.querySelectorAll('[data-sidebar]').length,
}))
console.log('customer 390:', JSON.stringify(c))

// (c) issue modal submit attrs
await pa.goto('http://localhost:4601/admin/licenses', { waitUntil: 'networkidle' })
await pa.getByRole('button', { name: /terbitkan lisensi/i }).first().click()
await pa.waitForTimeout(400)
const d = await pa.evaluate(() => {
  const dlg = document.querySelector('[role=dialog]')
  if (!dlg) return 'no dialog'
  const btns = [...dlg.querySelectorAll('button')]
  const submit = btns.find(x => /terbitkan|issue/i.test(x.textContent))
  const reqd = [...dlg.querySelectorAll('input,select,textarea')].filter(x => x.required).length
  return { submitText: submit?.textContent?.trim().slice(0, 20), submitDisabled: submit?.disabled, requiredFields: reqd }
})
console.log('issue modal:', JSON.stringify(d))
await b.close()
