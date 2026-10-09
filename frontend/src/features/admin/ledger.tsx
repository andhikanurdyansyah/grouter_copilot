import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { fetchLedger, fmtDate } from '@/lib/grouter-api'
import { PageHeader } from '@/components/shared/page-header'
import { StatusBadge } from '@/components/shared/status-badge'
import { TableSkeleton, EmptyState, ErrorState } from '@/components/shared/data-states'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

const PAGE = 50

export function AdminLedger() {
  const [f, setF] = useState({ customer: '', status: '', model: '', licenseId: '' })
  const [page, setPage] = useState(0)

  const ledger = useQuery({
    queryKey: ['admin-ledger', f, page],
    queryFn: () => fetchLedger({ ...f, limit: PAGE, offset: page * PAGE }),
    placeholderData: keepPreviousData,
  })

  const total = ledger.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE))
  const rows = (ledger.data?.records ?? []) as Record<string, unknown>[]

  return (
    <div className='space-y-5'>
      <PageHeader
        title='AI Ledger'
        description='Pemakaian AI customer — dihitung & diverifikasi server per request (kuota lifetime per lisensi).'
      />

      <div className='flex flex-wrap items-center gap-2'>
        <Input
          value={f.customer} onChange={(e) => { setF({ ...f, customer: e.target.value }); setPage(0) }}
          placeholder='Customer' className='w-44' aria-label='Filter customer'
        />
        <Select value={f.status || 'all'} onValueChange={(v) => { setF({ ...f, status: v === 'all' ? '' : v }); setPage(0) }}>
          <SelectTrigger className='w-36' aria-label='Filter status'><SelectValue placeholder='Semua status' /></SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>Semua status</SelectItem>
            <SelectItem value='success'>Sukses</SelectItem>
            <SelectItem value='rejected'>Ditolak</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={f.model} onChange={(e) => { setF({ ...f, model: e.target.value }); setPage(0) }}
          placeholder='Model' className='w-44' aria-label='Filter model'
        />
        <Input
          value={f.licenseId} onChange={(e) => { setF({ ...f, licenseId: e.target.value }); setPage(0) }}
          placeholder='License ID' className='w-52 font-mono text-xs' aria-label='Filter license ID'
        />
      </div>

      {ledger.isPending ? (
        <TableSkeleton rows={8} cols={6} />
      ) : ledger.isError ? (
        <ErrorState
          status={(ledger.error as { response?: { status?: number } })?.response?.status}
          message={(ledger.error as Error).message}
          onRetry={() => ledger.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState title='Tidak ada entri ledger' description='Belum ada request AI yang tercatat untuk filter ini.' />
      ) : (
        <Card className='py-0'>
          <CardContent className='px-0'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu</TableHead>
                  <TableHead className='hidden md:table-cell'>Customer</TableHead>
                  <TableHead className='hidden lg:table-cell'>Model</TableHead>
                  <TableHead className='text-right'>Token</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className='hidden xl:table-cell'>License</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e, i) => {
                  const ev = e as {
                    createdAt?: number
                    customer?: string
                    model?: string | null
                    totalTokens?: number | null
                    status?: string
                    errorClassification?: string | null
                    licenseId?: string
                  }
                  const ok = ev.status === 'success'
                  const created = ev.createdAt ? new Date(ev.createdAt).toISOString() : undefined
                  return (
                    <TableRow key={i}>
                      <TableCell className='whitespace-nowrap text-sm'>{fmtDate(created)}</TableCell>
                      <TableCell className='hidden md:table-cell text-sm'>{ev.customer || <span className='text-muted-foreground'>—</span>}</TableCell>
                      <TableCell className='hidden lg:table-cell font-mono text-xs'>{ev.model || <span className='text-muted-foreground'>—</span>}</TableCell>
                      <TableCell className='text-right tabular-nums'>
                        {typeof ev.totalTokens === 'number' ? ev.totalTokens.toLocaleString('id-ID') : <span className='text-muted-foreground'>—</span>}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={ok ? 'success' : 'danger'}>
                          {ok ? 'sukses' : (ev.errorClassification || ev.status || 'ditolak')}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className='hidden xl:table-cell font-mono text-xs text-muted-foreground'>{ev.licenseId || '—'}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className='flex items-center justify-between'>
        <p className='text-sm text-muted-foreground' aria-live='polite'>
          {total.toLocaleString('id-ID')} entri — halaman {page + 1}/{pages}
        </p>
        <div className='flex gap-2'>
          <Button variant='outline' size='sm' disabled={page === 0} onClick={() => setPage(page - 1)}>← Sebelumnya</Button>
          <Button variant='outline' size='sm' disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Berikutnya →</Button>
        </div>
      </div>
    </div>
  )
}
