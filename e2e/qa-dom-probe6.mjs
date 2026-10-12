
import { chromium } from 'playwright'
import fs from 'node:fs'
const env = fs.readFileSync('/home/ubuntu/grouter_copilot/server/.env', 'utf8')
const ADMIN_TOKEN = (env.match(/^ADMIN_TOKEN=(.+)$/m) || [])[1]?.trim()
const exe = '/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell'
const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const p = await ctx.newPage()
await p.goto('http://localhost:4601/admin', { waitUntil: 'domcontentloaded' })
await p.keyboard.type(ADMIN_TOKEN)
await p.keyboard.press('Enter')
await p.waitForTimeout(900)
console.log('url1:', p.url())
await p.goto('http://localhost:4601/admin/licenses', { waitUntil: 'networkidle' })
await p.waitForTimeout(1200)
console.log('url2:', p.url())
const lm = await p.evaluate(() => ({
  nav: !!document.querySelector('nav, [role=navigation]'),
  navCount: document.querySelectorAll('nav').length,
  main: !!document.querySelector('main, [role=main]'),
  h1: !!document.querySelector('h1'),
  aside: !!document.querySelector('aside'),
}))
console.log(JSON.stringify(lm))
await b.close()
