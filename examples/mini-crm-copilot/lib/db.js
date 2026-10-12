// lib/db.js — lapisan data JSON untuk Mini CRM demo (lihat CONTRACT.md)
// Sumber kebenaran: data/crm.json (di-generate deterministik oleh seed.js, gitignored).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateCRM, DATA_FILE, DATA_DIR } from '../seed.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let state = null

export function load() {
  if (!state) {
    if (!fs.existsSync(DATA_FILE)) {
      // Data belum di-seed -> generate deterministik saat pertama kali dipakai (dev convenience).
      return resetData()
    }
    state = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
  }
  return state
}

export function saveData() {
  if (!state) return
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2))
}

// Re-seed deterministik (dipakai POST /api/reset dan `node seed.js`)
export function resetData() {
  state = generateCRM()
  saveData()
  return state
}

const byNewest = (key) => (a, b) => (a[key] < b[key] ? 1 : a[key] > b[key] ? -1 : 0)

/**
 * GET /api/customers?q=&status=
 * q mencari di name/company/email/phone DAN catatan aktivitas customer
 * (dipakai use case Copilot: temukan customer dengan keluhan delivery).
 */
export function listCustomers({ q, status } = {}) {
  const data = load()
  let rows = data.customers.slice()
  if (status) rows = rows.filter((c) => c.status === status)
  const needle = q ? String(q).trim().toLowerCase() : ''
  if (needle) {
    const notesByCustomer = new Map()
    for (const a of data.activities) {
      const arr = notesByCustomer.get(a.customerId)
      if (arr) arr.push(a.note)
      else notesByCustomer.set(a.customerId, [a.note])
    }
    rows = rows.filter((c) => {
      if ([c.name, c.company, c.email, c.phone].some((v) => String(v).toLowerCase().includes(needle))) return true
      return (notesByCustomer.get(c.id) || []).some((n) => n.toLowerCase().includes(needle))
    })
  }
  return rows
}

/** GET /api/customers/:id -> { customer, deals, activities } | null */
export function getCustomer(id) {
  const data = load()
  const customer = data.customers.find((c) => c.id === id)
  if (!customer) return null
  return {
    customer,
    deals: data.deals.filter((d) => d.customerId === id).sort(byNewest('createdAt')),
    activities: data.activities.filter((a) => a.customerId === id).sort(byNewest('at')),
  }
}

/** GET /api/leads?status= */
export function listLeads(status) {
  const data = load()
  let rows = data.leads.slice()
  if (status) rows = rows.filter((l) => l.status === status)
  return rows.sort(byNewest('createdAt'))
}

/** GET /api/deals?stage= */
export function listDeals(stage) {
  const data = load()
  let rows = data.deals.slice()
  if (stage) rows = rows.filter((d) => d.stage === stage)
  return rows.sort(byNewest('createdAt'))
}

/** GET /api/activities?limit= */
export function listActivities(limit) {
  const data = load()
  const rows = data.activities.slice().sort(byNewest('at'))
  const n = Number.isInteger(limit) && limit > 0 ? limit : rows.length
  return rows.slice(0, n)
}

/** POST /api/leads/:id/status -> lead | null */
export function updateLeadStatus(id, status) {
  const data = load()
  const lead = data.leads.find((l) => l.id === id)
  if (!lead) return null
  lead.status = status
  saveData()
  return lead
}

/** GET /api/overview — agregat sesuai CONTRACT (LOCKED shape) */
export function overview() {
  const data = load()
  const leadsByStatus = {}
  for (const l of data.leads) leadsByStatus[l.status] = (leadsByStatus[l.status] || 0) + 1
  const dealsByStage = {}
  for (const d of data.deals) dealsByStage[d.stage] = (dealsByStage[d.stage] || 0) + 1
  const openDealsList = data.deals.filter((d) => d.stage !== 'won' && d.stage !== 'lost')
  return {
    totalCustomers: data.customers.length,
    activeCustomers: data.customers.filter((c) => c.status === 'active').length,
    openDeals: openDealsList.length,
    openValue: openDealsList.reduce((sum, d) => sum + d.value, 0),
    leadsByStatus,
    dealsByStage,
  }
}

export { DATA_FILE, DATA_DIR }
