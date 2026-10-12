
import { chromium } from 'playwright'
const exe = '/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell'
const stamp = Date.now().toString(36)
const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const ctx = await b.newContext()
const p = await ctx.newPage()
await p.goto('http://localhost:4601/register', { waitUntil: 'networkidle' })
await p.locator('#suName').fill(`QA vm ${stamp}`)
await p.locator('#suEmail').fill(`qa.vm.${stamp}@gmail.com`)
await p.locator('#suPassword').fill(`Gr0ut3r-${stamp}-Zq!`)
await p.locator('#registerBtn').click()
await p.waitForURL('**/user', { timeout: 15000 })
const stamp2 = stamp
const before = await p.evaluate(async (s2) => (await (await fetch('/api/me', { credentials: 'include' })).json()).account?.name, stamp2)
const upd = await p.evaluate(async (s2) => {
  const r = await fetch('/api/auth/update-user', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `RENAMED-VM-${s2}` }) })
  return r.status
}, stamp)
await p.waitForTimeout(500)
const after = await p.evaluate(async (s2) => (await (await fetch('/api/me', { credentials: 'include' })).json()).account?.name, stamp2)
console.log('before:', before, '| update status:', upd, '| after:', after)
console.log('SERVER REFLECTS:', after === `RENAMED-VM-${stamp}` ? 'YES' : 'NO')
await b.close()
