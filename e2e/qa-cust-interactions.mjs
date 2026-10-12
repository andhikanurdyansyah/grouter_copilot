
import { chromium } from 'playwright'
import fs from 'node:fs'
const exe = '/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell'
const BASE = 'http://localhost:4601'
const results = []
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
try {
  const check = (name, cond, detail = '') => results.push({ name, status: cond ? 'ok' : 'FAIL', detail })

  // ── Register validation: password pendek → error banner, tanpa crash ──
  const ctx1 = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const p1 = await ctx1.newPage()
  const errors1 = []
  p1.on('pageerror', (e) => errors1.push(String(e).slice(0, 100)))
  await p1.goto(BASE + '/register', { waitUntil: 'networkidle' })
  await p1.locator('#suName').fill('QA Int Test')
  await p1.locator('#suEmail').fill('qa.int.shortpw.test@gmail.com')
  await p1.locator('#suPassword').fill('short')
  await p1.locator('#registerBtn').click()
  await p1.waitForTimeout(600)
  // minlength=8 → browser validation block (form tidak submit) ATAU server 400 → error box
  const stillOnRegister = p1.url().includes('/register')
  const errBox = await p1.locator('#authError').isVisible().catch(() => false)
  check('register short-password blocked', stillOnRegister, errBox ? 'error-box shown' : 'native validation')
  await ctx1.close()

  // ── Register real → /user → edit nama via modal → cek tersimpan ──
  const stamp = Date.now().toString(36)
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const p2 = await ctx2.newPage()
  const errors2 = []
  p2.on('pageerror', (e) => errors2.push(String(e).slice(0, 100)))
  await p2.goto(BASE + '/register', { waitUntil: 'networkidle' })
  await p2.locator('#suName').fill(`QA int flow ${stamp}`)
  await p2.locator('#suEmail').fill(`qa.intflow.${stamp}@gmail.com`)
  await p2.locator('#suPassword').fill(`Gr0ut3r-${stamp}-Zq!`)
  await p2.locator('#registerBtn').click()
  await p2.waitForURL('**/user', { timeout: 15000 })
  check('register → /user redirect', p2.url().includes('/user'))

  // Edit profil: buka modal, ubah nama, simpan, verifikasi body berubah
  await p2.goto(BASE + '/user/account', { waitUntil: 'networkidle' })
  await p2.waitForTimeout(500)
  const editBtn = p2.getByRole('button', { name: /ubah profil|edit profile/i }).first()
  await editBtn.click()
  await p2.waitForTimeout(400)
  const dlg = p2.getByRole('dialog')
  const dlgVis = await dlg.isVisible().catch(() => false)
  check('edit-profile modal opens', dlgVis)
  if (dlgVis) {
    const nameInput = dlg.locator('input').first()
    await nameInput.fill(`QA int renamed ${stamp}`)
    await dlg.getByRole('button', { name: /simpan|save/i }).click()
    await p2.waitForTimeout(900)
    const body = await p2.locator('body').innerText()
    check('edit-profile saves (new name shown)', body.includes(`QA int renamed ${stamp}`))
    // dialog tutup?
    const dlgClosed = !(await p2.getByRole('dialog').isVisible().catch(() => false))
    check('edit-profile modal closes after save', dlgClosed)
  }

  // ── Checkout sandbox: pilih paket → order PENDING + QR muncul, TANPA bayar ──
  await p2.goto(BASE + '/user', { waitUntil: 'networkidle' })
  await p2.waitForTimeout(500)
  // cari CTA beli/upgrade
  const buyBtn = p2.getByRole('button', { name: /beli|pilih|upgrade|mulai/i }).first()
  const hasBuy = await buyBtn.isVisible().catch(() => false)
  if (hasBuy) {
    await buyBtn.click()
    await p2.waitForTimeout(1200)
    const afterBody = await p2.locator('body').innerText()
    const orderMade = /PENDING|QRIS|qr|scan|bayar/i.test(afterBody)
    check('checkout → PENDING/QR state', orderMade)
  } else {
    check('checkout CTA visible', false, 'no buy button found on /user')
  }
  check('customer flow no pageerrors', errors2.length === 0, errors2[0] || '')

  console.log('CUSTOMER INTERACTION RESULTS:')
  for (const r of results) console.log(`${r.status.toUpperCase()} ${r.name}${r.detail ? ' (' + r.detail + ')' : ''}`)
  await browser.close()
} catch (e) {
  console.log('FATAL:', String(e).slice(0, 200))
  for (const r of results) console.log(`${r.status.toUpperCase()} ${r.name}`)
  await browser.close()
}
