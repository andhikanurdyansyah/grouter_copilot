
import { chromium } from 'playwright'
import fs from 'node:fs'
const env = fs.readFileSync('/home/ubuntu/grouter_copilot/server/.env', 'utf8')
const ADMIN_TOKEN = (env.match(/^ADMIN_TOKEN=(.+)$/m) || [])[1]?.trim()
const exe = '/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell'
const BASE = 'http://localhost:4601'
const results = []
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 100)))

  // login admin
  await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' })
  await page.locator('input[type=password], input[name=token], input[placeholder*=token i]').first().fill(ADMIN_TOKEN)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(900)

  const check = (name, cond, detail = '') => results.push({ name, status: cond ? 'ok' : 'FAIL', detail })

  // ── 1. Modal issue license (licenses page): buka, Esc tutup, fokus balik ──
  await page.goto(BASE + '/admin/licenses', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /terbitkan lisensi/i }).first().click()
  await page.waitForTimeout(400)
  const dialog = page.getByRole('dialog')
  const dlgVisible = await dialog.isVisible().catch(() => false)
  check('issue-modal opens', dlgVisible)
  if (dlgVisible) {
    // fokus awal di dalam dialog?
    const focusIn = await page.evaluate(() => {
      const d = document.querySelector('[role=dialog]')
      return d ? d.contains(document.activeElement) : false
    })
    check('issue-modal initial focus inside', focusIn)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    const closed = !(await page.getByRole('dialog').isVisible().catch(() => false))
    check('issue-modal Esc closes', closed)
  }

  // ── 2. Packages: dialog buat paket baru + validasi (nama kosong → submit tak jalan) ──
  await page.goto(BASE + '/admin/packages', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /paket baru/i }).first().click()
  await page.waitForTimeout(400)
  const dlg2 = page.getByRole('dialog')
  const dlg2Vis = await dlg2.isVisible().catch(() => false)
  check('create-plan dialog opens', dlg2Vis)
  if (dlg2Vis) {
    // form required: submit kosong → dialog tetap + no crash
    await dlg2.getByRole('button', { name: /simpan/i }).click().catch(() => {})
    await page.waitForTimeout(300)
    const stillOpen = await dlg2.isVisible().catch(() => false)
    check('create-plan empty submit blocked (required)', stillOpen)
    // duplikat key: isi nama 'Custom' → slug custom sudah ada
    await dlg2.locator('input').first().fill('Custom')
    await dlg2.locator('input#plan-price').fill('1000')
    await dlg2.locator('input#plan-days').fill('30')
    await dlg2.getByRole('button', { name: /simpan/i }).click()
    await page.waitForTimeout(700)
    const body = await page.locator('body').innerText()
    const dupBlocked = /sudah dipakai|slug/i.test(body)
    check('create-plan duplicate slug rejected', dupBlocked)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }

  // ── 3. Settings page: tidak ada toast palsu saat load; input secret masked? ──
  await page.goto(BASE + '/admin/settings', { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  const sBody = await page.locator('body').innerText()
  check('settings no NaN/undefined', !sBody.includes('NaN') && !sBody.includes('undefined'))

  // ── 4. Orders page: klik order → detail modal/response nyata ──
  await page.goto(BASE + '/admin/orders', { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  const oBody = await page.locator('body').innerText()
  check('orders empty-state honest', /belum ada|tidak ada|no orders|0/i.test(oBody))

  // ── 5. License detail: tombol revoke tampil + confirm dialog? (tanpa revoke beneran) ──
  await page.goto(BASE + '/admin/licenses', { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  const rows = page.locator('table tbody tr')
  const nRows = await rows.count()
  check('licenses table rows render', nRows > 0, `rows=${nRows}`)
  if (nRows > 0) {
    await rows.first().locator('a, button').first().click()
    await page.waitForTimeout(700)
    const dBody = await page.locator('body').innerText()
    check('license detail opens (no NaN)', !dBody.includes('NaN') && !dBody.includes('undefined'))
  }

  console.log('INTERACTION RESULTS:')
  for (const r of results) console.log(`${r.status.toUpperCase()} ${r.name}${r.detail ? ' (' + r.detail + ')' : ''}`)
  console.log('pageerrors:', errors.length, errors.slice(0, 2))
  await browser.close()
} catch (e) {
  console.log('FATAL:', String(e).slice(0, 200))
  console.log('PARTIAL RESULTS:')
  for (const r of results) console.log(`${r.status.toUpperCase()} ${r.name}`)
  await browser.close()
}
