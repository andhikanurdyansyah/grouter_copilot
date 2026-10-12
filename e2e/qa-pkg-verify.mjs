
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
await page.goto('http://localhost:4601/admin/packages', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
const body = await page.locator('body').innerText()
console.log('has plan card:', /3B · 3 months|15B · 1 year|Custom/.test(body) ? 'YES' : 'NO')
console.log('empty state?', body.includes('Belum ada paket aktif') ? 'MASIH' : 'gone')
console.log('pageerrors:', errors.length)
await page.screenshot({ path: '/home/ubuntu/grouter_copilot/.hermes/qa-screens/admin-packages-fixed-1440.png' })
await browser.close()
