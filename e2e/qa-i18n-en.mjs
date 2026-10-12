
import { chromium } from 'playwright'
import fs from 'node:fs'
const env = fs.readFileSync('/home/ubuntu/grouter_copilot/server/.env', 'utf8')
const ADMIN_TOKEN = (env.match(/^ADMIN_TOKEN=(.+)$/m) || [])[1]?.trim()
const exe = '/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell'
const BASE = 'http://localhost:4601'

// Heuristik kata Indonesia umum di UI (kata utuh, case-insensitive utk beberapa)
const ID_PATTERNS = [
  /\b(Belum|Semua|Simpan|Batal|Terbitkan|Gagal|Kuota|Hapus|Ubah|Cari|Pesanan|Lisensi baru|Paket|Ringkasan|Penggunaan|Tagihan|Beranda|Pengaturan|Masuk|Keluar|Daftar|Buka|Tutup|Sedang|Perlu tindakan|Permintaan|Layanan|Kesehatan|Bantuan|Pemberitahuan|dari|dengan|untuk|yang|tidak|dalam|hari|bulan|tahun|menit|detik|jam)\b/,
]

const ADMIN_PAGES = [
  ['/admin', 'overview'], ['/admin/licenses', 'licenses'], ['/admin/orders', 'orders'],
  ['/admin/ledger', 'ledger'], ['/admin/packages', 'packages'], ['/admin/settings', 'settings'],
  ['/admin/account', 'account'],
]
const USER_PAGES = [
  ['/user', 'user-overview'], ['/user/licenses', 'user-licenses'], ['/user/install', 'install'],
  ['/user/usage', 'usage'], ['/user/account', 'user-account'],
]

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const leaks = []

async function auditPage(page, url, name) {
  await page.goto(BASE + url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  const text = await page.locator('body').innerText()
  const found = new Set()
  for (const re of ID_PATTERNS) {
    for (const m of text.matchAll(new RegExp(re.source, 'gi'))) {
      // context: ambil sekitar 40 char
      const i = m.index
      found.add(text.slice(Math.max(0, i - 25), i + 25).replace(/\n/g, ' | '))
    }
  }
  if (found.size > 0) {
    leaks.push({ page: name, url, samples: [...found].slice(0, 6) })
  }
}

// Admin EN
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const p = await ctx.newPage()
  await p.addInitScript(() => localStorage.setItem('grouter_lang', 'en'))
  await p.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' })
  await p.locator('input[type=password], input[name=token]').first().fill(ADMIN_TOKEN)
  await p.keyboard.press('Enter')
  await p.waitForTimeout(900)
  for (const [url, name] of ADMIN_PAGES) await auditPage(p, url, name)
  await p.screenshot({ path: '/home/ubuntu/grouter_copilot/.hermes/qa-screens/en-admin-overview.png' })
  await ctx.close()
}
// Customer EN
{
  const stamp = Date.now().toString(36)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const p = await ctx.newPage()
  await p.addInitScript(() => localStorage.setItem('grouter_lang', 'en'))
  await p.goto(BASE + '/register', { waitUntil: 'networkidle' })
  await p.locator('#suName').fill(`QA i18n ${stamp}`)
  await p.locator('#suEmail').fill(`qa.i18n.${stamp}@gmail.com`)
  await p.locator('#suPassword').fill(`Gr0ut3r-${stamp}-Zq!`)
  await p.locator('#registerBtn').click()
  await p.waitForURL('**/user', { timeout: 15000 })
  for (const [url, name] of USER_PAGES) await auditPage(p, url, name)
  await ctx.close()
}
await browser.close()

console.log('=== i18n EN AUDIT (ID-leak heuristik) ===')
if (leaks.length === 0) console.log('BERSIH: tidak ada kebocoran terdeteksi')
for (const l of leaks) {
  console.log(`\n[${l.page}] ${l.url}`)
  for (const s of l.samples) console.log('  …' + s.trim() + '…')
}
fs.writeFileSync('/home/ubuntu/grouter_copilot/.hermes/qa-screens/i18n-en-leaks.json', JSON.stringify(leaks, null, 1))
