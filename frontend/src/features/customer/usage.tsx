import { useQuery } from '@tanstack/react-query'
import { fetchMe, fetchPlans } from '@/lib/grouter-api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

export function CustomerUsage() {
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe })
  const plans = useQuery({ queryKey: ['plans'], queryFn: fetchPlans })

  if (me.isLoading) return <Skeleton className='h-64' />

  const usage = me.data?.usage ?? []
  const planName = new Map((plans.data?.plans ?? []).map((p) => [p.key, p.name]))

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>Pemakaian AI</h1>
        <p className='text-muted-foreground text-sm'>
          Token & request tercatat server-side per lisensi (lifetime total).
        </p>
      </div>

      {usage.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Belum ada pemakaian AI</CardTitle>
            <CardDescription>
              Request AI pertama Anda akan tercatat di sini beserta pemakaian tokennya.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className='pt-6'>
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
                        {lic?.planKey ? planName.get(lic.planKey) ?? lic.planKey : '—'}
                        {u.aiEnabled === false && (
                          <Badge variant='outline' className='ml-2'>AI off</Badge>
                        )}
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>{(u.requestCount ?? 0).toLocaleString('id-ID')}</TableCell>
                      <TableCell className='text-right tabular-nums'>{used.toLocaleString('id-ID')}</TableCell>
                      <TableCell className='text-right'>
                        {u.aiEnabled === false ? (
                          <Badge variant='outline'>AI dimatikan di paket</Badge>
                        ) : limit === null ? (
                          <Badge>unlimited</Badge>
                        ) : exhausted ? (
                          <Badge variant='destructive'>kuota habis — upgrade paket</Badge>
                        ) : nearExhausted ? (
                          <Badge variant='secondary' className='text-amber-600 dark:text-amber-400'>
                            {remain!.toLocaleString('id-ID')} — hampir habis
                          </Badge>
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
      )}
    </div>
  )
}
