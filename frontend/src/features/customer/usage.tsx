import { useQuery } from '@tanstack/react-query'
import { fetchMe, fetchPlans } from '@/lib/grouter-api'
import { PageHeader } from '@/components/shared/page-header'
import { StatusBadge } from '@/components/shared/status-badge'
import { TableSkeleton, EmptyState, ErrorState } from '@/components/shared/data-states'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
  const planName = new Map((plans.data?.plans ?? []).map((p) => [p.key, p.name]))

  return (
    <div className='space-y-5'>
      <PageHeader
        title='Pemakaian AI'
        description='Total token terpakai vs kuota lifetime lisensi — dihitung & diverifikasi server per request.'
      />

      {usage.length === 0 ? (
        <EmptyState
          title='Belum ada pemakaian AI'
          description='Request AI pertama Anda akan tercatat di sini beserta pemakaian tokennya.'
        />
      ) : (
        <>
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
                    const limit = u.quotaLimit ?? null
                    const used = u.usedTokens ?? 0
                    const remain = limit === null ? null : Math.max(0, limit - used)
                    const exhausted = remain === 0
                    const nearExhausted = remain !== null && !exhausted && limit !== null && used / limit >= 0.9
                    const lic = me.data?.licenses.find((l) => l.id === u.licenseId)
                    return (
                      <TableRow key={u.licenseId}>
                        <TableCell className='font-mono text-xs'>{u.licenseId}</TableCell>
                        <TableCell className='hidden md:table-cell text-sm'>
                          {lic?.planKey ? (planName.get(lic.planKey) ?? lic.planKey) : '—'}
                          {u.aiEnabled === false && <StatusBadge tone='warning' className='ml-2'>AI off</StatusBadge>}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>{(u.requestCount ?? 0).toLocaleString('id-ID')}</TableCell>
                        <TableCell className='text-right tabular-nums'>{used.toLocaleString('id-ID')}</TableCell>
                        <TableCell className='text-right'>
                          {u.aiEnabled === false ? (
                            <StatusBadge tone='warning'>AI dimatikan di paket</StatusBadge>
                          ) : limit === null ? (
                            <StatusBadge tone='info'>unlimited</StatusBadge>
                          ) : exhausted ? (
                            <StatusBadge tone='danger'>kuota habis — upgrade paket</StatusBadge>
                          ) : nearExhausted ? (
                            <StatusBadge tone='warning'>{remain!.toLocaleString('id-ID')} — hampir habis</StatusBadge>
                          ) : (
                            <span className='tabular-nums text-sm'>{remain!.toLocaleString('id-ID')}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

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
        </>
      )}
    </div>
  )
}
