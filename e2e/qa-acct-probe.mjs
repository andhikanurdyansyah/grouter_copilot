
import { chromium } from 'playwright'
import fs from 'node:fs'
const BASE = 'http://localhost:4601'
const exe = '/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell'
const stamp = Date.now().toString(36)
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()
await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
await page.locator('#suName').fill(`QA probe ${stamp}`)
await page.locator('#suEmail').fill(`qa.probe.${stamp}@gmail.com`)
await page.locator('#suPassword').fill(`Gr0ut3r-${stamp}-Zq!`)
await page.locator('#registerBtn').click()
await page.waitForURL('**/user', { timeout: 15000 })
await page.goto(BASE + '/user/account', { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
const info = await page.evaluate(() => {
  const wide = []
  document.querySelectorAll('*').forEach((el) => {
    const r = el.getBoundingClientRect()
    if (r.right > 392 && r.width > 30) {
      wide.push({ tag: el.tagName, cls: String(el.className).slice(0, 70), right: Math.round(r.right), w: Math.round(r.width) })
    }
  })
  return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, wide: wide.slice(0, 10) }
})
console.log(JSON.stringify(info, null, 1))
await browser.close()
