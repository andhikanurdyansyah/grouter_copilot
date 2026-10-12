
import { chromium } from 'playwright'
const exe = '/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell'
const stamp = Date.now().toString(36)
const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const p = await ctx.newPage()
await p.goto('http://localhost:4601/register', { waitUntil: 'networkidle' })
await p.locator('#suName').fill(`QA rt ${stamp}`)
await p.locator('#suEmail').fill(`qa.rt.${stamp}@gmail.com`)
await p.locator('#suPassword').fill(`Gr0ut3r-${stamp}-Zq!`)
await p.locator('#registerBtn').click()
await p.waitForURL('**/user', { timeout: 15000 })
await p.goto('http://localhost:4601/user/account', { waitUntil: 'networkidle' })
await p.waitForTimeout(500)
await p.getByRole('button', { name: /ubah profil|edit profile/i }).first().click()
await p.waitForTimeout(400)
const dlg = p.getByRole('dialog')
// HANYA input di dalam dialog
await dlg.locator('input#account-name, input').first().fill(`RENAMED-${stamp}`)
const saveBtn = dlg.getByRole('button', { name: /simpan|save/i }).last()
console.log('save btn count in dialog:', await dlg.getByRole('button', { name: /simpan|save/i }).count())
await saveBtn.click()
// tunggu sampai dialog tutup (max 4s)
let closed = false
for (let i = 0; i < 8; i++) {
  await p.waitForTimeout(500)
  if (!(await dlg.isVisible().catch(() => false))) { closed = true; break }
}
console.log('dialog closed:', closed)
await p.waitForTimeout(800)
const body = await p.locator('body').innerText()
console.log('new name visible:', body.includes(`RENAMED-${stamp}`) ? 'YES' : 'NO')
// tampil konteks nama di halaman + cari kata gagal/failed
const lines = body.split('\n').filter(l => /gagal|failed|error|HTTP|RENAMED/i.test(l))
console.log('suspicious lines:', JSON.stringify(lines.slice(0, 6)))
console.log('error banner?', /gagal|failed|HTTP/i.test(body) ? 'CHECK' : 'none')
await b.close()
