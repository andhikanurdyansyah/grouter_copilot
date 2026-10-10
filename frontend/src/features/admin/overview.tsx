import { useQuery } from '@tanstack/react-query'
import { fetchAdminStats, fetchAdminOrders, fetchAdminLicenses, fetchHealth, fetchLedger } from '@/lib/grouter-api'
import { PageHeader } from '@/components/shared/page-header'
import { TableSkeleton, ErrorState } from '@/components/shared/data-states'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Link } from '@tanstack/react-router'
import { CheckCircle2, RefreshCw, ArrowRight, Wallet, KeyRound, Timer, CircleAlert } from 'lucide-react'

// Overview = "Butuh tindakan Anda": work queue sebagai kartu tindakan kaya
// konteks (bukan baris tipis), identitas bisnis di kolom kanan, log AI
// berkomentar manusiawi. Komposisi Direction B — bento, bukan tumpukan kartu.

// Umur manusiawi untuk antrean pending: jam → hari → bulan
function formatAge(ms: number): string {
  const hours = Math.max(1, Math.round(ms / 36e5))
  if (hours < 24) return `${hours} jam`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} hari`
  const months = Math.round(days / 30)
  return `${months} bulan`
}

// Eskalasi severity umur pending: <24j info, 24–72j warning, >72j danger
function ageTone(ms: number): 'info' | 'warning' | 'danger' {
  const hours = ms / 36e5
  if (hours > 72) return 'danger'
  if (hours >= 24) return 'warning'
  return 'info'
}

// Timestamp aktivitas: jam saja untuk hari ini, tanggal singkat untuk hari lain
function fmtActivityTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  const time = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return time
  return `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} ${time}`
}

export function AdminOverview() {
  const orders = useQuery({ queryKey: ['admin-orders'], queryFn: () => fetchAdminOrders(100) })
  const lic = useQuery({ queryKey: ['admin-licenses'], queryFn: fetchAdminLicenses })
  const stats = useQuery({ queryKey: ['admin-stats'], queryFn: fetchAdminStats })
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, refetchInterval: 60_000 })
  const ledger = useQuery({ queryKey: ['admin-ledger', 'recent'], queryFn: () => fetchLedger({ limit: 6 }) })

  const loading = orders.isPending || lic.isPending
  const error = orders.isError ? orders : lic.isError ? lic : null

  const allOrders = (orders.data?.orders ?? []) as { id: string; planName?: string | null; packageKey?: string; amount?: number; status?: string; createdAt?: number | string }[]
  const pending = allOrders.filter((o) => String(o.status).toUpperCase() === 'PENDING')
  const paid = allOrders.filter((o) => String(o.status).toUpperCase() === 'PAID')
  const paidThisMonth = paid.filter((o) => {
    if (!o.createdAt) return false
    const d = new Date(o.createdAt)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const revenuePaid = paidThisMonth.reduce((acc, o) => acc + (Number(o.amount) || 0), 0)
  const oldestPending = pending.length > 0
    ? pending.reduce((old, o) => (Number(o.createdAt || 0) < Number(old.createdAt || Infinity) ? o : old), pending[0])
    : undefined
  const pendingAgeMs = oldestPending?.createdAt ? Math.max(0, Date.now() - Number(oldestPending.createdAt)) : 0
  const pendingTone = ageTone(pendingAgeMs)

  const licenses = (lic.data?.licenses ?? []) as { id: string; customer?: string | null; status?: string; expiresAt?: string | number }[]
  const revoked = licenses.filter((l) => String(l.status) === 'revoked')
  const expiringSoon = licenses.filter((l) => {
    if (String(l.status) === 'revoked' || !l.expiresAt) return false
    const t = new Date(l.expiresAt).getTime()
    return t > Date.now() && t - Date.now() < 14 * 864e5
  })
  const s = stats.data as Record<string, number> | undefined
  const queueEmpty = pending.length === 0 && expiringSoon.length === 0

  const healthCheckedAt = health.dataUpdatedAt
    ? new Date(health.dataUpdatedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null

  return (
    <div className='space-y-5'>
      <PageHeader
        title='Operasional'
        description='Apa yang butuh tindakan Anda sekarang, kondisi bisnis, dan aktivitas AI terbaru.'
      >
        <Button variant='outline' size='sm' onClick={() => { orders.refetch(); lic.refetch(); stats.refetch(); health.refetch() }}>
          <RefreshCw className='size-3.5' /> Muat ulang
        </Button>
      </PageHeader>

      {loading ? (
        <TableSkeleton rows={4} cols={3} />
      ) : error ? (
        <ErrorState
          status={(error.error as { response?: { status?: number } })?.response?.status}
          message={(error.error as Error).message}
          onRetry={() => error.refetch()}
        />
      ) : (
        <div className='grid gap-4 xl:grid-cols-[1.55fr_1fr]'>
          {/* ── BUTUH TINDAKAN ── */}
          <section className='flex flex-col gap-4' aria-labelledby='needs-action'>
            <h2 id='needs-action' className='text-[15px] font-semibold'>Butuh tindakan Anda</h2>

            {pending.length > 0 && (
              <ActionCard
                to='/admin/orders'
                tone={pendingTone}
                icon={<Wallet className='size-5' aria-hidden />}
                title={`${pending.length.toLocaleString('id-ID')} order menunggu verifikasi pembayaran`}
                sub={oldestPending
                  ? `Tertua ${formatAge(pendingAgeMs)} · ${oldestPending.planName || oldestPending.packageKey || ''} · verifikasi selalu re-cek status ke upstream sebelum lisensi terbit.`
                  : 'Verifikasi selalu re-cek status ke upstream sebelum lisensi terbit.'}
                action='Verifikasi order'
              />
            )}
            {expiringSoon.length > 0 && (
              <ActionCard
                to='/admin/licenses'
                tone='info'
                icon={<Timer className='size-5' aria-hidden />}
                title={`${expiringSoon.length.toLocaleString('id-ID')} lisensi kedaluwarsa dalam 14 hari`}
                sub='Perpanjangan ditangani customer lewat Paket & Perpanjangan — pastikan mereka punya paket pengganti.'
                action='Tinjau lisensi'
              />
            )}
            {/* Kartu aksi hanya untuk hal yang benar-benar butuh tindakan —
                dicabut adalah status terminal, disembunyikan saat 0 */}
            {revoked.length > 0 && (
              <ActionCard
                to='/admin/licenses'
                tone='neutral'
                icon={<KeyRound className='size-5' aria-hidden />}
                title={`${revoked.length.toLocaleString('id-ID')} lisensi berstatus dicabut`}
                sub='Lonjakan pencabutan bisa menandakan kegagalan pembayaran atau abuse — pantau trennya.'
                action='Lihat lisensi'
              />
            )}

            {queueEmpty && (
              <div className='flex items-center gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3.5 text-sm font-medium text-emerald-700' role='status'>
                <CheckCircle2 className='size-4.5' aria-hidden />
                Semua antrean bersih — tidak ada tindakan menunggu.
              </div>
            )}

            {/* ── AKTIVITAS AI: log berkomentar, tiap baris menuju ledger ── */}
            <Card className='py-0'>
              <CardContent className='px-0 pb-0'>
                <div className='flex items-center justify-between px-5 py-4'>
                  <h3 className='text-[15px] font-semibold'>Aktivitas AI terakhir</h3>
                  <Button asChild variant='ghost' size='sm' className='text-primary'>
                    <Link to='/admin/ledger'>Buka ledger <ArrowRight className='size-3.5' /></Link>
                  </Button>
                </div>
                <ul className='divide-y border-t'>
                  {ledger.isPending ? (
                    <li className='px-5 py-6'><TableSkeleton rows={3} cols={2} /></li>
                  ) : ((ledger.data?.records ?? []) as Record<string, unknown>[]).length === 0 ? (
                    <li className='px-5 py-8 text-center text-sm text-muted-foreground'>Belum ada request AI tercatat.</li>
                  ) : ((ledger.data?.records ?? []) as Record<string, unknown>[]).map((e, i) => {
                    const ev = e as { createdAt?: number; licenseId?: string; model?: string | null; totalTokens?: number | null; status?: string; errorClassification?: string | null }
                    const ok = ev.status === 'success'
                    return (
                      <li key={i}>
                        <Link
                          to='/admin/ledger'
                          className='flex min-w-0 items-center gap-3 px-5 py-3 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none'
                          aria-label={`Buka ledger untuk ${ev.licenseId || 'request ini'}`}
                        >
                          <span aria-hidden className={'size-2 shrink-0 rounded-full ' + (ok ? 'bg-emerald-500' : 'bg-red-500')} />
                          <p className='min-w-0 flex-1 text-sm'>
                            <span className='font-mono text-xs font-medium [overflow-wrap:anywhere]'>{(ev.licenseId || '—').slice(0, 18)}</span>{' '}
                            {ok
                              ? <>menyelesaikan request <span className='text-muted-foreground [overflow-wrap:anywhere]'>{ev.model || ''} · {typeof ev.totalTokens === 'number' ? ev.totalTokens.toLocaleString('id-ID') : '—'} token</span></>
                              : <>ditolak — <span className='text-muted-foreground [overflow-wrap:anywhere]'>{ev.errorClassification || 'gagal'}</span></>}
                          </p>
                          <span className='shrink-0 text-xs tabular-nums text-muted-foreground'>
                            {ev.createdAt ? fmtActivityTime(ev.createdAt) : ''}
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* ── KONDISI BISNIS & SISTEM ── */}
          <section className='flex flex-col gap-4' aria-labelledby='biz-state'>
            <h2 id='biz-state' className='text-[15px] font-semibold'>Kondisi bisnis &amp; sistem</h2>

            <Card className='py-0'>
              <CardContent className='p-5'>
                <p className='text-sm font-medium text-muted-foreground'>Pendapatan lunas bulan ini</p>
                <p className='mt-1.5 text-[28px] font-bold tracking-tight tabular-nums'>
                  Rp {(revenuePaid / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })}<span className='text-base font-semibold text-muted-foreground'> jt</span>
                </p>
                <p className='mt-1 text-xs text-muted-foreground'>
                  {paidThisMonth.length.toLocaleString('id-ID')} order lunas bulan ini · total {paid.length.toLocaleString('id-ID')} sepanjang waktu
                </p>
              </CardContent>
            </Card>

            <div className='grid grid-cols-2 gap-4'>
              <Card className='py-0'>
                <CardContent className='p-5'>
                  <p className='text-sm font-medium text-muted-foreground'>Lisensi aktif</p>
                  <p className='mt-1 text-2xl font-bold tabular-nums'>{(s?.activeLicenses ?? 0).toLocaleString('id-ID')}</p>
                  <p className='mt-0.5 text-xs text-muted-foreground'>dari {(s?.totalLicenses ?? 0).toLocaleString('id-ID')} total</p>
                </CardContent>
              </Card>
              <Card className='py-0'>
                <CardContent className='p-5'>
                  <p className='text-sm font-medium text-muted-foreground'>Backend</p>
                  <p className={'mt-1 flex items-center gap-1.5 text-[15px] font-semibold ' + (health.isError ? 'text-red-600' : 'text-emerald-600')}>
                    <span aria-hidden className={'size-2 rounded-full ' + (health.isError ? 'bg-red-500' : 'bg-emerald-500')} />
                    {health.isError ? 'Tak terjangkau' : 'Sehat'}
                  </p>
                  {healthCheckedAt && (
                    <p className='mt-0.5 text-xs tabular-nums text-muted-foreground' role='status'>
                      Dicek {healthCheckedAt}
                    </p>
                  )}
                  <Link to='/admin/settings' className='mt-0.5 inline-block text-xs text-primary hover:underline'>Infrastruktur →</Link>
                </CardContent>
              </Card>
            </div>

            <Card className='py-0'>
              <CardContent className='space-y-3 p-5'>
                <p className='text-sm font-semibold'>Jalan pintas</p>
                <QuickLink to='/admin/licenses' title='Terbitkan lisensi' sub='Buka halaman lisensi untuk menerbitkan lisensi baru' />
                <QuickLink to='/admin/orders' title='Verifikasi order tertua' sub='Tinjau antrean pembayaran yang menunggu verifikasi' />
                <QuickLink to='/admin/ledger' title='Lihat error AI 24 jam' sub='Audit request AI yang ditolak di ledger' icon={<CircleAlert className='size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary' aria-hidden />} />
              </CardContent>
            </Card>
          </section>
        </div>
      )}
    </div>
  )
}

function ActionCard({ to, icon, title, sub, action, tone }: {
  to: string
  icon: React.ReactNode
  title: string
  sub: string
  action: string
  tone: 'warning' | 'info' | 'neutral' | 'danger'
}) {
  const toneCls = tone === 'danger'
    ? 'border-red-500/30 bg-red-500/[0.05] hover:border-red-500/50'
    : tone === 'warning'
      ? 'border-amber-500/30 bg-amber-500/[0.05] hover:border-amber-500/50'
      : tone === 'info'
        ? 'border-primary/25 bg-primary/[0.04] hover:border-primary/40'
        : 'border hover:bg-muted/40'
  const iconCls = tone === 'danger'
    ? 'bg-red-500/10 text-red-600'
    : tone === 'warning'
      ? 'bg-amber-500/10 text-amber-600'
      : tone === 'info'
        ? 'bg-primary/10 text-primary'
        : 'bg-muted text-muted-foreground'
  return (
    <Link
      to={to}
      className={'group flex items-center gap-4 rounded-xl border p-4 transition-colors ' + toneCls}
    >
      <span aria-hidden className={'grid size-10 shrink-0 place-items-center rounded-lg ' + iconCls}>{icon}</span>
      <span className='min-w-0 flex-1'>
        <span className='block text-sm font-semibold'>{title}</span>
        <span className='mt-0.5 block text-[13px] leading-snug text-muted-foreground'>{sub}</span>
      </span>
      <span className='shrink-0 rounded-lg border bg-card px-3 py-1.5 text-[13px] font-medium transition-colors group-hover:border-primary/40 group-hover:text-primary'>
        {action}
      </span>
    </Link>
  )
}

function QuickLink({ to, title, sub, icon }: { to: string; title: string; sub: string; icon?: React.ReactNode }) {
  return (
    <Link to={to} className='group flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-primary/40 hover:bg-accent'>
      <div className='min-w-0 flex-1'>
        <p className='text-sm font-medium'>{title}</p>
        <p className='text-xs text-muted-foreground'>{sub}</p>
      </div>
      {icon ?? <ArrowRight className='size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary' aria-hidden />}
    </Link>
  )
}
