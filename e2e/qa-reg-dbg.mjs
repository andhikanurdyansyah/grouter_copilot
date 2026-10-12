
import { chromium } from 'playwright'
const exe = '/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell'
const stamp = Date.now().toString(36)
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text().slice(0, 160)) })
await page.goto('http://localhost:4601/register', { waitUntil: 'networkidle' })
await page.locator('#suName').fill(`QA dbg ${stamp}`)
await page.locator('#suEmail').fill(`qa.dbg.${stamp}@gmail.com`)
await page.locator('#suPassword').fill(`Gr0ut3r-${stamp}-Zq!`)
await page.locator('#registerBtn').click()
await page.waitForTimeout(4000)
console.log('URL:', page.url())
const err = await page.locator('#authError').textContent().catch(() => null)
console.log('authError:', err)
await page.screenshot({ path: '/home/ubuntu/grouter_copilot/.hermes/qa-screens/dbg-register-1440.png' })
await browser.close()
