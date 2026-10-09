import { useQuery } from '@tanstack/react-query'
import { fetchMe, fetchPlans } from '@/lib/grouter-api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { KeyRound, Activity, ReceiptText, ShieldAlert } from 'lucide-react'
import { Link } from '@tanstack/react-router'

function statusOf(l: { status?: string; expiresAt?: string }): string {
  if (l.status) return String(l.status)
  if (l.expiresAt && new Date(l.expiresAt).getTime() < Date.now()) return 'expired'
  return 'active'
}

export function CustomerOverview() {
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe })
  const plans = useQuery({ queryKey: ['plans'], queryFn: fetchPlans })

  if (me.isLoading) {
    return (
      <div className='grid gap-4 md:grid-cols-2'>
        <Skeleton className='h-32' />
        <Skeleton className='h-32' />
        <Skeleton className='h-48 md:col-span-2' />
      </div>
    )
  }
  if (me.error) {
    return (
      <Alert variant='destructive'>
        <ShieldAlert className='size-4' />
        <AlertTitle>Gagal memuat akun</AlertTitle>
        <AlertDescription>
          {(me.error as Error).message} — coba muat ulang halaman.
        </AlertDescription>
      </Alert>
    )
  }

  const { account, licenses, usage } = me.data!
  const activeLicenses = licenses.filter((l) => statusOf(l) === 'active')

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>Selamat datang, {account.name}</h1>
        <p className='text-muted-foreground text-sm'>
          Ringkasan lisensi, AI, dan pembelian Anda.
        </p>
      </div>

      {licenses.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Belum ada lisensi</CardTitle>
            <CardDescription>
              Beli paket untuk mulai menggunakan gRouter Copilot. Lisensi terbit otomatis
              setelah pembayaran terverifikasi.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to='/user/orders'>Lihat paket & beli</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {licenses.length > 0 && (
        <div className='grid gap-4 md:grid-cols-3'>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription className='flex items-center gap-1.5'>
                <KeyRound className='size-3.5' /> Lisensi aktif
              </CardDescription>
              <CardTitle className='text-3xl tabular-nums'>
                {activeLicenses.length}
                <span className='text-base font-normal text-muted-foreground'>
                  {' '}/ {licenses.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button asChild variant='ghost' size='sm' className='px-0 text-primary'>
                <Link to='/user/licenses'>Kelola lisensi →</Link>
              </Button>
            </CardContent>
          </Card>

          {usage.slice(0, 1).map((u) => {
            const limit = u.quotaLimit ?? null
            const used = u.usedTokens ?? 0
            const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0
            const exhausted = limit !== null && used >= limit
            return (
              <Card key={u.licenseId}>
                <CardHeader className='pb-2'>
                  <CardDescription className='flex items-center gap-1.5'>
                    <Activity className='size-3.5' /> Pemakaian AI
                  </CardDescription>
                  <CardTitle className='text-3xl tabular-nums'>
                    {used.toLocaleString('id-ID')}
                    <span className='text-base font-normal text-muted-foreground'>
                      {' '}/ {limit === null || limit === undefined ? '∞' : limit.toLocaleString('id-ID') + ' tok'}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className='space-y-2'>
                  {limit !== null && (
                    <div className='h-2 rounded-full bg-muted overflow-hidden'>
                      <div
                        className={'h-full ' + (exhausted || pct >= 90 ? 'bg-destructive' : pct >= 75 ? 'bg-amber-500' : 'bg-primary')}
                        style={{ width: pct + '%' }}
                      />
                    </div>
                  )}
                  {u.aiEnabled === false && (
                    <Badge variant='outline'>AI dimatikan di paket</Badge>
                  )}
                  {exhausted && <Badge variant='destructive'>Kuota habis — upgrade paket</Badge>}
                  <Button asChild variant='ghost' size='sm' className='px-0 text-primary'>
                    <Link to='/user/usage'>Detail pemakaian →</Link>
                  </Button>
                </CardContent>
              </Card>
            )
          })}

          <Card>
            <CardHeader className='pb-2'>
              <CardDescription className='flex items-center gap-1.5'>
                <ReceiptText className='size-3.5' /> Paket tersedia
              </CardDescription>
              <CardTitle className='text-3xl tabular-nums'>
                {plans.data?.plans?.length ?? '—'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button asChild variant='ghost' size='sm' className='px-0 text-primary'>
                <Link to='/user/orders'>Beli / perpanjang →</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
