import axios from 'axios'

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 20000,
})

// Admin token dari sessionStorage (kompatibel dgn gate existing: key 'adminToken')
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('adminToken')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export interface PlanSummary {
  key: string
  name: string
  amount: number
  currency: string
  expiresInDays: number
  quota: number | null
  features: string[]
  ai?: { enabled: boolean; quotaTokens: number | null }
}

export interface License {
  id: string
  planKey?: string | null
  customer?: string | null
  status?: string
  expiresAt?: string
  createdAt?: string
  grouterApiKey?: string
  token?: string
  [k: string]: unknown
}

export interface UsageRow {
  licenseId: string
  usedTokens?: number
  requestCount?: number
  quotaLimit?: number | null
  aiEnabled?: boolean
  [k: string]: unknown
}

export interface Me {
  account: { id: string; name: string; email: string }
  licenses: License[]
  usage: UsageRow[]
}

export async function fetchMe(): Promise<Me> {
  const { data } = await api.get<Me>('/me')
  return data
}

export async function fetchPlans(): Promise<{ plans: PlanSummary[] }> {
  const { data } = await api.get('/plans')
  return data
}

export async function fetchAdminStats() {
  const { data } = await api.get('/admin/stats')
  return data
}

export async function fetchAdminLicenses(): Promise<{ licenses: License[] }> {
  const { data } = await api.get('/admin/licenses')
  return data
}

export async function issueLicense(payload: {
  customer?: string
  planKey?: string | null
  expiresInDays?: number | null
}) {
  const { data } = await api.post('/admin/licenses', payload)
  return data
}

export async function revokeLicense(licenseId: string) {
  const { data } = await api.post(`/admin/licenses/${encodeURIComponent(licenseId)}/revoke`)
  return data
}

export async function fetchAdminOrders(limit = 100) {
  const { data } = await api.get(`/admin/orders?limit=${limit}`)
  return data as { orders: Record<string, unknown>[]; total: number; limit: number }
}

// Riwayat order milik akun yang sedang login (session-scoped, read-only).
export async function fetchMyOrders() {
  const { data } = await api.get('/orders')
  return data as { orders: Record<string, unknown>[]; total: number }
}

export async function settleOrder(orderId: string) {
  const { data } = await api.post(`/admin/orders/${encodeURIComponent(orderId)}/settle`)
  return data as { ok: boolean; licenseId: string | null }
}

export async function fetchLedger(params: {
  customer?: string
  status?: string
  model?: string
  licenseId?: string
  limit?: number
  offset?: number
}) {
  const p = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  })
  const { data } = await api.get(`/admin/ledger?${p.toString()}`)
  return data as { records: Record<string, unknown>[]; total: number; limit: number; offset: number }
}

export async function fetchInfraUsage() {
  const { data } = await api.get('/admin/usage')
  return data
}

export async function fetchAdminSettings() {
  const { data } = await api.get('/admin/settings')
  return data
}

export async function patchAdminSettings(payload: unknown) {
  const { data } = await api.patch('/admin/settings', payload)
  return data
}

export async function fetchHealth() {
  const { data } = await api.get('/health')
  return data
}

export function formatIDR(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n)
}

export function fmtDate(iso: string | number | null | undefined): string {
  if (iso === null || iso === undefined || iso === '') return '—'
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return String(iso)
  }
}
