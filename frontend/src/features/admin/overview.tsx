import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchAdminOrders, fetchAdminLicenses, fetchHealth, fetchLedger, fetchAdminStats } from '@/lib/grouter-api'
import { CheckCircle2, ClipboardList, Database, KeyRound, Radio, ShieldCheck } from 'lucide-react'
import { useLanguage } from '@/context/language-provider'
import { Button } from '@/components/ui/button'
import { IssueLicenseModal } from './components/issue-license-modal'

const mono = 'font-mono tabular-nums'
export function AdminOverview() {
  const { language } = useLanguage(); const isId = language === 'id'
  const orders = useQuery({ queryKey: ['admin-orders'], queryFn: () => fetchAdminOrders(100) })
  const licenses = useQuery({ queryKey: ['admin-licenses'], queryFn: fetchAdminLicenses })
  const stats = useQuery({ queryKey: ['admin-stats'], queryFn: fetchAdminStats })
  const health = useQuery({ queryKey: ['health-measured'], queryFn: async () => { const start = performance.now(); const data = await fetchHealth(); return { ...data, latencyMs: Math.round(performance.now() - start) } }, refetchInterval: 60_000 })
  const ledger = useQuery({ queryKey: ['admin-ledger', 'overview'], queryFn: () => fetchLedger({ limit: 200 }) })
  const [range, setRange] = useState<7 | 30>(30)
  const [issueOpen, setIssueOpen] = useState(false)
  const [nowMs] = useState(() => Date.now())
  const records = (ledger.data?.records ?? []) as Array<{ status?: string; totalTokens?: number | null; inputTokens?: number | null; outputTokens?: number | null; createdAt?: number | null }>
  const days = useMemo(() => Array.from({ length: range }, (_, index) => { const d = new Date(nowMs - (range - 1 - index) * 86_400_000); const key = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }); const day = records.filter((r) => r.createdAt && new Date(r.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) === key); return { key, ok: day.filter((r) => r.status === 'ok').length, rejected: day.filter((r) => r.status !== 'ok').length } }), [records, range, nowMs])
  const max = Math.max(1, ...days.map((d) => d.ok + d.rejected))
  const orderRows = (orders.data as { orders?: Array<{ status?: string }> } | undefined)?.orders ?? []
  const licenseRows = licenses.data?.licenses ?? []
  const pending = orderRows.filter((o) => String(o.status).toUpperCase() === 'PENDING').length
  const active = licenseRows.filter((l) => !l.revokedAt && String(l.status ?? 'active') === 'active').length
  const tokens = records.reduce((sum, r) => sum + (r.totalTokens ?? (r.inputTokens ?? 0) + (r.outputTokens ?? 0)), 0)
  return <div className='dashboard-page space-y-8'>
    <header className='dashboard-header'><div><p className='eyebrow'>CONTROL PLANE / OPERATIONS</p><h1>{isId ? 'Pusat kendali operasional' : 'Operational control plane'}</h1><p className='lede'>{isId ? 'Pantau pembayaran, license, dan gateway dari data yang benar-benar tercatat.' : 'Monitor payments, licenses, and gateway activity from recorded data.'}</p></div><Button type='button' onClick={() => setIssueOpen(true)} className='dashboard-primary'><KeyRound className='size-4' />{isId ? 'Terbitkan license' : 'Issue license'}</Button></header>
    <section className='ops-strip'><div className='ops-health'><span className={health.data?.status === 'ok' ? 'health-dot' : 'health-dot health-dot--bad'} /><strong>{health.data?.status === 'ok' ? (isId ? 'Semua sistem merespons' : 'All systems responding') : (isId ? 'Status belum tersedia' : 'Status unavailable')}</strong><span className={mono}>{health.data?.latencyMs ?? '—'}ms</span></div><div className='ops-actions'><Link to='/admin/settings'><ShieldCheck className='size-4' />{isId ? 'Konfigurasi' : 'Configuration'}</Link><Link to='/admin/packages'><KeyRound className='size-4' />{isId ? 'Entitlement' : 'Entitlements'}</Link></div></section>
    <section className='dashboard-grid dashboard-grid--four'><article className='metric-panel metric-panel--lead'><div className='eyebrow'>PENDING ORDERS</div><div className='metric-number'>{pending}</div><p>{isId ? 'perlu verifikasi upstream' : 'awaiting upstream verification'}</p></article><article className='metric-panel'><div className='eyebrow'>ACTIVE LICENSES</div><div className='metric-number'>{active}</div><p>{isId ? 'tercatat di katalog' : 'recorded in catalogue'}</p></article><article className='metric-panel'><div className='eyebrow'>LEDGER REQUESTS</div><div className='metric-number'>{records.length}</div><p>{tokens.toLocaleString('id-ID')} tokens</p></article><article className='metric-panel'><div className='eyebrow'>INSTALLS</div><div className='metric-number'>{stats.data?.totalInstalls ?? '—'}</div><p>{isId ? 'heartbeat tercatat' : 'heartbeats recorded'}</p></article></section>
    <section className='dashboard-grid dashboard-grid--split'><article className='surface-panel'><div className='section-heading'><div><p className='eyebrow'>LEDGER / THROUGHPUT</p><h2>{isId ? 'Request gateway' : 'Gateway requests'}</h2></div><div className='range-control'>{([7, 30] as const).map((value) => <button type='button' key={value} onClick={() => setRange(value)} className={range === value ? 'is-active' : ''}>{value}d</button>)}</div></div><div className='bar-chart' role='img' aria-label={isId ? 'Grafik request gateway per hari' : 'Gateway requests per day'}>{days.map((day) => <div className='bar-column' key={day.key}><div className='bar-stack'><span className='bar-ok' style={{ height: `${(day.ok / max) * 100}%` }} /><span className='bar-rejected' style={{ height: `${(day.rejected / max) * 100}%` }} /></div><small>{day.key}</small></div>)}</div><div className='chart-key'><span><i className='bar-ok' />{isId ? 'berhasil' : 'successful'}</span><span><i className='bar-rejected' />{isId ? 'ditolak/error' : 'rejected/error'}</span></div></article><article className='surface-panel'><div className='section-heading'><div><p className='eyebrow'>QUEUE / ATTENTION</p><h2>{isId ? 'Pekerjaan operator' : 'Operator attention'}</h2></div><ClipboardList className='section-icon' /></div><div className='attention-list'><Link to='/admin/orders'><span><Radio />{isId ? 'Order pending' : 'Pending orders'}</span><strong>{pending}</strong></Link><Link to='/admin/licenses'><span><KeyRound />{isId ? 'License aktif' : 'Active licenses'}</span><strong>{active}</strong></Link><Link to='/admin/ledger'><span><Database />{isId ? 'Ledger entries' : 'Ledger entries'}</span><strong>{records.length}</strong></Link></div></article></section>
    <section className='quiet-note'><CheckCircle2 className='size-5' /><p>{isId ? 'Angka operasional di halaman ini berasal dari endpoint admin dan ledger. Metrik komersial yang tidak tersedia sengaja tidak ditampilkan.' : 'Operational values come from admin endpoints and the ledger. Unsupported commercial metrics are intentionally omitted.'}</p></section>
    <IssueLicenseModal open={issueOpen} onOpenChange={setIssueOpen} onSuccess={() => { void licenses.refetch() }} />
  </div>
}
