import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMe, fetchMyLedger, fetchPlans } from '@/lib/grouter-api'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Check, CheckCircle2, CircleAlert, Command, Copy, KeyRound, ShieldCheck, Sparkles, Terminal } from 'lucide-react'
import { useLanguage } from '@/context/language-provider'
import { Button } from '@/components/ui/button'

const mono = 'font-mono tabular-nums'

export function CustomerOverview() {
  const { language } = useLanguage()
  const isId = language === 'id'
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe })
  const plans = useQuery({ queryKey: ['plans'], queryFn: fetchPlans })
  const ledger = useQuery({ queryKey: ['my-ledger-live'], queryFn: () => fetchMyLedger(200), refetchInterval: 30_000 })
  const [now, setNow] = useState(() => Date.now())
  const [copied, setCopied] = useState(false)
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(id) }, [])
  const license = me.data?.licenses?.find((item) => String(item.status ?? 'active') === 'active') ?? me.data?.licenses?.[0]
  const usage = (me.data?.usage ?? []).find((item) => item.licenseId === license?.id)
  const plan = (plans.data?.plans ?? []).find((item) => item.key === license?.planKey)
  const records = (ledger.data?.records ?? []) as Array<{ status?: string; totalTokens?: number | null; inputTokens?: number | null; outputTokens?: number | null }>
  const used = usage?.usedTokens ?? 0
  const quota = usage?.quotaLimit ?? null
  const percent = quota == null ? null : Math.min(100, Math.round((used / Math.max(quota, 1)) * 100))
  const days = license?.expiresAt ? Math.max(0, Math.ceil((new Date(license.expiresAt).getTime() - now) / 86_400_000)) : null
  const command = license ? `npx @grouter/copilot install --license ${license.id}` : 'npx @grouter/copilot install'
  const copyCommand = async () => { await navigator.clipboard.writeText(command); setCopied(true); window.setTimeout(() => setCopied(false), 1600) }
  return (
    <div className='dashboard-page space-y-8'>
      <header className='dashboard-header'><div><p className='eyebrow'>CONTROL PLANE / CUSTOMER</p><h1>{isId ? 'Status workspace Anda' : 'Your workspace status'}</h1><p className='lede'>{isId ? 'Satu tempat untuk memahami license, entitlement, dan langkah berikutnya.' : 'One place to understand your license, entitlement, and next action.'}</p></div><Button asChild className='dashboard-primary'><Link to={license ? '/user/install' : '/user/orders'}>{license ? (isId ? 'Lanjut setup' : 'Continue setup') : (isId ? 'Pilih paket' : 'Choose a plan')}<ArrowUpRight className='size-4' /></Link></Button></header>
      <section className='status-band'><div className='status-mark'>{license ? <CheckCircle2 /> : <CircleAlert />}</div><div className='min-w-0 flex-1'><p className='eyebrow'>{license ? 'LICENSE ACTIVE' : 'NOT ACTIVE'}</p><h2>{license ? (plan?.name ?? license.customer ?? 'Copilot license') : (isId ? 'Workspace siap diaktifkan' : 'Workspace ready to activate')}</h2><p>{license ? (isId ? `${days ?? '—'} hari tersisa · entitlement server-side` : `${days ?? '—'} days remaining · server-side entitlement`) : (isId ? 'Pilih paket untuk memulai instalasi.' : 'Choose a plan to begin installation.')}</p></div>{license && <div className='status-meta'><span className={mono}>{license.id}</span><span>{license.expiresAt ? new Date(license.expiresAt).toLocaleDateString('id-ID') : '—'}</span></div>}</section>
      <section className='dashboard-grid dashboard-grid--three'><article className='metric-panel metric-panel--lead'><div className='eyebrow'>AI USAGE</div><div className='metric-number'>{usage?.aiEnabled === false ? 'OFF' : quota == null ? '∞' : `${percent ?? 0}%`}</div><p>{usage?.aiEnabled === false ? (isId ? 'AI belum diaktifkan untuk paket ini.' : 'AI is not enabled for this plan.') : quota == null ? (isId ? 'Kuota tidak terbatas' : 'Unlimited quota') : `${used.toLocaleString('id-ID')} / ${quota.toLocaleString('id-ID')} tokens`}</p>{percent != null && <div className='meter'><span style={{ width: `${percent}%` }} /></div>}</article><article className='metric-panel'><div className='eyebrow'>REQUESTS</div><div className='metric-number'>{(usage?.requestCount ?? records.filter((r) => r.status === 'ok').length).toLocaleString('id-ID')}</div><p>{isId ? 'tercatat oleh ledger' : 'recorded by the ledger'}</p></article><article className='metric-panel'><div className='eyebrow'>PACKAGE</div><div className='metric-value'>{plan?.name ?? license?.customer ?? '—'}</div><p>{plan?.features?.join(' · ') || (isId ? 'Belum ada entitlement' : 'No entitlement yet')}</p></article></section>
      <section className='dashboard-grid dashboard-grid--split'><article className='surface-panel'><div className='section-heading'><div><p className='eyebrow'>NEXT ACTION</p><h2>{license ? (isId ? 'Hubungkan workspace' : 'Connect your workspace') : (isId ? 'Aktifkan Copilot' : 'Activate Copilot')}</h2></div><Command className='section-icon' /></div><p className='body-copy'>{license ? (isId ? 'Installer menulis konfigurasi client tanpa pernah mengekspos credential provider.' : 'The installer writes client configuration without exposing provider credentials.') : (isId ? 'Pilih paket dari katalog server untuk melihat entitlement yang sebenarnya.' : 'Choose a plan from the server catalogue to see the real entitlement.')}</p>{license && <div className='command-line'><Terminal className='size-4' /><code>{command}</code><button type='button' onClick={copyCommand} aria-label={isId ? 'Salin command install' : 'Copy install command'}>{copied ? <Check /> : <Copy />}</button></div>}<Button asChild variant='outline' className='mt-5'><Link to={license ? '/user/install' : '/user/orders'}>{license ? (isId ? 'Buka panduan install' : 'Open install guide') : (isId ? 'Lihat katalog paket' : 'View package catalogue')}<ArrowUpRight className='size-4' /></Link></Button></article><article className='surface-panel'><div className='section-heading'><div><p className='eyebrow'>RECENT ACTIVITY</p><h2>{isId ? 'Ledger terbaru' : 'Recent ledger'}</h2></div><Sparkles className='section-icon' /></div>{ledger.isLoading ? <p className='empty-copy'>{isId ? 'Memuat data…' : 'Loading data…'}</p> : records.length === 0 ? <p className='empty-copy'>{isId ? 'Belum ada request. Data akan muncul setelah Copilot digunakan.' : 'No requests yet. Data appears once Copilot is used.'}</p> : <div className='activity-list'>{records.slice(0, 5).map((record, index) => <div className='activity-row' key={`${index}-${record.status}`}><span className={record.status === 'ok' ? 'activity-dot activity-dot--ok' : 'activity-dot'} /><span className='flex-1'>{record.status === 'ok' ? (isId ? 'Request berhasil' : 'Successful request') : (isId ? 'Request ditolak' : 'Rejected request')}</span><span className={mono}>{(record.totalTokens ?? (record.inputTokens ?? 0) + (record.outputTokens ?? 0)).toLocaleString('id-ID')}</span></div>)}</div>}</article></section>
      <section className='quiet-note'><ShieldCheck className='size-5' /><p>{isId ? 'License ditandatangani dan diverifikasi server. Credential supplier tidak pernah dikirim ke browser atau installer.' : 'Licenses are signed and verified server-side. Supplier credentials never reach the browser or installer.'}</p><Link to='/user/licenses'><KeyRound className='size-4' />{isId ? 'Kelola license' : 'Manage license'}</Link></section>
    </div>
  )
}
