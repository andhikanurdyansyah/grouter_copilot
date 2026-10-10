import { useQuery } from '@tanstack/react-query'
import { fetchMe, fetchPlans } from '@/lib/grouter-api'
import { PageHeader } from '@/components/shared/page-header'
import { StatusBadge } from '@/components/shared/status-badge'
import { TableSkeleton, EmptyState, ErrorState } from '@/components/shared/data-states'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Link } from '@tanstack/react-router'
import { ShieldOff, AlertTriangle, Zap } from 'lucide-react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

export function CustomerUsage() {
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe })
  const plans = useQuery({ queryKey: ['plans'], queryFn: fetchPlans })

  if (me.isPending) {
    return (
      <div className='space-y-5'>
        <PageHeader title='Pemakaian AI' description='Token & request tercatat server-side per lisensi.' />
        <TableSkeleton rows={3} cols={5} />
      </div>
    )
  }
  if (me.isError) {
    return (
      <div className='space-y-5'>
        <PageHeader title='Pemakaian AI' description='Token & request tercatat server-side per lisensi.' />
        <ErrorState
          status={(me.error as { response?: { status?: number } })?.response?.status}
          message={(me.error as Error).message}
          onRetry={() => me.refetch()}
        />
      </div>
    )
  }

  const usage = me.data?.usage ?? []
  const licenses = me.data?.licenses ?? []
  const planName = new Map((plans.data?.plans ?? []).map((p) => [p.key, p.name]))

  // Ambil lisensi utama (aktif dulu, fallback ke pertama)
  const activeLicense = licenses.find((l) => String(l.status ?? 'active') === 'active') ?? licenses[0]
  const primaryUsage = usage.find((u) => u.licenseId === activeLicense?.id) ?? usage[0]
  const limit = primaryUsage?.quotaLimit ?? null
  const used = primaryUsage?.usedTokens ?? 0
  const aiOff = primaryUsage?.aiEnabled === false
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const exhausted = limit !== null && used >= limit
  const near = limit !== null && !exhausted && pct >= 90

  return (
    <div className='space-y-5'>
      <PageHeader
        title='Pemakaian AI'
        description='Total token terpakai vs kuota lifetime lisensi — dihitung & diverifikasi server per request.'
      />

      {/* Lifetime info — selalu tampil */}
      <div className='flex items-start gap-3 rounded-lg border bg-muted/40 p-4' role='note'>
        <Zap className='mt-0.5 size-4 shrink-0 text-primary' aria-hidden />
        <p className='text-sm text-muted-foreground'>
          Kuota bersifat <strong className='text-foreground'>lifetime per lisensi</strong> — tidak direset bulanan.
          Token input + output diakumulasi server setiap request.
        </p>
      </div>

      {/* Banner status kuota */}
      {aiOff && (
        <div className='flex items-start gap-3 rounded-lg border border-slate-300 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40' role='status'>
          <ShieldOff className='mt-0.5 size-5 shrink-0 text-slate-500 dark:text-slate-400' aria-hidden />
          <div>
            <p className='text-sm font-medium'>Paket Anda tidak menyertakan AI</p>
            <p className='text-sm text-muted-foreground'>Perpanjang ke paket dengan AI untuk mengaktifkan fitur tersebut.</p>
          </div>
        </div>
      )}
      {!aiOff && exhausted && (
        <div className='flex flex-wrap items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-4' role='alert'>
          <AlertTriangle className='size-5 shrink-0 text-red-600 dark:text-red-400' aria-hidden />
          <div className='min-w-0 flex-1'>
            <p className='text-sm font-medium text-red-600 dark:text-red-400'>Kuota habis</p>
            <p className='text-sm text-muted-foreground'>Pekerjaan AI akan ditolak sampai Anda perpanjang paket.</p>
          </div>
          <Button asChild size='sm' variant='destructive'>
            <Link to='/user/orders'>Perpanjang paket</Link>
          </Button>
        </div>
      )}
      {!aiOff && near && !exhausted && (
        <div className='flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4' role='status'>
          <AlertTriangle className='size-5 shrink-0 text-amber-600 dark:text-amber-400' aria-hidden />
          <div className='min-w-0 flex-1'>
            <p className='text-sm font-medium text-amber-600 dark:text-amber-400'>Kuota hampir habis</p>
            <p className='text-sm text-muted-foreground'>Sisa {limit !== null ? (limit - used).toLocaleString('id-ID') : '—'} token.</p>
          </div>
          <Button asChild size='sm' variant='outline'>
            <Link to='/user/orders'>Perpanjang paket</Link>
          </Button>
        </div>
      )}

      {/* Progress kuota — tampil walau belum ada pemakaian */}
      {primaryUsage && (
        <Card>
          <CardContent className='p-5'>
            <div className='flex items-center justify-between text-sm'>
              <span className='font-medium'>Kuota AI</span>
              <span className='tabular-nums text-muted-foreground'>
                {used.toLocaleString('id-ID')} {limit !== null ? `/ ${limit.toLocaleString('id-ID')} token` : '(unlimited)'}
              </span>
            </div>
            {limit !== null ? (
              <>
                <div className='mt-2 h-2.5 overflow-hidden rounded-full bg-muted' role='progressbar' aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label='Pemakaian kuota AI'>
                  <div
                    className={'h-full rounded-full transition-colors ' + (exhausted ? 'bg-red-600' : near ? 'bg-amber-500' : 'bg-emerald-600')}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className='mt-2 text-sm text-muted-foreground'>
                  {used === 0
                    ? `0 dari ${limit.toLocaleString('id-ID')} token terpakai — kuota penuh.`
                    : exhausted
                      ? 'Kuota habis — pekerjaan AI akan ditolak sampai diperpanjang.'
                      : near
                        ? `Hampir habis — sisa ${(limit - used).toLocaleString('id-ID')} token.`
                        : `Tersisa ${(limit - used).toLocaleString('id-ID')} token.`}
                </p>
              </>
            ) : (
              <p className='mt-1 text-sm text-muted-foreground'>Paket unlimited — tidak ada batas token.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tabel riwayat pemakaian */}
      {usage.length === 0 ? (
        <EmptyState
          title={licenses.length > 0 ? 'Belum ada request AI tercatat untuk lisensi ini.' : 'Belum ada pemakaian AI'}
          description={licenses.length > 0
            ? 'Request AI pertama Anda akan tercatat di sini beserta pemakaian tokennya.'
            : 'Request AI pertama Anda akan tercatat di sini beserta pemakaian tokennya.'}
          action={
            <Button asChild variant='outline' size='sm'>
              <Link to='/user/install'>Buka panduan instalasi</Link>
            </Button>
          }
        />
      ) : (
        <Card className='py-0'>
          <CardContent className='px-0'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>License</TableHead>
                  <TableHead className='hidden md:table-cell'>Paket</TableHead>
                  <TableHead className='text-right'>Request</TableHead>
                  <TableHead className='text-right'>Token terpakai</TableHead>
                  <TableHead className='text-right'>Sisa kuota</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usage.map((u) => {
                  const uLimit = u.quotaLimit ?? null
                  const uUsed = u.usedTokens ?? 0
                  const uRemain = uLimit === null ? null : Math.max(0, uLimit - uUsed)
                  const uExhausted = uRemain === 0
                  const uNear = uRemain !== null && !uExhausted && uLimit !== null && uUsed / uLimit >= 0.9
                  const lic = licenses.find((l) => l.id === u.licenseId)
                  return (
                    <TableRow key={u.licenseId}>
                      <TableCell className='font-mono text-xs'>{u.licenseId}</TableCell>
                      <TableCell className='hidden md:table-cell text-sm'>
                        {lic?.planKey ? (planName.get(lic.planKey) ?? lic.planKey) : '—'}
                        {u.aiEnabled === false && <StatusBadge tone='warning' className='ml-2'>AI off</StatusBadge>}
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>{(u.requestCount ?? 0).toLocaleString('id-ID')}</TableCell>
                      <TableCell className='text-right tabular-nums'>{uUsed.toLocaleString('id-ID')}</TableCell>
                      <TableCell className='text-right'>
                        {u.aiEnabled === false ? (
                          <StatusBadge tone='warning'>AI dimatikan di paket</StatusBadge>
                        ) : uLimit === null ? (
                          <StatusBadge tone='info'>unlimited</StatusBadge>
                        ) : uExhausted ? (
                          <StatusBadge tone='danger'>kuota habis — upgrade paket</StatusBadge>
                        ) : uNear ? (
                          <StatusBadge tone='warning'>{uRemain!.toLocaleString('id-ID')} — hampir habis</StatusBadge>
                        ) : (
                          <span className='tabular-nums text-sm'>{uRemain!.toLocaleString('id-ID')}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Cara perhitungan kuota */}
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Cara perhitungan kuota</CardTitle>
          <CardDescription>Transparansi perhitungan.</CardDescription>
        </CardHeader>
        <CardContent className='text-sm space-y-2 text-muted-foreground'>
          <p>
            Kuota AI bersifat <strong className='text-foreground'>lifetime per lisensi</strong>: total
            token input + output diakumulasi server setiap request, bukan direset per bulan.
          </p>
          <p>
            Setiap request divalidasi server — token dihitung dari respons provider, bukan dari
            laporan browser. Request yang ditolak (mis. model tidak ada di allowlist paket)
            tidak memotong kuota Anda.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
