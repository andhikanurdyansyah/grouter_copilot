import { useQuery } from '@tanstack/react-query'
import { fetchAdminStats, fetchHealth } from '@/lib/grouter-api'
import { PageHeader } from '@/components/shared/page-header'
import { MetricCard } from '@/components/shared/metric-card'
import { TableSkeleton, ErrorState } from '@/components/shared/data-states'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Link } from '@tanstack/react-router'
import { RefreshCw } from 'lucide-react'

export function AdminOverview() {
  const stats = useQuery({ queryKey: ['admin-stats'], queryFn: fetchAdminStats })
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, refetchInterval: 60_000 })

  if (stats.isPending) {
    return (
      <div className='space-y-6'>
        <PageHeader title='Ringkasan Operasional' description='Status lisensi, pembayaran, dan infrastruktur — data langsung dari backend.' />
        <TableSkeleton rows={3} cols={4} />
      </div>
    )
  }
  if (stats.isError) {
    const status = (stats.error as { response?: { status?: number } })?.response?.status
    return (
      <div className='space-y-6'>
        <PageHeader title='Ringkasan Operasional' description='Status lisensi, pembayaran, dan infrastruktur — data langsung dari backend.' />
        <ErrorState
          status={status}
          message={(stats.error as Error).message}
          onRetry={() => stats.refetch()}
        />
      </div>
    )
  }

  const s = stats.data as Record<string, number> | undefined
  const num = (k: string): number => (s && typeof s[k] === 'number' ? s[k] : 0)
  const active = num('activeLicenses')
  const total = num('totalLicenses')
  const revoked = num('revokedLicenses')

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Ringkasan Operasional'
        description='Status lisensi, pembayaran, dan infrastruktur — data langsung dari backend.'
      >
        <Button variant='outline' size='sm' onClick={() => { stats.refetch(); health.refetch() }}>
          <RefreshCw className='size-3.5' /> Muat ulang
        </Button>
      </PageHeader>

      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
        <MetricCard label='Total lisensi' value={total} />
        <MetricCard label='Lisensi aktif' value={active} tone='success' sub={total ? Math.round((active / total) * 100) + '% dari total' : '—'} />
        <MetricCard label='Dicabut' value={revoked} tone={revoked > 0 ? 'danger' : 'default'} sub='perlu perhatian jika naik' />
        <MetricCard
          label='Backend'
          value={health.isError ? 'TAK TERJANGKAU' : 'Sehat'}
          tone={health.isError ? 'danger' : 'success'}
          sub='/api/health · polling 60 dtk'
        />
      </div>

      <div className='grid gap-4 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Tindakan cepat</CardTitle>
            <CardDescription>Alur kerja harian operator.</CardDescription>
          </CardHeader>
          <CardContent className='grid gap-2 sm:grid-cols-2'>
            <Button asChild variant='outline' className='justify-start'>
              <Link to='/admin/licenses'>Kelola lisensi</Link>
            </Button>
            <Button asChild variant='outline' className='justify-start'>
              <Link to='/admin/orders'>Verifikasi pembayaran</Link>
            </Button>
            <Button asChild variant='outline' className='justify-start'>
              <Link to='/admin/packages'>Atur paket & AI policy</Link>
            </Button>
            <Button asChild variant='outline' className='justify-start'>
              <Link to='/admin/ledger'>Periksa AI ledger</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Instalasi & heartbeat</CardTitle>
            <CardDescription>Sinyal liveness dari plugin terpasang.</CardDescription>
          </CardHeader>
          <CardContent className='grid grid-cols-2 gap-3'>
            <div>
              <p className='text-xs font-medium text-muted-foreground'>Total install</p>
              <p className='text-2xl font-semibold tabular-nums'>{(s?.totalInstalls ?? 0).toLocaleString('id-ID')}</p>
              {(s?.totalInstalls ?? 0) === 0 && (
                <p className='mt-0.5 text-xs text-muted-foreground'>belum ada plugin terpasang</p>
              )}
            </div>
            <div>
              <p className='text-xs font-medium text-muted-foreground'>Heartbeat</p>
              <p className='text-2xl font-semibold tabular-nums'>{(s?.totalHeartbeats ?? 0).toLocaleString('id-ID')}</p>
              {(s?.totalHeartbeats ?? 0) === 0 && (
                <p className='mt-0.5 text-xs text-muted-foreground'>menunggu aktivitas plugin</p>
              )}
            </div>
            <p className='col-span-2 text-xs text-muted-foreground'>
              Pemakaian customer (AI Ledger) dan pemakaian infrastruktur selalu dipisah — tidak pernah dijumlahkan.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
