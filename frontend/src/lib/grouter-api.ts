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
  revokedAt?: string | number | null
  expiresAt?: string | number | null
  createdAt?: string | number | null
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
}) {
  // Kontrak: POST /api/admin/licenses { customer, planKey? } — entitlement
  // (features/expiresInDays) resolved SERVER-SIDE dari katalog plan / license
  // defaults; body tidak pernah membawa entitlement. Server mengembalikan
  // { license, token }; token SINGKATANA dikembalikan SAAT penerbitan (tidak
  // pernah tersedia lagi setelahnya — /api/me dan list admin tidak
  // memuatnya). UI wajib menampilkannya sekali.
  const { data } = await api.post('/admin/licenses', payload)
  return data as {
    license: { id: string; customer?: string | null }
    token?: string
  }
}

export async function revokeLicense(licenseId: string) {
  const { data } = await api.post(
    `/admin/licenses/${encodeURIComponent(licenseId)}/revoke`
  )
  return data
}

export async function fetchAdminOrders(limit = 100) {
  const { data } = await api.get(`/admin/orders?limit=${limit}`)
  return data as {
    orders: Record<string, unknown>[]
    total: number
    limit: number
  }
}

// Riwayat order milik akun yang sedang login (session-scoped, read-only).
export async function fetchMyOrders() {
  const { data } = await api.get('/orders')
  return data as { orders: Record<string, unknown>[]; total: number }
}

export const fetchCustomerStatus = fetchMe
export const fetchCustomerOrders = fetchMyOrders
export async function fetchCustomerReceipt(orderId: string) {
  const { data } = await api.get(
    `/me/orders/${encodeURIComponent(orderId)}/receipt`
  )
  return data as {
    receipt: {
      orderId: string
      planName: string | null
      packageKey: string | null
      amount: number | null
      status: 'PAID'
      createdAt: number | string | null
      paidAt: number | string | null
      licenseReference: string
    }
  }
}

export async function downloadCustomerExport(
  kind: 'usage' | 'orders'
): Promise<void> {
  const response = await api.get(`/me/${kind}/export`, { responseType: 'blob' })
  const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${kind}-export.csv`
  link.click()
  // Let the browser finish consuming the download before releasing the blob URL.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
// Ledger milik akun yang sedang login (session-scoped, read-only).
export async function fetchMyLedger(limit = 50) {
  const { data } = await api.get(`/me/ledger?limit=${limit}`)
  return data as {
    records: Record<string, unknown>[]
    total: number
    limit: number
    offset: number
  }
}

export const fetchUsageHistory = async () => {
  // Agregasi REAL dari ledger milik akun (per request → per hari, 14 hari).
  const { records } = await fetchMyLedger(200)
  const byDay = new Map<string, number>()
  for (const r of records) {
    const createdAt = Number(r.createdAt ?? 0)
    if (!createdAt) continue
    const d = new Date(createdAt)
    const key = d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
    })
    const total = Number(
      r.totalTokens ?? Number(r.inputTokens ?? 0) + Number(r.outputTokens ?? 0)
    )
    byDay.set(key, (byDay.get(key) ?? 0) + (Number.isFinite(total) ? total : 0))
  }
  return Array.from(byDay.entries()).map(([date, tokens]) => ({ date, tokens }))
}

export async function settleOrder(orderId: string) {
  const { data } = await api.post(
    `/admin/orders/${encodeURIComponent(orderId)}/settle`
  )
  return data as { ok: boolean; licenseId: string | null }
}
export const verifyAndSettleOrder = settleOrder

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
  return data as {
    records: Record<string, unknown>[]
    total: number
    limit: number
    offset: number
  }
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

export interface AppNotification {
  id: string
  type: string
  title: string
  titleEn: string
  body: string
  bodyEn: string
  readAt: string | null
  createdAt: number | string
  emailStatus?: string | null
  emailedAt?: string | number | null
  emailAttempts?: number
  linkKind?: string | null
  linkId?: string | null
}

export interface NotificationsResponse {
  notifications: AppNotification[]
  unread: number
  total?: number
}

export async function fetchMyNotifications(
  limit = 20
): Promise<NotificationsResponse> {
  const { data } = await api.get(`/me/notifications?limit=${limit}`)
  return data as NotificationsResponse
}

export async function markMyNotificationRead(id: string) {
  const { data } = await api.post(
    `/me/notifications/${encodeURIComponent(id)}/read`
  )
  return data
}

export async function markAllMyNotificationsRead() {
  const { data } = await api.post('/me/notifications/read-all')
  return data
}

export async function fetchAdminNotifications(
  limit = 20
): Promise<NotificationsResponse> {
  const { data } = await api.get(`/admin/notifications?limit=${limit}`)
  return data as NotificationsResponse
}

export async function markAdminNotificationRead(id: string) {
  const { data } = await api.post(
    `/admin/notifications/${encodeURIComponent(id)}/read`
  )
  return data
}

export async function markAllAdminNotificationsRead() {
  const { data } = await api.post('/admin/notifications/read-all')
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
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
