
import { chromium } from 'playwright'
import fs from 'node:fs'
const env = fs.readFileSync('/home/ubuntu/grouter_copilot/server/.env', 'utf8')
const ADMIN_TOKEN = (env.match(/^ADMIN_TOKEN=(.+)$/m) || [])[1]?.trim()
const exe = '/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell'
const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage()
await p.goto('http://localhost:4601/admin', { waitUntil: 'domcontentloaded' })
await p.locator('input[type=password], input[name=token]').first().fill(ADMIN_TOKEN)
await p.keyboard.press('Enter')
await p.waitForTimeout(900)
console.log('URL after login:', p.url())
const dom = await p.evaluate(() => {
  const counts = {}
  for (const sel of ['aside', 'nav', '[aria-label="Toggle Sidebar"]', '[data-slot="sidebar"]', '[data-sidebar]', 'main', 'button[aria-label]']) {
    counts[sel] = document.querySelectorAll(sel).length
  }
  const ariaLabels = [...document.querySelectorAll('button[aria-label]')].map(b => b.getAttribute('aria-label')).slice(0, 8)
  return { url: location.pathname, counts, ariaLabels }
})
console.log(JSON.stringify(dom, null, 1))
await b.close()
