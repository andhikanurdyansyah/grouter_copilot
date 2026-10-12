
import { chromium } from 'playwright'
import fs from 'node:fs'
const env = fs.readFileSync('/home/ubuntu/grouter_copilot/server/.env', 'utf8')
const ADMIN_TOKEN = (env.match(/^ADMIN_TOKEN=(.+)$/m) || [])[1]?.trim()
const exe = '/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell'
const BASE = 'http://localhost:4601'
const results = []
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const check = (name, cond, detail = '') => results.push({ name, status: cond ? 'ok' : 'FAIL', detail })

try {
  // ============ MOBILE ADMIN 390 ============
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(String(e).slice(0, 100)))
  await p.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' })
  await p.locator('input[type=password], input[name=token], input[placeholder*=token i]').first().fill(ADMIN_TOKEN)
  await p.keyboard.press('Enter')
  await p.waitForTimeout(900)

  // 1. Mobile sidebar drawer: tombol buka sidebar ada?
  const burger = p.locator('button[aria-label*="navigasi" i], button[aria-label*="Toggle Sidebar" i]').first()
  const burgerVis = await burger.isVisible().catch(() => false)
  check('mobile: sidebar trigger visible', burgerVis)
  if (burgerVis) {
    await burger.click()
    await p.waitForTimeout(500)
    // sheet/drawer muncul dgn nav items
    const drawerNav = await p.locator('[role=dialog] a, [data-slot=sheet-content] a, [data-state=open] a').count()
    check('mobile: drawer opens with nav links', drawerNav >= 3, `links=${drawerNav}`)
    // screenshot utk dokumentasi
    await p.screenshot({ path: '/home/ubuntu/grouter_copilot/.hermes/qa-screens/mobile-drawer-admin.png' })
    // tutup via Esc atau overlay klik
    await p.keyboard.press('Escape')
    await p.waitForTimeout(400)
    const drawerGone = !(await p.locator('[role=dialog][data-state=open]').first().isVisible().catch(() => false))
    check('mobile: drawer closes (Esc/overlay)', drawerGone)
  }

  // 2. Modal issue-license di 390: buka → tidak overflow → bisa di-close
  await p.goto(BASE + '/admin/licenses', { waitUntil: 'networkidle' })
  await p.waitForTimeout(400)
  const issueBtn = p.getByRole('button', { name: /terbitkan lisensi/i }).first()
  if (await issueBtn.isVisible().catch(() => false)) {
    await issueBtn.click()
    await p.waitForTimeout(500)
    const dlg = p.getByRole('dialog')
    const open = await dlg.isVisible().catch(() => false)
    check('mobile: issue-modal opens', open)
    if (open) {
      const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
      check('mobile: modal no ICB overflow', m.sw - m.cw <= 2, `sw=${m.sw} cw=${m.cw}`)
      // submit disabled tanpa isian? (validasi)
      const submitBtn = dlg.getByRole('button', { name: /terbitkan|issue/i }).last()
      // Guard = handleNext no-op saat nama kosong: klik → dialog tetap step 1, tak ada crash
      await submitBtn.click().catch(() => {})
      await p.waitForTimeout(600)
      const stillStep1 = await dlg.isVisible().catch(() => false)
      const stillNoLicense = !(await p.locator('body').innerText()).includes('Langkah 2')
      check('mobile: issue submit guarded empty', stillStep1 && stillNoLicense, 'no-op guard (JS logic)')
      await p.screenshot({ path: '/home/ubuntu/grouter_copilot/.hermes/qa-screens/mobile-issue-modal.png' })
      await p.keyboard.press('Escape')
      await p.waitForTimeout(300)
    }
  } else {
    check('mobile: issue button visible', false, 'not found')
  }
  check('mobile: no pageerrors', errors.length === 0, errors[0] || '')
  await ctx.close()

  // ============ MOBILE CUSTOMER 390 (drawer + nav) ============
  const stamp = Date.now().toString(36)
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
  const p2 = await ctx2.newPage()
  await p2.goto(BASE + '/register', { waitUntil: 'networkidle' })
  await p2.locator('#suName').fill(`QA mob ${stamp}`)
  await p2.locator('#suEmail').fill(`qa.mob.${stamp}@gmail.com`)
  await p2.locator('#suPassword').fill(`Gr0ut3r-${stamp}-Zq!`)
  await p2.locator('#registerBtn').click()
  await p2.waitForURL('**/user', { timeout: 15000 })
  // drawer customer
  await p2.waitForLoadState('networkidle')
  await p2.waitForTimeout(1200)
  const burger2 = p2.locator('button[aria-label*="navigasi" i], button[aria-label*="Toggle Sidebar" i]').first()
  if (await burger2.isVisible().catch(() => false)) {
    await burger2.click()
    await p2.waitForTimeout(500)
    const navCount = await p2.locator('[role=dialog] a, [data-slot=sheet-content] a, [data-state=open] a').count()
    check('mobile customer: drawer opens', navCount >= 2, `links=${navCount}`)
    await p2.screenshot({ path: '/home/ubuntu/grouter_copilot/.hermes/qa-screens/mobile-drawer-user.png' })
    await p2.keyboard.press('Escape')
    await p2.waitForTimeout(300)
  }
  // bottom nav customer ('Navigasi mobile') = navigasi utama mobile
  const bottomNav = await p2.locator('nav[aria-label="Navigasi mobile"] a').count()
  check('mobile customer: bottom nav reachable', bottomNav >= 3, `links=${bottomNav}`)
  await ctx2.close()

  // ============ KEYBOARD/FOKUS DESKTOP 1440 ============
  const ctx3 = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const p3 = await ctx3.newPage()
  await p3.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' })
  // 3. Login gate keyboard-only: tunggu input mount → autoFocus harus langsung fokus
  await p3.waitForSelector('#admin-token, input[type=password]', { timeout: 8000 })
  await p3.waitForTimeout(400)
  const autoFocus = await p3.evaluate(() => document.activeElement?.id === 'admin-token' || document.activeElement?.tagName === 'INPUT')
  if (!autoFocus) await p3.keyboard.press('Tab')
  const focusNow = await p3.evaluate(() => document.activeElement?.tagName === 'INPUT')
  await p3.keyboard.type(ADMIN_TOKEN)
  await p3.keyboard.press('Enter')
  await p3.waitForTimeout(1200)
  check('keyboard: token login via keyboard only', focusNow && p3.url().includes('/admin-gate') === false, autoFocus ? 'auto-focus' : 'tab-focus')
  if (!autoFocus) console.log('NOTE: admin-gate token input auto-focus = no (Tab needed)')
  // 4. Skip-link / main landmark?
  await p3.goto(BASE + '/admin/licenses', { waitUntil: 'networkidle' })
  await p3.waitForTimeout(1200)
  const landmarks = await p3.evaluate(() => ({
    main: !!document.querySelector('main, [role=main]'),
    nav: !!document.querySelector('nav, [role=navigation]'),
    h1: !!document.querySelector('h1'),
  }))
  check('a11y: main landmark exists', landmarks.main)
  check('a11y: nav landmark exists', landmarks.nav)
  check('a11y: h1 exists', landmarks.h1)
  // 5. Fokus terlihat (focus-visible ring di CSS)?
  const focusRing = await p3.evaluate(() => {
    const btn = document.querySelector('button')
    if (!btn) return false
    btn.focus()
    const st = getComputedStyle(btn)
    return (st.outlineStyle !== 'none' && st.outlineWidth !== '0px') || st.boxShadow !== 'none'
  })
  check('a11y: focus indicator present', focusRing)
  await ctx3.close()
} finally {
  await browser.close()
}
console.log('MOBILE+KEYBOARD RESULTS:')
for (const r of results) console.log(`${r.status.toUpperCase()} ${r.name}${r.detail ? ' (' + r.detail + ')' : ''}`)
fs.writeFileSync('/home/ubuntu/grouter_copilot/.hermes/qa-screens/sweep-mobile-kb.json', JSON.stringify(results, null, 1))
