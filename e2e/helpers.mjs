/**
 * Helper bersama untuk semua spec E2E.
 * Prinsip: identitas QA terisolasi per-run, kredensial tidak pernah dicetak,
 * tidak ada mock untuk API produk (hanya dependensi eksternal yang dinyatakan).
 */
import { chromium } from 'playwright'
import { existsSync, readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const BASE = process.env.E2E_BASE_URL || 'http://localhost:4601'

// ── ISOLATION ASSURANCE ──────────────────────────────────────────────────────
// This suite MUTATES state (creates accounts/orders/licenses). It must ONLY run
// against the disposable isolated instance started by `npm run e2e`. The runner
// exports E2E_ISOLATED=1; if it is absent, the suite is being pointed at
// production by mistake — refuse loudly before any request leaves the browser.
if (process.env.E2E_ISOLATED !== '1') {
  throw new Error(
    'E2E refused: E2E_ISOLATED!=1. This mutating suite must run against the isolated '
    + 'instance via `npm run e2e` (scripts/run-e2e.sh) — never against production. '
    + 'For read-only production checks use scripts/e2e-smoke-live.sh.',
  )
}
{
  let host = null
  try { host = new URL(BASE).hostname } catch { /* validated below */ }
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
    throw new Error(`E2E refused: base URL host "${host}" is not loopback (${BASE}).`)
  }
}

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
  if (!t) throw new Error('E2E_ADMIN_TOKEN wajib di-set oleh runner (npm run e2e menyediakan token instance terisolasi)')
  return t
}

/**
 * Registrasi akun QA via UI.
 *
 * UI sign-up saat ini adalah SPA 3-langkah di /login/sign-up
 * (frontend/src/components/ui/sign-up.tsx) — TANPA id #signupForm/#suEmail/
 * #toSignup (helper lama sudah usang; /login kini sign-in-only). Alur:
 *   1. /login/sign-up, isi email → Enter (maju ke langkah password);
 *   2. isi password → Enter (maju ke langkah konfirmasi);
 *   3. isi konfirmasi → klik tombol submit (aria-label "Finish sign-up");
 *   4. sukses → window.location = '/user' (delay ~1.6s untuk confetti).
 * Return { ctx, page, account } dengan sesi login sudah aktif.
 */
export async function registerViaUi(browser, account, { viewport } = {}) {
  const ctx = await browser.newContext(viewport ? { viewport } : undefined)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('/login/sign-up')
  await page.waitForLoadState('networkidle')

  const email = page.locator('input[type=email], input[placeholder="Email"]').first()
  await email.waitFor({ state: 'visible', timeout: 20_000 })
  await email.fill(account.email)
  await email.press('Enter')

  const password = page.locator('input[placeholder="Password"]').first()
  await password.waitFor({ state: 'visible', timeout: 20_000 })
  await password.fill(account.password)
  await password.press('Enter')

  const confirm = page.locator('input[placeholder="Confirm Password"]').first()
  await confirm.waitFor({ state: 'visible', timeout: 20_000 })
  await confirm.fill(account.password)

  // JANGAN klik tepat setelah fill. Mengisi konfirmasi memicu dua animasi:
  // label "Confirm Password" muncul (0.3s) dan BlurFade menggeser seluruh blok
  // field (0.4s). Playwright menghitung titik klik dari bounding box; kalau
  // kotak itu diambil sebelum animasi selesai, titiknya mendarat di
  // <div class="glass-input"> dan klik dilaporkan "intercepts pointer events".
  // Itu penyebab kegagalan [desktop] di CI 8862a20 dan di run lokal berikutnya
  // (1 failed, 21 passed) — sementara run lain lulus, jadi ini flake, bukan
  // regresi deterministik.
  //
  // "Element is stable" TIDAK cukup: easing cubic-bezier bisa membuat dua frame
  // berurutan hampir identik padahal elemen masih bergerak sub-piksel. Jadi
  // tunggu kondisi yang sebenarnya dibutuhkan klik: hit-test di titik tengah
  // tombol harus mengembalikan tombol itu sendiri.
  const submit = page.locator('button[aria-label="Finish sign-up"], button[type=submit]').first()
  await submit.waitFor({ state: 'visible', timeout: 20_000 })
  // Pastikan tombol benar-benar berada di dalam viewport SEBELUM hit-test.
  // elementFromPoint() mengembalikan null untuk koordinat di luar viewport, jadi
  // kalau form lebih tinggi dari layar (mis. konteks 390x844 yang diminta dari
  // project desktop) hit-test tidak akan pernah lolos walau tombolnya sehat.
  await submit.scrollIntoViewIfNeeded()

  await page.waitForFunction(
    () => {
      const btn = document.querySelector('button[aria-label="Finish sign-up"], button[type=submit]')
      if (!btn || btn.disabled) return false
      const r = btn.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) return false
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return !!hit && (hit === btn || btn.contains(hit))
    },
    null,
    { timeout: 20_000, polling: 100 },
  )
  await submit.click()
  // Sukses → redirect /user (SPA dashboard), delay ~1.6s.
  await page.waitForURL('**/user', { timeout: 25_000 })
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
  // Chromium di-resolve DINAMIS, jangan di-hardcode. Path lama
  // (/root/.cache/ms-playwright/chromium_headless_shell-1248/...arm64) hanya
  // ada di host dev ini; di runner CI (ubuntu-latest, x64, user `runner`) path
  // itu tidak ada sehingga SETIAP spec gagal di launch — 4 failed, 18 did not
  // run. Urutan: env override → binary yang Playwright unduh sendiri → rev
  // headless-shell yang terpasang di mesin ini (glob, rev berubah tiap upgrade).
  const candidates = []
  const override = (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '').trim()
  if (override) candidates.push(override)
  const pw = chromium.executablePath()
  if (pw) candidates.push(pw)
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(os.homedir(), '.cache', 'ms-playwright'),
    '/root/.cache/ms-playwright',
  ].filter(Boolean)
  for (const root of roots) {
    if (!existsSync(root)) continue
    for (const entry of readdirSync(root).sort().reverse()) {
      if (!entry.startsWith('chromium')) continue
      for (const rel of [
        ['chrome-linux', 'chrome'],
        ['chrome-linux64', 'chrome'],
        ['chrome-headless-shell-linux64', 'chrome-headless-shell'],
        ['chrome-headless-shell-linux-arm64', 'chrome-headless-shell'],
        ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'],
      ]) {
        candidates.push(path.join(root, entry, ...rel))
      }
    }
  }
  const exe = candidates.find((candidate) => candidate && existsSync(candidate))
  if (!exe) {
    throw new Error(
      `no chromium binary found. Run 'npx playwright install chromium' (frontend/) or set `
      + `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH. Tried:\n${candidates.join('\n')}`,
    )
  }
  return chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
}
