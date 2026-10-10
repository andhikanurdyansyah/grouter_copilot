import { useQuery } from '@tanstack/react-query'
import { fetchInfraUsage } from '@/lib/grouter-api'
import { PageHeader } from '@/components/shared/page-header'
import { StatusBadge } from '@/components/shared/status-badge'
import { TableSkeleton, EmptyState, ErrorState } from '@/components/shared/data-states'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Link } from '@tanstack/react-router'
import { RefreshCw } from 'lucide-react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

export function AdminUsage() {
  const usage = useQuery({ queryKey: ['admin-usage'], queryFn: fetchInfraUsage })

  return (
    <div className='space-y-5'>
      <PageHeader
        title='Usage Provider'
        description='Dimensi infrastruktur upstream: agregat pemakaian provider/gateway di seluruh lisensi. Terpisah dari AI Ledger yang mencatat konsumsi per customer.'
      >
        <Button
          variant='outline'
          size='sm'
          onClick={() => usage.refetch()}
          disabled={usage.isFetching}
          aria-label='Muat ulang data pemakaian provider'
        >
          <RefreshCw className={usage.isFetching ? 'size-3.5 animate-spin' : 'size-3.5'} /> Muat ulang
        </Button>
        <Button asChild variant='outline' size='sm'>
          <Link to='/admin/ledger'>Buka AI Ledger</Link>
        </Button>
      </PageHeader>
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
            <EmptyState
              title='Belum ada data pemakaian provider'
              description='Di sini akan muncul agregat per model (jumlah request dan token) dari seluruh request AI yang diproses gateway. Data mulai terisi setelah ada customer yang memakai fitur AI. Ini dimensi infrastruktur — konsumsi per customer dicatat terpisah di AI Ledger.'
              action={
                <Button asChild variant='outline' size='sm'>
                  <Link to='/admin/ledger'>Lihat AI Ledger customer</Link>
                </Button>
              }
            />
          ) : (
            <Card className='py-0'>
              <CardHeader className='flex-row items-center justify-between gap-3 space-y-0 pb-0'>
                <div className='space-y-1'>
                  <div className='flex items-center gap-2.5'>
                    <CardTitle className='text-base'>Total per model</CardTitle>
                    <StatusBadge tone='info'>Dimensi infrastruktur — bukan kuota customer</StatusBadge>
                  </div>
                  <CardDescription>
                    Agregat seluruh lisensi · diperbarui{' '}
                    {usage.dataUpdatedAt
                      ? new Date(usage.dataUpdatedAt).toLocaleTimeString('id-ID')
                      : '—'}
                  </CardDescription>
                </div>
                <Button
                  variant='outline'
                  size='icon'
                  className='size-8'
                  onClick={() => usage.refetch()}
                  disabled={usage.isFetching}
                  aria-label='Muat ulang data pemakaian provider'
                >
                  <RefreshCw className={usage.isFetching ? 'size-3.5 animate-spin' : 'size-3.5'} />
                </Button>
              </CardHeader>
              <CardContent className='px-0 pt-2' aria-busy={usage.isFetching}>
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
