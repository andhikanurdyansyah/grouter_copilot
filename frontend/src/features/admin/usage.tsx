import { useQuery } from '@tanstack/react-query'
import { fetchInfraUsage } from '@/lib/grouter-api'
import { PageHeader } from '@/components/shared/page-header'
import { TableSkeleton, EmptyState, ErrorState } from '@/components/shared/data-states'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

export function AdminUsage() {
  const usage = useQuery({ queryKey: ['admin-usage'], queryFn: fetchInfraUsage })

  return (
    <div className='space-y-5'>
      <PageHeader
        title='Usage Infrastruktur'
        description='Pemakaian provider/gateway global — dimensi infrastruktur, terpisah dari AI Ledger customer.'
      />
      {usage.isPending ? (
        <TableSkeleton rows={4} cols={3} />
      ) : usage.isError ? (
        <ErrorState
          status={(usage.error as { response?: { status?: number } })?.response?.status}
          message={(usage.error as Error).message}
          onRetry={() => usage.refetch()}
        />
      ) : (
        (() => {
          const data = usage.data as { totals?: { model?: string; tokens?: number; requests?: number }[] } | undefined
          const rows = data?.totals ?? []
          return rows.length === 0 ? (
            <EmptyState title='Belum ada data pemakaian infrastruktur' description='Agregat per model muncul setelah ada request AI yang diproses gateway.' />
          ) : (
            <Card className='py-0'>
              <CardHeader className='pb-0'>
                <CardTitle className='text-base'>Total per model</CardTitle>
                <CardDescription>Agregat seluruh lisensi (bukan kuota customer).</CardDescription>
              </CardHeader>
              <CardContent className='px-0 pt-2'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Model</TableHead>
                      <TableHead className='text-right'>Request</TableHead>
                      <TableHead className='text-right'>Token</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, i) => (
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
          )
        })()
      )}
    </div>
  )
}
