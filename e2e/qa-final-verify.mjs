
import { chromium } from 'playwright'
import fs from 'node:fs'
const env = fs.readFileSync('/home/ubuntu/grouter_copilot/server/.env', 'utf8')
const ADMIN_TOKEN = (env.match(/^ADMIN_TOKEN=(.+)$/m) || [])[1]?.trim()
const exe = '/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell'
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)))
await page.goto('http://localhost:4601/admin', { waitUntil: 'domcontentloaded' })
await page.locator('input[type=password], input[name=token], input[placeholder*=token i]').first().fill(ADMIN_TOKEN)
await page.keyboard.press('Enter')
await page.waitForTimeout(900)
await page.goto('http://localhost:4601/admin', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await page.screenshot({ path: '/home/ubuntu/grouter_copilot/.hermes/qa-screens/admin-overview-fixed-1440.png' })
console.log('overview errors:', errors.length)
errors.length = 0
await page.goto('http://localhost:4601/admin/packages', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await page.screenshot({ path: '/home/ubuntu/grouter_copilot/.hermes/qa-screens/admin-packages-fixed2-1440.png' })
console.log('packages errors:', errors.length)
// sanity: teks service health
await page.goto('http://localhost:4601/admin', { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
const body = await page.locator('body').innerText()
console.log('has 1,82 dtk (mock)?', body.includes('1,82 dtk') ? 'MASIH' : 'gone')
console.log('has 99,6% (mock)?', body.includes('99,6%') ? 'MASIH' : 'gone')
console.log('has "60 dtk refetch"?', body.includes('60 dtk refetch') ? 'YES' : 'no')
await browser.close()
