// test/integration.test.js — uji integrasi API CRM (node --test, port acak)
// Jalankan: npm test  (atau: node --test test/)
// Catatan CONTRACT: uji skills Copilot offline ada di bagian integrasi (dikerjakan agent paralel).
import test from 'node:test'
import assert from 'node:assert/strict'
import { app, startServer, LEAD_STATUSES } from '../server.js'
import { overview, resetData } from '../lib/db.js'
import { generateCRM } from '../seed.js'

// ---- helper: server pada port acak per test-file ----
const server = await startServer({ port: 0 }) // port 0 => OS pilih port acak bebas
const { port } = server.address()
const BASE = `http://127.0.0.1:${port}`

async function get(path) {
  const res = await fetch(`${BASE}${path}`)
  let body = null
  try { body = await res.json() } catch { /* ignore */ }
  return { status: res.status, body }
}
async function post(path, payload) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  })
  let body = null
  try { body = await res.json() } catch { /* ignore */ }
  return { status: res.status, body }
}

// Pastikan state data deterministik sebelum assertion angka seed.
// (POST /api/reset dipanggil ulang di test "reset idempotent" — di sana dibandingkan 2 kali reset.)
resetData()
const seed = generateCRM()

test('GET /api/overview — angka sesuai seed (LOCKED counts)', async () => {
  const { status, body } = await get('/api/overview')
  assert.equal(status, 200)
  assert.equal(body.totalCustomers, 42)
  assert.equal(body.activeCustomers, seed.customers.filter((c) => c.status === 'active').length)
  const open = seed.deals.filter((d) => d.stage !== 'won' && d.stage !== 'lost')
  assert.equal(body.openDeals, open.length)
  assert.equal(body.openValue, open.reduce((s, d) => s + d.value, 0))
  assert.deepEqual(body.leadsByStatus, seed.leads.reduce((m, l) => ({ ...m, [l.status]: (m[l.status] || 0) + 1 }), {}))
  assert.deepEqual(body.dealsByStage, seed.deals.reduce((m, d) => ({ ...m, [d.stage]: (m[d.stage] || 0) + 1 }), {}))
  // proporsi seed wajib sesuai mandat
  assert.equal(seed.leads.length, 26)
  assert.equal(seed.deals.length, 14)
  assert.ok(seed.activities.length >= 65, `activities >= 65, dapat ${seed.activities.length}`)
  const stageCounts = body.dealsByStage
  assert.equal(stageCounts.discovery, 4)
  assert.equal(stageCounts.proposal, 4)
  assert.equal(stageCounts.negotiation, 3)
  assert.equal(stageCounts.won, 2)
  assert.equal(stageCounts.lost, 1)
})

test('seed deterministik: 42 customers, deal IDR 5jt-250jt, expectedClose sebagian di bulan berjalan', () => {
  assert.equal(seed.customers.length, 42)
  for (const d of seed.deals) {
    assert.ok(d.value >= 5_000_000 && d.value <= 250_000_000, `value dalam rentang: ${d.value}`)
    assert.ok(!Number.isNaN(Date.parse(d.expectedClose)))
  }
  const now = new Date()
  const openDeals = seed.deals.filter((d) => !['won', 'lost'].includes(d.stage))
  const inCurrentMonth = openDeals.filter((d) => {
    const dt = new Date(d.expectedClose + 'T00:00:00Z')
    return dt.getUTCFullYear() === now.getUTCFullYear() && dt.getUTCMonth() === now.getUTCMonth()
  })
  assert.ok(inCurrentMonth.length >= 2, `minimal 2 deal terbuka close bulan ini, dapat ${inCurrentMonth.length}`)
  // keluhan delivery harus ada untuk use case pencarian Copilot
  const complaints = seed.activities.filter((a) => /terlambat|keterlambatan|delivery delay/i.test(a.note))
  assert.ok(complaints.length >= 5, `keluhan delivery >= 5, dapat ${complaints.length}`)
  assert.ok(complaints.every((a) => a.customerId.startsWith('cus_')))
})

test('GET /api/customers?q= — search menemukan customer berdasarkan keluhan delivery di catatan aktivitas', async () => {
  const seedComplaint = seed.activities.find((a) => /terlambat|keterlambatan/i.test(a.note))
  assert.ok(seedComplaint, 'seed harus memuat keluhan delivery')
  const keyword = seedComplaint.note.toLowerCase().includes('pengiriman')
    ? 'pengiriman'
    : seedComplaint.note.toLowerCase().includes('terlambat') ? 'terlambat' : 'delivery'
  const { status, body } = await get(`/api/customers?q=${encodeURIComponent(keyword)}`)
  assert.equal(status, 200)
  assert.ok(body.customers.length >= 1, `keyword "${keyword}" harus menemukan customer`)
  const expectedIds = new Set(seed.activities.filter((a) => a.note.toLowerCase().includes(keyword)).map((a) => a.customerId))
  for (const c of body.customers) assert.ok(expectedIds.has(c.id), `${c.id} punya aktivitas mengandung "${keyword}"`)
})

test('GET /api/customers?q=&status= — kombinasi search + filter status', async () => {
  const { status, body } = await get('/api/customers?q=a&status=active')
  assert.equal(status, 200)
  assert.ok(body.customers.length >= 1)
  assert.ok(body.customers.every((c) => c.status === 'active'))
  const { status: s2, body: b2 } = await get('/api/customers?status=churned')
  assert.equal(s2, 200)
  assert.ok(b2.customers.length >= 1)
  assert.ok(b2.customers.every((c) => c.status === 'churned'))
})

test('GET /api/customers/:id — detail join deals+activities, 404 untuk id tak ada', async () => {
  const seedDealCustomer = seed.deals[0].customerId
  const { status, body } = await get(`/api/customers/${seedDealCustomer}`)
  assert.equal(status, 200)
  assert.equal(body.customer.id, seedDealCustomer)
  assert.ok(body.deals.every((d) => d.customerId === seedDealCustomer))
  assert.ok(body.activities.every((a) => a.customerId === seedDealCustomer))
  assert.ok(body.deals.length >= 1, 'customer pertama deal harus punya deal')

  const missing = await get('/api/customers/cus_999')
  assert.equal(missing.status, 404)
  assert.ok(missing.body.error)
})

test('GET /api/leads?status= — filter status valid', async () => {
  const { status, body } = await get('/api/leads?status=new')
  assert.equal(status, 200)
  assert.ok(body.leads.length >= 1)
  assert.ok(body.leads.every((l) => l.status === 'new'))
  assert.equal(body.leads.length, seed.leads.filter((l) => l.status === 'new').length)
  const all = await get('/api/leads')
  assert.equal(all.body.leads.length, 26)
})

test('GET /api/deals?stage= — filter stage valid (discovery=4)', async () => {
  const { status, body } = await get('/api/deals?stage=discovery')
  assert.equal(status, 200)
  assert.equal(body.deals.length, 4)
  assert.ok(body.deals.every((d) => d.stage === 'discovery'))
  const won = await get('/api/deals?stage=won')
  assert.equal(won.body.deals.length, 2)
})

test('GET /api/activities?limit= — limit dibatasi', async () => {
  const { status, body } = await get('/api/activities?limit=5')
  assert.equal(status, 200)
  assert.equal(body.activities.length, 5)
  const bad = await get('/api/activities?limit=abc')
  assert.equal(bad.status, 400)
})

test('GET /api/customers?status=bogus — 400 untuk filter invalid', async () => {
  const { status, body } = await get('/api/customers?status=bogus')
  assert.equal(status, 400)
  assert.ok(body.error)
})

test('POST /api/leads/:id/status — valid mengubah status dan persist', async () => {
  const lead = seed.leads.find((l) => l.status === 'new')
  const { status, body } = await post(`/api/leads/${lead.id}/status`, { status: 'qualified' })
  assert.equal(status, 200)
  assert.equal(body.lead.id, lead.id)
  assert.equal(body.lead.status, 'qualified')
  // verifikasi persist via read-back
  const after = await get('/api/leads?status=qualified')
  assert.ok(after.body.leads.some((l) => l.id === lead.id))
})

test('POST /api/leads/:id/status — 400 body invalid, 404 id tak ada', async () => {
  const lead = seed.leads[0]
  for (const bad of [{ status: 'naik' }, {}, { status: 123 }, null]) {
    const res = await post(`/api/leads/${lead.id}/status`, bad)
    assert.equal(res.status, 400, JSON.stringify(bad))
    assert.ok(res.body.error)
  }
  const missing = await post('/api/leads/lead_999/status', { status: LEAD_STATUSES[0] })
  assert.equal(missing.status, 404)
  assert.ok(missing.body.error)
})

test('POST /api/reset — idempotent: dua reset berurutan menghasilkan data identik', async () => {
  const r1 = await post('/api/reset')
  assert.equal(r1.status, 200)
  assert.deepEqual(r1.body.counts, { customers: 42, leads: 26, deals: 14, activities: seed.activities.length })
  const snap1 = JSON.stringify(overview())
  const leads1 = (await get('/api/leads')).body.leads

  // ubah state via satu-satunya write endpoint, lalu reset harus mengembalikan
  const lead = (await get('/api/leads')).body.leads[0]
  await post(`/api/leads/${lead.id}/status`, { status: 'lost' })
  const r2 = await post('/api/reset')
  assert.equal(r2.status, 200)
  const snap2 = JSON.stringify(overview())
  const leads2 = (await get('/api/leads')).body.leads

  assert.equal(snap2, snap1, 'overview setelah reset kedua identik dengan reset pertama')
  assert.deepEqual(leads2, leads1, 'daftar lead setelah reset identik (idempotent)')
})

test('404 JSON untuk endpoint /api tidak dikenal', async () => {
  const { status, body } = await get('/api/tidak-ada')
  assert.equal(status, 404)
  assert.ok(body.error)
})

test.after(() => {
  server.close()
})
