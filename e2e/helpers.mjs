/**
 * Helper bersama untuk semua spec E2E.
 * Prinsip: identitas QA terisolasi per-run, kredensial tidak pernah dicetak,
 * tidak ada mock untuk API produk (hanya dependensi eksternal yang dinyatakan).
 */
import { chromium } from 'playwright'

export const BASE = process.env.E2E_BASE_URL || 'http://localhost:4601'

/** Akun QA baru (unik per panggilan) — tak pernah memakai email customer nyata. */
export function newQaAccount(label = 'e2e') {
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  return {
    name: `QA ${label} ${stamp}`,
    email: `qa.${label}.${stamp}@gmail.com`,
    // Kompleks + tidak ada di kamus kebocoran (guard compromised-password aktif).
    password: `Qx${stamp}!Zq7#Kp2Wv`,
  }
}

/** Admin token dari env (WAJIB). Tidak pernah dicetak atau ditulis ke log. */
export function adminToken() {
  const t = process.env.E2E_ADMIN_TOKEN
  if (!t) throw new Error('E2E_ADMIN_TOKEN wajib di-set oleh runner (npm run e2e membacanya dari server/.env)')
  return t
}

/**
 * Registrasi akun QA via UI register (/login memuat register.html dua-form).
 * Return { page, account } dengan sesi login sudah aktif.
 */
export async function registerViaUi(browser, account, { viewport } = {}) {
  const ctx = await browser.newContext(viewport ? { viewport } : undefined)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  // register.html: dua form — default signup; kalau sedang signin, klik toggle.
  const signupForm = page.locator('#signupForm, form:has(#suEmail)').first()
  if (!(await signupForm.isVisible().catch(() => false))) {
    await page.locator('#toSignup, a:has-text("Daftar")').first().click()
  }
  await page.locator('#suName').fill(account.name)
  await page.locator('#suEmail').fill(account.email)
  await page.locator('#suPassword').fill(account.password)
  await page.locator('#registerBtn').click()
  // Sukses → redirect /user (SPA dashboard).
  await page.waitForURL('**/user', { timeout: 20_000 })
  await page.waitForLoadState('networkidle')
  return { ctx, page, errors }
}

/** Masuk sebagai admin via /admin-gate (token hanya ke sessionStorage browser). */
export async function loginAdmin(browser, { viewport } = {}) {
  const ctx = await browser.newContext(viewport ? { viewport } : undefined)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('/admin')
  // Gate menampilkan form token → isi → submit.
  await page.waitForLoadState('networkidle')
  const tokenInput = page.locator('input[type=password], input[name=token], input[placeholder*=token i]').first()
  await tokenInput.waitFor({ state: 'visible', timeout: 15_000 })
  await tokenInput.fill(adminToken())
  await page.locator('button[type=submit], button:has-text("Masuk"), button:has-text("Buka")').first().click()
  await page.waitForURL('**/admin', { timeout: 20_000 })
  await page.waitForLoadState('networkidle')
  return { ctx, page, errors }
}

/** Tunggu sampai tidak ada request /api yang gagal (kecuali daftar status dikecualikan). */
export function collectApiErrors(page, { allow = [401] } = {}) {
  const failed = []
  page.on('response', (res) => {
    if (res.url().includes('/api/') && res.status() >= 400 && !allow.includes(res.status())) {
      failed.push(`${res.status()} ${res.request().method()} ${new URL(res.url()).pathname}`)
    }
  })
  return failed
}

export async function launch() {
  // Chromium 1248 sudah ter-install di /root/.cache/ms-playwright (dipakai QA
  // sebelumnya); pin executablePath agar tidak minta download versi lain.
  const exe = '/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell'
  return chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
}
