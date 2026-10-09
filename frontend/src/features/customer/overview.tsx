import { useQuery } from '@tanstack/react-query'
import { fetchMe, fetchPlans } from '@/lib/grouter-api'
import { PageHeader } from '@/components/shared/page-header'
import { MetricCard } from '@/components/shared/metric-card'
import { StatusBadge } from '@/components/shared/status-badge'
import { TableSkeleton, EmptyState, ErrorState } from '@/components/shared/data-states'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Link } from '@tanstack/react-router'

function statusOf(l: { status?: string; expiresAt?: string }): string {
  if (l.status) return String(l.status)
  if (l.expiresAt && new Date(l.expiresAt).getTime() < Date.now()) return 'expired'
  return 'active'
}

export function CustomerOverview() {
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe })
  const plans = useQuery({ queryKey: ['plans'], queryFn: fetchPlans })

  if (me.isPending) {
    return (
      <div className='space-y-5'>
        <PageHeader title='Ringkasan' description='Status lisensi, AI, dan pembelian Anda.' />
        <TableSkeleton rows={3} cols={3} />
      </div>
    )
  }
  if (me.isError) {
    return (
      <div className='space-y-5'>
        <PageHeader title='Ringkasan' description='Status lisensi, AI, dan pembelian Anda.' />
        <ErrorState
          status={(me.error as { response?: { status?: number } })?.response?.status}
          message={(me.error as Error).message}
          onRetry={() => me.refetch()}
        />
      </div>
    )
  }

  const { account, licenses, usage } = me.data!
  const active = licenses.filter((l) => statusOf(l) === 'active')
  const firstUsage = usage[0]
  const used = firstUsage?.usedTokens ?? 0
  const limit = firstUsage?.quotaLimit ?? null
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const exhausted = limit !== null && used >= limit
  const nearExhausted = limit !== null && !exhausted && pct >= 90

  return (
    <div className='space-y-6'>
      <PageHeader
        title={`Selamat datang, ${account.name}`}
        description='Status lisensi, pemakaian AI terhadap kuota, dan pembelian Anda.'
      >
        <Button asChild variant='outline' size='sm'>
          <Link to='/user/orders'>Beli / perpanjang paket</Link>
        </Button>
      </PageHeader>

      {licenses.length === 0 ? (
        <EmptyState
          title='Belum ada lisensi aktif'
          description='Beli paket untuk mulai menggunakan gRouter Copilot. Lisensi terbit otomatis setelah pembayaran terverifikasi.'
          action={<Button asChild><Link to='/user/orders'>Lihat paket</Link></Button>}
        />
      ) : (
        <>
          <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
            <MetricCard label='Lisensi aktif' value={active.length} sub={`dari ${licenses.length} lisensi`} tone={active.length > 0 ? 'success' : 'warning'} />
            <MetricCard
              label='Token terpakai'
              value={used}
              sub={limit === null || limit === undefined ? 'kuota unlimited' : `dari ${limit.toLocaleString('id-ID')}`}
            />
            <MetricCard
              label='Sisa kuota AI'
              value={firstUsage?.aiEnabled === false ? 'AI off' : limit === null ? '∞' : Math.max(0, limit - used)}
              tone={firstUsage?.aiEnabled === false ? 'warning' : exhausted ? 'danger' : nearExhausted ? 'warning' : 'default'}
              sub={exhausted ? 'kuota habis — upgrade paket' : nearExhausted ? 'hampir habis' : undefined}
            />
            <MetricCard label='Paket tersedia' value={plans.data?.plans?.length ?? '—'} sub='siap dibeli' />
          </div>

          {(exhausted || nearExhausted || firstUsage?.aiEnabled === false) && (
            <Card className='border-amber-500/30 bg-amber-500/5'>
              <CardContent className='flex flex-wrap items-center justify-between gap-3 py-4'>
                <div className='space-y-0.5'>
                  <p className='text-sm font-medium'>
                    {firstUsage?.aiEnabled === false
                      ? 'Paket Anda tidak menyertakan AI'
                      : exhausted
                        ? 'Kuota AI Anda sudah habis'
                        : 'Kuota AI hampir habis'}
                  </p>
                  <p className='text-sm text-muted-foreground'>
                    {firstUsage?.aiEnabled === false
                      ? 'Upgrade ke paket dengan AI untuk mulai memakai fitur AI.'
                      : 'Upgrade paket untuk menambah kuota token lifetime.'}
                  </p>
                </div>
                <Button asChild size='sm'>
                  <Link to='/user/orders'>Upgrade paket</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Lisensi Anda</CardTitle>
              <CardDescription>Status dan masa berlaku.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-2'>
              {licenses.slice(0, 4).map((l) => {
                const st = statusOf(l)
                return (
                  <div key={l.id} className='flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0 last:pb-0'>
                    <div className='min-w-0'>
                      <p className='truncate font-mono text-xs text-muted-foreground'>{l.id}</p>
                      <p className='text-sm'>Berlaku s.d. {l.expiresAt ? new Date(l.expiresAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</p>
                    </div>
                    <StatusBadge tone={st === 'active' ? 'success' : st === 'expired' ? 'warning' : 'danger'}>
                      {st === 'active' ? 'aktif' : st === 'expired' ? 'kedaluwarsa' : 'dicabut'}
                    </StatusBadge>
                  </div>
                )
              })}
              {licenses.length > 4 && (
                <Button asChild variant='ghost' size='sm' className='px-0 text-primary'>
                  <Link to='/user/licenses'>Lihat semua lisensi →</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
