import { useQuery } from '@tanstack/react-query'
import { fetchAdminStats, fetchHealth } from '@/lib/grouter-api'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { KeyRound, ReceiptText, Activity, ShieldCheck, ShieldAlert } from 'lucide-react'

export function AdminOverview() {
  const stats = useQuery({ queryKey: ['admin-stats'], queryFn: fetchAdminStats })
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, refetchInterval: 60_000 })

  if (stats.isLoading) return <Skeleton className='h-64' />
  if (stats.error) {
    const status = (stats.error as { response?: { status?: number } })?.response?.status
    return (
      <Alert variant='destructive'>
        <ShieldAlert className='size-4' />
        <AlertTitle>{status === 401 ? 'Sesi admin tidak valid' : 'Gagal memuat statistik'}</AlertTitle>
        <AlertDescription>
          {status === 401
            ? 'Token admin tidak ada atau salah. Masukkan token admin untuk melanjutkan.'
            : (stats.error as Error).message}
        </AlertDescription>
      </Alert>
    )
  }

  const s = stats.data as Record<string, number> | undefined
  const num = (k: string) => (s && typeof s[k] === 'number' ? s[k].toLocaleString('id-ID') : '—')

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>Ringkasan Operasional</h1>
        <p className='text-muted-foreground text-sm'>
          Status lisensi, pembayaran, dan infrastruktur — data langsung dari backend.
        </p>
      </div>

      <div className='grid gap-4 md:grid-cols-4'>
        <Card>
          <CardHeader className='pb-2'>
            <CardDescription className='flex items-center gap-1.5'><KeyRound className='size-3.5' /> Lisensi</CardDescription>
            <CardTitle className='text-3xl tabular-nums'>{num('totalLicenses')}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardDescription className='flex items-center gap-1.5'><ShieldCheck className='size-3.5' /> Aktif</CardDescription>
            <CardTitle className='text-3xl tabular-nums'>{num('activeLicenses')}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardDescription className='flex items-center gap-1.5'><ReceiptText className='size-3.5' /> Dicabut</CardDescription>
            <CardTitle className='text-3xl tabular-nums'>{num('revokedLicenses')}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardDescription className='flex items-center gap-1.5'><Activity className='size-3.5' /> Backend</CardDescription>
            <CardTitle className='text-lg tabular-nums'>
              {health.isError ? (
                <span className='text-destructive'>tak terjangkau</span>
              ) : (
                <span className='text-primary'>sehat</span>
              )}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Catatan operasional</CardTitle>
          <CardDescription>
            Pemakaian customer (AI Ledger) dan pemakaian infrastruktur (Usage) adalah dua
            dimensi terpisah — tidak pernah dijumlahkan.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
