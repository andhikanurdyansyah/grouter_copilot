import { useQuery } from '@tanstack/react-query'
import { fetchInfraUsage } from '@/lib/grouter-api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

export function AdminUsage() {
  const usage = useQuery({ queryKey: ['admin-usage'], queryFn: fetchInfraUsage })

  if (usage.isLoading) return <Skeleton className='h-64' />
  const data = usage.data as { totals?: { model?: string; tokens?: number; requests?: number }[] } | undefined
  const rows = data?.totals ?? []

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>Usage Infrastruktur</h1>
        <p className='text-muted-foreground text-sm'>
          Pemakaian provider/gateway global — TERPISAH dari AI Ledger customer.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Total per model</CardTitle>
          <CardDescription>Agregat infrastruktur (semua lisensi digabung).</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead className='text-right'>Request</TableHead>
                <TableHead className='text-right'>Token</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={3} className='text-muted-foreground'>Belum ada data pemakaian infrastruktur.</TableCell></TableRow>
              ) : rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className='font-mono text-xs'>{r.model || '—'}</TableCell>
                  <TableCell className='text-right tabular-nums'>{(r.requests ?? 0).toLocaleString('id-ID')}</TableCell>
                  <TableCell className='text-right tabular-nums'>{(r.tokens ?? 0).toLocaleString('id-ID')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
