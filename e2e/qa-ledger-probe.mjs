
import { chromium } from 'playwright'
import fs from 'node:fs'
const env = fs.readFileSync('/home/ubuntu/grouter_copilot/server/.env', 'utf8')
const ADMIN_TOKEN = (env.match(/^ADMIN_TOKEN=(.+)$/m) || [])[1]?.trim()
const exe = '/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell'
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const ctx = await browser.newContext({ viewport: { width: 768, height: 1024 } })
const page = await ctx.newPage()
await page.goto('http://localhost:4601/admin', { waitUntil: 'domcontentloaded' })
await page.locator('input[type=password], input[name=token], input[placeholder*=token i]').first().fill(ADMIN_TOKEN)
await page.keyboard.press('Enter')
await page.waitForTimeout(900)
await page.goto('http://localhost:4601/admin/ledger', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
// Ukur lebar setiap elemen yang melebihi viewport
const wide = await page.evaluate(() => {
  const d = document.documentElement
  const info = { sw: d.scrollWidth, cw: d.clientWidth, bodySW: document.body.scrollWidth, bodyCW: document.body.clientWidth }
  const wideEls = []
  document.querySelectorAll('*').forEach((el) => {
    const r = el.getBoundingClientRect()
    if (r.right > 770 && r.width > 50) {
      wideEls.push({ tag: el.tagName, cls: String(el.className).slice(0, 70), right: Math.round(r.right), w: Math.round(r.width) })
    }
  })
  info.wideEls = wideEls.slice(0, 10)
  return info
})
console.log(JSON.stringify(wide, null, 1))
await browser.close()
