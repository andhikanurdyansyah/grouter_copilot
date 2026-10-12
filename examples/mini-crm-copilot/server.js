// server.js — Mini CRM demo untuk acceptance testing gRouter Copilot (lihat CONTRACT.md)
// Kerangka CRM murni: routing + validasi + static. TIDAK ada logika Copilot di sini.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import {
  listCustomers, getCustomer, listLeads, listDeals,
  listActivities, overview, updateLeadStatus, resetData, load,
} from './lib/db.js'
import { copilotRouter } from './routes/copilot.js' // copilot: route ditambahkan oleh integrasi

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const DEFAULT_PORT = 4602

// ---- Validasi (LOCKED schema) ----
export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'unqualified', 'lost']
export const CUSTOMER_STATUSES = ['active', 'churned', 'prospect']
export const SEGMENTS = ['retail', 'smb', 'enterprise']
export const DEAL_STAGES = ['discovery', 'proposal', 'negotiation', 'won', 'lost']
export const ACTIVITY_TYPES = ['call', 'email', 'meeting', 'note']

// copilot: route ditambahkan oleh integrasi (agent paralel) — JANGAN hapus slot ini.
// POST /api/copilot/chat  -> gatewayChat({ runtime, gatewayUrl: env.GROUTER_GATEWAY_URL, ... })
// GET  /api/copilot/health -> getCopilotHealth(copilot, env.GROUTER_LICENSE)

const app = express()
app.use(express.json({ limit: '256kb' }))
app.use('/api/copilot', copilotRouter())

// ---- API CRM (LOCKED) ----

// GET /api/customers?q=&status= -> { customers }
app.get('/api/customers', (req, res) => {
  const { q, status } = req.query
  if (status && !CUSTOMER_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status tidak valid. Gunakan salah satu dari: ${CUSTOMER_STATUSES.join(', ')}` })
  }
  return res.json({ customers: listCustomers({ q, status }) })
})

// GET /api/customers/:id -> { customer, deals, activities }
app.get('/api/customers/:id', (req, res) => {
  const row = getCustomer(req.params.id)
  if (!row) return res.status(404).json({ error: `Customer ${req.params.id} tidak ditemukan` })
  return res.json(row)
})

// GET /api/leads?status=
app.get('/api/leads', (req, res) => {
  const { status } = req.query
  if (status && !LEAD_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status tidak valid. Gunakan salah satu dari: ${LEAD_STATUSES.join(', ')}` })
  }
  return res.json({ leads: listLeads(status) })
})

// GET /api/deals?stage=
app.get('/api/deals', (req, res) => {
  const { stage } = req.query
  if (stage && !DEAL_STAGES.includes(stage)) {
    return res.status(400).json({ error: `stage tidak valid. Gunakan salah satu dari: ${DEAL_STAGES.join(', ')}` })
  }
  return res.json({ deals: listDeals(stage) })
})

// GET /api/activities?limit=
app.get('/api/activities', (req, res) => {
  const raw = req.query.limit
  let limit
  if (raw !== undefined) {
    limit = Number(raw)
    if (!Number.isInteger(limit) || limit <= 0) {
      return res.status(400).json({ error: 'limit harus integer positif' })
    }
  }
  return res.json({ activities: listActivities(limit) })
})

// GET /api/overview -> { totalCustomers, activeCustomers, openDeals, openValue, leadsByStatus, dealsByStage }
app.get('/api/overview', (_req, res) => {
  res.json(overview())
})

// POST /api/leads/:id/status { status } — SATU-SATUNYA write endpoint CRM
app.post('/api/leads/:id/status', (req, res) => {
  const { status } = req.body ?? {}
  if (typeof status !== 'string' || !LEAD_STATUSES.includes(status)) {
    return res.status(400).json({ error: `body { status } wajib, salah satu dari: ${LEAD_STATUSES.join(', ')}` })
  }
  const lead = updateLeadStatus(req.params.id, status)
  if (!lead) return res.status(404).json({ error: `Lead ${req.params.id} tidak ditemukan` })
  return res.json({ lead })
})

// POST /api/reset — dev only, re-seed deterministik
app.post('/api/reset', (_req, res) => {
  const data = resetData()
  return res.json({ ok: true, counts: { customers: data.customers.length, leads: data.leads.length, deals: data.deals.length, activities: data.activities.length } })
})

// 404 JSON untuk path /api yang tidak dikenal
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan' })
})

// Static frontend
app.use(express.static(path.join(__dirname, 'public')))

// Error handler: body JSON rusak / tak ter-parse -> 400 JSON (bukan HTML default Express)
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ error: 'Body JSON tidak valid' })
  }
  console.error(err)
  return res.status(500).json({ error: 'Kesalahan server internal' })
})

// ---- Export + start (dipakai test & integrasi Copilot) ----
export function startServer({ port = process.env.DEMO_PORT || DEFAULT_PORT } = {}) {
  load() // pastikan data ada
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => resolve(server))
    server.on('error', reject)
  })
}

export { app }

// main guard — hanya listen bila dieksekusi langsung (npm start / node server.js)
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const port = Number(process.env.DEMO_PORT) || DEFAULT_PORT
  startServer({ port })
    .then(() => console.log(`Mini CRM demo berjalan di http://localhost:${port}`))
    .catch((err) => {
      console.error('Gagal start server:', err.message)
      process.exit(1)
    })
}
