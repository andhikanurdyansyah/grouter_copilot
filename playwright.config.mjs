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
import { defineConfig, devices } from './frontend/node_modules/playwright/test.mjs'

const BASE = process.env.E2E_BASE_URL || 'http://localhost:4601'

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
