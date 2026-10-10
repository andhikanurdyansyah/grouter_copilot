/**
 * E2E ADMIN — gate tanpa token ditolak; autentikasi membuka semua halaman;
 * issue lisensi (token sekali-lihat) → cek API; revoke; orders/ledger/usage/
 * settings read-only; isolasi & proteksi token.
 *
 * Identitas lisensi yang dibuat memakai penanda QA eksplisit dan TIDAK
 * terhubung ke akun customer nyata (accountId null, nama QA-E2E …).
 */
import { test, expect } from 'playwright/test'
import { newQaAccount, registerViaUi, loginAdmin, launch, adminToken, BASE } from '../helpers.mjs'

let browser

test.beforeAll(async () => {
  browser = await launch()
})

test.afterAll(async () => {
  await browser?.close()
})

test('admin: tanpa token → gate menampilkan form, API menolak 401', async () => {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  try {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')
    // UX gate: form token (bukan dashboard).
    await expect(page.locator('input[type=password], input[name=token]').first()).toBeVisible({ timeout: 15_000 })
    // Server-side: semua API admin menolak tanpa Bearer.
    const codes = await page.evaluate(async () => {
      const out = []
      for (const p of ['/api/admin/stats', '/api/admin/licenses', '/api/admin/orders', '/api/admin/ledger']) {
        out.push((await fetch(p, { credentials: 'include' })).status)
      }
      return out
    })
    expect(codes).toEqual([401, 401, 401, 401])
  } finally {
    await ctx.close()
  }
})

test('admin: token salah → ditolak, token benar → semua halaman terbuka', async () => {
  const { page, errors } = await loginAdmin(browser)
  try {
    // Dashboard overview render.
    await expect(page.locator('body')).not.toContainText('undefined')
    // Semua rute admin render tanpa pageerror.
    for (const r of ['licenses', 'packages', 'orders', 'ledger', 'usage', 'settings']) {
      await page.goto('/admin/' + r)
      await page.waitForLoadState('networkidle')
      const body = await page.locator('body').innerText()
      expect(body, 'rute ' + r).not.toContain('NaN')
      expect(errors, 'rute ' + r).toEqual([])
    }
    // Token tidak pernah muncul di DOM (hanya sessionStorage).
    const bodyAll = await page.locator('body').innerText()
    expect(bodyAll).not.toContain(adminToken())
  } finally {
    await page.context().close()
  }
})

test('admin: issue lisensi → token sekali-lihat → tidak bocor di list/API → revoke', async () => {
  const { page } = await loginAdmin(browser)
  const stamp = Date.now().toString(36)
  let licenseId = null
  try {
    await page.goto('/admin/licenses')
    await page.waitForLoadState('networkidle')

    // Buka dialog terbitkan.
    await page.getByRole('button', { name: /terbitkan lisensi/i }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.locator('#issue-customer').fill('QA-E2E ' + stamp)
    await dialog.getByRole('button', { name: /^terbitkan$/i }).click()

    // Panel token sekali-lihat muncul dengan peringatan + tombol salin.
    await expect(dialog.getByText(/sekali-lihat|tidak dapat dilihat kembali/i).first()).toBeVisible({ timeout: 20_000 })
    const tokenText = await dialog.locator('#issued-token').innerText()
    expect(tokenText.length).toBeGreaterThan(20)
    expect(tokenText).toMatch(/^eyJ|eyJhbGciOi/) // JWT lisensi bertanda tangan
    licenseId = /lic_[a-z0-9_]+/.exec(await dialog.innerText())?.[0] ?? null

    // Tutup dialog → token HILANG dari DOM (sekali-lihat).
    await dialog.getByRole('button', { name: /selesai/i }).click()
    await expect(dialog).not.toBeVisible()
    const bodyAfter = await page.locator('body').innerText()
    expect(bodyAfter).not.toContain(tokenText)

    // List admin tidak pernah memuat token (kontrak server).
    const list = await page.evaluate(async () => (await (await fetch('/api/admin/licenses', { headers: { authorization: 'Bearer ' + sessionStorage.getItem('adminToken') } })).json()))
    expect(JSON.stringify(list)).not.toContain(tokenText)

    // Revoke lisensi QA (isolated — bukan customer nyata).
    if (licenseId) {
      const revoked = await page.evaluate(async (lid) => {
        const res = await fetch(`/api/admin/licenses/${encodeURIComponent(lid)}/revoke`, {
          method: 'POST',
          headers: { authorization: 'Bearer ' + sessionStorage.getItem('adminToken') },
        })
        return res.status
      }, licenseId)
      expect(revoked).toBe(200)
    }
  } finally {
    await page.context().close()
  }
})

test('admin: orders, ledger, usage, settings — data nyata, tanpa bocor kredensial', async () => {
  const { page } = await loginAdmin(browser)
  try {
    // Orders: order riil tampil (PENDING dari QA sandbox), tanpa signature/QR raw.
    await page.goto('/admin/orders')
    await page.waitForLoadState('networkidle')
    const body = await page.locator('body').innerText()
    expect(body).not.toMatch(/signature|qr_image/i)

    // Ledger: kolom & pagination, tanpa prompt/completion body.
    await page.goto('/admin/ledger')
    await page.waitForLoadState('networkidle')
    expect(await page.locator('body').innerText()).not.toMatch(/"messages"|systemPrompt/)

    // Usage provider & settings: render + tanpa API key.
    for (const r of ['usage', 'settings']) {
      await page.goto('/admin/' + r)
      await page.waitForLoadState('networkidle')
      const t = await page.locator('body').innerText()
      expect(t).not.toMatch(/gRouter-[A-Za-z0-9_-]{20,}/)
    }
    // Settings GET masked: respons API tidak mengandung apiKey jelas.
    // (Server mem-mask credential: "••••" + 4 char terakhir — ini AMAN dan
    // memang by-design; yang dilarang adalah nilai penuh 8+ char.)
    const settings = await page.evaluate(async () => (await (await fetch('/api/admin/settings', { headers: { authorization: 'Bearer ' + sessionStorage.getItem('adminToken') } })).json()))
    const apiKeyValue = settings?.settings?.payment?.apiKey
    // Masked (berisi bullet) ATAU tidak ada — tidak boleh plaintext panjang.
    if (apiKeyValue) {
      expect(apiKeyValue).toMatch(/•/)
      expect(String(apiKeyValue).length).toBeLessThanOrEqual(8)
    }
  } finally {
    await page.context().close()
  }
})

test('security: isolasi antar-akun & pelindungan token (customer vs customer, customer vs admin)', async () => {
  // Customer A beli (order PENDING), Customer B mencoba baca order A → 404.
  const a = await registerViaUi(browser, newQaAccount('isoA'))
  const b = await registerViaUi(browser, newQaAccount('isoB'))
  try {
    const pa = a.page
    await pa.goto('/user/orders')
    await pa.waitForLoadState('networkidle')
    // Buat order via API session A.
    const created = await pa.evaluate(async () => {
      const plans = (await (await fetch('/api/plans')).json()).plans.filter((p) => p.amount > 0)
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ packageKey: plans[0].key }),
      })
      return res.json()
    })
    const orderId = created?.order?.id
    expect(orderId).toBeTruthy()

    const pb = b.page
    const status404 = await pb.evaluate(async (oid) => (await fetch(`/api/orders/${oid}`, { credentials: 'include' })).status, orderId)
    expect(status404).toBe(404)

    // /api/me B tidak memuat lisensi A (memang akun beda & A belum punya lisensi).
    const meB = await pb.evaluate(async () => (await fetch('/api/me', { credentials: 'include' })).json())
    expect(meB.licenses).toEqual([])

    // Customer B memanggil API admin → 401.
    const adminAsCustomer = await pb.evaluate(async () => (await fetch('/api/admin/stats', { credentials: 'include' })).status)
    expect(adminAsCustomer).toBe(401)

    // Cost integrity: body amount tidak dipercaya.
    const cheat = await pb.evaluate(async () => {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ packageKey: 'quota-3b-90d', amount: 1 }),
      })
      return res.status
    })
    expect(cheat).toBe(400)
  } finally {
    await a.ctx.close()
    await b.ctx.close()
  }
})

test('customer tidak bisa mengakses rute admin via UI', async () => {
  const { page } = await registerViaUi(browser, newQaAccount('ui-admin'))
  try {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')
    // Tanpa token admin di sessionStorage → gate form, bukan dashboard.
    await expect(page.locator('input[type=password], input[name=token]').first()).toBeVisible({ timeout: 15_000 })
  } finally {
    await page.context().close()
  }
})
