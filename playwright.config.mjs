/**
 * Playwright E2E — gRouter Copilot (SPA dashboard di /app/).
 *
 * Target: http://localhost:4601 (frontend pm2 yang mem-proxy /api/* ke :4600).
 * Prasyarat: `pm2 start copilot-backend && pm2 start copilot-frontend`.
 *
 * IDENTITAS: setiap run membuat akun QA baru via /api/auth/sign-up/email
 * (suffix timestamp) — TIDAK menyentuh record customer nyata. Kredensial admin
 * dibaca dari env E2E_ADMIN_TOKEN (WAJIB di-set oleh runner; nilai tidak pernah
 * dicetak). Mode pembayaran produksi = KlikQRIS SANDBOX: checkout membuat order
 * sandbox PENDING tanpa uang nyata; penyelesaian pembayaran upstream yang butuh
 * interaksi simulator/manual TIDAK diotomasi di sini (blocker eksternal yang
 * didokumentasikan) — kecuali E2E_PAY_SEAM=1 (hanya untuk backend uji lokal
 * berisolasi, tidak pernah diarahkan ke produksi).
 *
 * Jalankan: npm run e2e  (dari root repo)
 */

// ── FAIL-CLOSED: this config must NEVER drive production ─────────────────────
// The mutating suite may only run against a disposable instance started by
// `npm run e2e` (scripts/run-e2e.sh → e2e/isolated/run.mjs), which exports
// E2E_ISOLATED=1 and E2E_BASE_URL. Without them, refuse to even load — a bare
// `npx playwright test` must not point at localhost:4601 (production).
//
// The guards run BEFORE playwright is imported on purpose: a static import
// resolves first, so a missing/half-installed playwright made the config fail
// with MODULE_NOT_FOUND instead of the refusal — a caller could not tell a
// blocked production run from a broken checkout, and the guard silently never
// executed. Validate the target first, then load the framework.
if (process.env.E2E_ISOLATED !== '1') {
  throw new Error(
    'playwright.config.mjs refused: E2E_ISOLATED!=1. Run the mutating E2E only via '
    + '`npm run e2e`. For a read-only production check use `npm run smoke:live`.',
  )
}

const BASE = process.env.E2E_BASE_URL
if (!BASE) {
  throw new Error('playwright.config.mjs refused: E2E_BASE_URL is not set (the isolated runner sets it).')
}
{
  let host = null
  try { host = new URL(BASE).hostname } catch { /* validated below */ }
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
    throw new Error(`playwright.config.mjs refused: E2E_BASE_URL host "${host}" is not loopback (${BASE}).`)
  }
}

const { defineConfig, devices } = await import('./frontend/node_modules/playwright/test.mjs')

export default defineConfig({
  testDir: './e2e/specs',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // urutan penting: akun & order dibuat per-spesifikasi
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
})
