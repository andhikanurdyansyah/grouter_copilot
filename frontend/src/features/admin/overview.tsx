import { useQuery } from '@tanstack/react-query'
import { fetchAdminStats, fetchAdminOrders, fetchAdminLicenses, fetchHealth, fetchLedger, fmtDate } from '@/lib/grouter-api'
import { PageHeader } from '@/components/shared/page-header'
import { StatusBadge } from '@/components/shared/status-badge'
import { TableSkeleton, ErrorState } from '@/components/shared/data-states'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Link } from '@tanstack/react-router'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { AlertTriangle, CheckCircle2, RefreshCw, ArrowRight } from 'lucide-react'

// Antrean Operasional: admin melihat "apa yang butuh tindakan saya" — bukan
// sekadar kartu metrik. Sumber nyata: orders PENDING + lisensi bermasalah.
export function AdminOverview() {
  const orders = useQuery({ queryKey: ['admin-orders'], queryFn: () => fetchAdminOrders(100) })
  const lic = useQuery({ queryKey: ['admin-licenses'], queryFn: fetchAdminLicenses })
  const stats = useQuery({ queryKey: ['admin-stats'], queryFn: fetchAdminStats })
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, refetchInterval: 60_000 })
  const ledger = useQuery({ queryKey: ['admin-ledger', 'recent'], queryFn: () => fetchLedger({ limit: 8 }) })

  const loading = orders.isPending || lic.isPending
  const error = orders.isError ? orders : lic.isError ? lic : null

  const allOrders = (orders.data?.orders ?? []) as { id: string; planName?: string | null; packageKey?: string; amount?: number; status?: string; createdAt?: number | string }[]
  const pending = allOrders.filter((o) => String(o.status).toUpperCase() === 'PENDING')
  const licenses = (lic.data?.licenses ?? []) as { id: string; customer?: string | null; status?: string; expiresAt?: string | number }[]
  const revoked = licenses.filter((l) => String(l.status) === 'revoked')
  const expiringSoon = licenses.filter((l) => {
    if (String(l.status) === 'revoked' || !l.expiresAt) return false
    const t = new Date(l.expiresAt).getTime()
    return t > Date.now() && t - Date.now() < 14 * 864e5
  })
  const s = stats.data as Record<string, number> | undefined
  const queueEmpty = pending.length === 0 && expiringSoon.length === 0

  return (
    <div className='space-y-5'>
      <PageHeader
        title='Antrean Operasional'
        description='Apa yang butuh tindakan Anda sekarang — order menunggu verifikasi dan lisensi yang perlu perhatian.'
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
        <>
          {/* WORK QUEUE */}
          <Card>
            <CardContent className='divide-y p-0'>
              <QueueRow
                to='/admin/orders'
                icon={pending.length > 0 ? <AlertTriangle className='size-4 text-amber-600' aria-hidden /> : <CheckCircle2 className='size-4 text-emerald-600' aria-hidden />}
                title={pending.length > 0
                  ? `${pending.length.toLocaleString('id-ID')} order menunggu verifikasi pembayaran`
                  : 'Tidak ada order menunggu verifikasi'}
                sub={pending.length > 0 ? 'Verifikasi selalu re-cek status ke KlikQRIS upstream sebelum lisensi diterbitkan.' : 'Antrean pembayaran bersih.'}
                urgent={pending.length > 0}
              />
              <QueueRow
                to='/admin/licenses'
                icon={expiringSoon.length > 0 ? <AlertTriangle className='size-4 text-amber-600' aria-hidden /> : <CheckCircle2 className='size-4 text-emerald-600' aria-hidden />}
                title={expiringSoon.length > 0
                  ? `${expiringSoon.length.toLocaleString('id-ID')} lisensi kedaluwarsa dalam 14 hari`
                  : 'Tidak ada lisensi mendekati kedaluwarsa'}
                sub='Perpanjangan ditangani customer via Paket & Perpanjangan.'
                urgent={expiringSoon.length > 0}
              />
              <QueueRow
                to='/admin/licenses'
                icon={revoked.length > 0 ? <AlertTriangle className='size-4 text-muted-foreground' aria-hidden /> : <CheckCircle2 className='size-4 text-emerald-600' aria-hidden />}
                title={`${revoked.length.toLocaleString('id-ID')} lisensi berstatus dicabut`}
                sub='Pantau tren; lonjakan dapat menandakan masalah pembayaran atau abuse.'
                urgent={false}
              />
            </CardContent>
          </Card>

          {queueEmpty && (
            <div className='flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-400' role='status'>
              <CheckCircle2 className='size-4' aria-hidden />
              Semua antrean bersih — tidak ada tindakan menunggu.
            </div>
          )}

          {/* METRIK SINGKAT (penopang) */}
          <div className='grid gap-3 sm:grid-cols-4'>
            {[
              { label: 'Lisensi aktif', value: (s?.activeLicenses ?? 0) },
              { label: 'Total lisensi', value: (s?.totalLicenses ?? 0) },
              { label: 'Dicabut', value: (s?.revokedLicenses ?? 0) },
              { label: 'Backend', value: health.isError ? 'DOWN' : 'Sehat', tone: health.isError ? 'danger' : 'success' },
            ].map((m) => (
              <div key={m.label} className='rounded-lg border bg-card px-4 py-3'>
                <p className='text-xs font-medium text-muted-foreground'>{m.label}</p>
                <p className={'mt-1 text-2xl font-semibold tabular-nums ' + (m.tone === 'danger' ? 'text-red-600 dark:text-red-400' : m.tone === 'success' ? 'text-emerald-600 dark:text-emerald-400' : '')}>
                  {typeof m.value === 'number' ? m.value.toLocaleString('id-ID') : m.value}
                </p>
              </div>
            ))}
          </div>

          {/* AKTIVITAS TERAKHIR (ledger 8 terbaru) */}
          <Card className='py-0'>
            <CardContent className='px-0 pb-0'>
              <div className='flex items-center justify-between px-4 py-3'>
                <div>
                  <h2 className='text-sm font-semibold'>Aktivitas AI terakhir</h2>
                  <p className='text-xs text-muted-foreground'>8 request terakhir dari AI Ledger (dimensi customer).</p>
                </div>
                <Button asChild variant='ghost' size='sm' className='text-primary'>
                  <Link to='/admin/ledger'>Buka Ledger <ArrowRight className='size-3.5' /></Link>
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Waktu</TableHead>
                    <TableHead className='hidden md:table-cell'>License</TableHead>
                    <TableHead className='hidden lg:table-cell'>Model</TableHead>
                    <TableHead className='text-right'>Token</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledger.isPending ? (
                    <TableRow><TableCell colSpan={5}><TableSkeleton rows={3} cols={4} /></TableCell></TableRow>
                  ) : ((ledger.data?.records ?? []) as Record<string, unknown>[]).length === 0 ? (
                    <TableRow><TableCell colSpan={5} className='py-8 text-center text-sm text-muted-foreground'>Belum ada request AI tercatat.</TableCell></TableRow>
                  ) : ((ledger.data?.records ?? []) as Record<string, unknown>[]).map((e, i) => {
                    const ev = e as { createdAt?: number; licenseId?: string; model?: string | null; totalTokens?: number | null; status?: string; errorClassification?: string | null }
                    const ok = ev.status === 'success'
                    const created = ev.createdAt ? new Date(ev.createdAt).toISOString() : undefined
                    return (
                      <TableRow key={i}>
                        <TableCell className='whitespace-nowrap text-sm'>{fmtDate(created)}</TableCell>
                        <TableCell className='hidden md:table-cell font-mono text-xs'>{ev.licenseId || '—'}</TableCell>
                        <TableCell className='hidden lg:table-cell font-mono text-xs'>{ev.model || '—'}</TableCell>
                        <TableCell className='text-right tabular-nums'>{typeof ev.totalTokens === 'number' ? ev.totalTokens.toLocaleString('id-ID') : '—'}</TableCell>
                        <TableCell>
                          <StatusBadge tone={ok ? 'success' : 'danger'}>{ok ? 'sukses' : (ev.errorClassification || 'ditolak')}</StatusBadge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function QueueRow({ to, icon, title, sub, urgent }: {
  to: string
  icon: React.ReactNode
  title: string
  sub: string
  urgent?: boolean
}) {
  return (
    <Link to={to} className='group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/50'>
      {icon}
      <div className='min-w-0 flex-1'>
        <p className={'text-sm font-medium ' + (urgent ? '' : '')}>{title}</p>
        <p className='text-xs text-muted-foreground'>{sub}</p>
      </div>
      <ArrowRight className='size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5' aria-hidden />
    </Link>
  )
}
