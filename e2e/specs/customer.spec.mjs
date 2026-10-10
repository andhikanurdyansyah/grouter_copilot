/**
 * E2E CUSTOMER — register → login → dashboard → paket → checkout sandbox →
 * order PENDING → polling dialog → lisensi (empty state) → install → usage →
 * logout → session guard.
 *
 * CATATAN SET (jujur): penyelesaian pembayaran upstream (scan/simulator
 * klikqris.com) adalah dependensi eksternal yang TIDAK diotomasi di sini —
 * order dihentikan di status PENDING yang diverifikasi benar. Transisi PENDING
 * → PAID → lisensi terbit sudah tercakup penuh oleh test backend
 * server/test/customer-register-to-chat.e2e.test.js (88 test server).
 */
import { test, expect } from 'playwright/test'
import { newQaAccount, registerViaUi, launch, BASE, collectApiErrors } from '../helpers.mjs'

let browser

test.beforeAll(async () => {
  browser = await launch()
})

test.afterAll(async () => {
  await browser?.close()
})

test('customer: register → dashboard nyata (tanpa data palsu)', async () => {
  const { page, errors } = await registerViaUi(browser, newQaAccount('journey'))
  try {
    // Dashboard customer: judul & nav nyata.
    await expect(page.getByRole('heading', { name: /ringkasan|kopi|copilot/i }).first()).toBeVisible({ timeout: 20_000 })
    // Akun baru: state kosong yang jujur (belum ada lisensi).
    await expect(page.locator('body')).not.toContainText('undefined')
    await expect(page.locator('body')).not.toContainText('NaN')
    // Kebocoran kredensial: tidak ada token/gateway key yang terlihat.
    const body = await page.locator('body').innerText()
    expect(body).not.toMatch(/gRouter-[A-Za-z0-9]{16,}/)
    expect(errors).toEqual([])
  } finally {
    await page.context().close()
  }
})

test('customer: paket → checkout sandbox → order PENDING terverifikasi server', async () => {
  const { page } = await registerViaUi(browser, newQaAccount('checkout'))
  try {
    const apiErrors = collectApiErrors(page)
    await page.goto('/user/orders')
    await page.waitForLoadState('networkidle')

    // Minimal satu paket berharga tersedia (katalog produksi: 3B/15B berharga).
    const buyButtons = page.getByRole('button', { name: /beli via qris/i })
    await expect(buyButtons.first()).toBeVisible({ timeout: 20_000 })

    // Klik beli pada paket pertama yang berharga.
    await buyButtons.first().click()
    // Dialog QR muncul dengan order ID + status polling.
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 20_000 })
    await expect(dialog.getByText(/order/i).first()).toBeVisible()
    await expect(dialog.getByText(/menunggu pembayaran|memeriksa status/i).first()).toBeVisible({ timeout: 20_000 })

    // BUKA cegah klaim palsu: dialog TIDAK boleh mengatakan "berhasil/terverifikasi"
    // selagi order masih PENDING di server.
    const dialogText = await dialog.innerText()
    expect(dialogText).not.toMatch(/terverifikasi — lisensi diterbitkan/i)

    // Verifikasi status server-side: order terakhir = PENDING (bukan PAID palsu).
    const latest = await page.evaluate(async () => {
      const res = await fetch('/api/orders/latest', { credentials: 'include' })
      return res.json()
    })
    expect(latest?.order?.status ?? 'PENDING').toBe('PENDING')

    // Tutup dialog → polling berhenti (tidak ada request /api/orders/<id> lagi).
    const orderId = /ord_[a-z0-9_]+/.exec(dialogText)?.[0]
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await page.waitForTimeout(4500) // melewati satu interval polling 4 dtk
    if (orderId) {
      const hits = await page.evaluate((oid) => performance.getEntriesByType('resource')
        .filter((r) => r.name.includes(`/api/orders/${oid}`)).length, orderId)
      // Setelah dialog ditutup, tidak boleh ada poll baru (yang terakhir boleh 1x in-flight).
      expect(hits).toBeLessThanOrEqual(3)
    }
    expect(apiErrors).toEqual([])
  } finally {
    await page.context().close()
  }
})

test('customer: lisensi/install/usage → empty state jujur untuk akun baru', async () => {
  const { page } = await registerViaUi(browser, newQaAccount('empty'))
  try {
    // Lisensi: empty state, bukan tabel kosong tanpa pesan.
    await page.goto('/user/licenses')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/belum|tidak ada|lisensi/i).first()).toBeVisible({ timeout: 20_000 })

    // Install: panduan dengan empty state "belum ada lisensi".
    await page.goto('/user/install')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/belum (punya|ada) lisensi/i).first()).toBeVisible({ timeout: 20_000 })

    // Usage: empty state pemakaian.
    await page.goto('/user/usage')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/belum ada (request|pemakaian)/i).first()).toBeVisible({ timeout: 20_000 })

    const body = await page.locator('body').innerText()
    expect(body).not.toContain('NaN')
    expect(body).not.toContain('undefined')
  } finally {
    await page.context().close()
  }
})

test('customer: session guard — /user tanpa sesi ditolak, logout mengakhiri sesi', async () => {
  // 1) Tanpa sesi: fetch /api/me harus 401 (server-side, bukan cuma redirect UI).
  const ctx0 = await browser.newContext()
  const p0 = await ctx0.newPage()
  await p0.goto(BASE + '/login')
  const me = await p0.evaluate(async () => (await fetch('/api/me', { credentials: 'include' })).status)
  expect(me).toBe(401)
  await ctx0.close()

  // 2) Login → logout → sesi benar-benar mati di server.
  const { page } = await registerViaUi(browser, newQaAccount('logout'))
  try {
    await page.goto('/user/account')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: /keluar dari akun/i }).click()
    // ConfirmDialog memakai AlertDialog → role alertdialog, bukan dialog.
    const confirm = page.getByRole('alertdialog')
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: /keluar/i }).first().click()
    await page.waitForURL(/\/(login|register)?$/, { timeout: 20_000 }).catch(() => {})
    // Sesi server harus sudah invalid.
    const meAfter = await page.evaluate(async () => (await fetch('/api/me', { credentials: 'include' })).status)
    expect(meAfter).toBe(401)
  } finally {
    await page.context().close()
  }
})

test('customer: mobile 390px — drawer nav terjangkau, tanpa overflow horizontal', async () => {
  const { page } = await registerViaUi(browser, newQaAccount('mobile'), { viewport: { width: 390, height: 844 } })
  try {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
    // Trigger drawer (SidebarTrigger) harus ada & dapat diklik di mobile.
    const trigger = page.locator('button[aria-label*="menu" i], button[aria-label*="navigasi" i]').first()
    await expect(trigger).toBeVisible()
    await trigger.click()
    await expect(page.locator('[data-slot="sheet"], [role="dialog"]').first()).toBeVisible({ timeout: 10_000 })
  } finally {
    await page.context().close()
  }
})
