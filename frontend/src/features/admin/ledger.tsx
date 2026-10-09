import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { fetchLedger, fmtDate } from '@/lib/grouter-api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
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
    <div className='space-y-6'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>AI Ledger</h1>
        <p className='text-muted-foreground text-sm'>
          Pemakaian AI customer — dihitung & diverifikasi server (bukan dimensi infrastruktur).
        </p>
      </div>

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

      {ledger.isLoading ? (
        <Skeleton className='h-64' />
      ) : (
        <Card>
          <CardContent className='pt-6'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu</TableHead>
                  <TableHead className='hidden md:table-cell'>Customer</TableHead>
                  <TableHead className='hidden lg:table-cell'>Model</TableHead>
                  <TableHead className='text-right'>Token</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className='hidden xl:table-cell'>Alasan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className='text-muted-foreground'>Tidak ada entri ledger.</TableCell></TableRow>
                ) : rows.map((e, i) => {
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
                      <TableCell className='hidden md:table-cell text-sm'>{ev.customer || '—'}</TableCell>
                      <TableCell className='hidden lg:table-cell font-mono text-xs'>{ev.model || '—'}</TableCell>
                      <TableCell className='text-right tabular-nums'>{typeof ev.totalTokens === 'number' ? ev.totalTokens.toLocaleString('id-ID') : '—'}</TableCell>
                      <TableCell>
                        <Badge variant={ok ? 'default' : 'destructive'}>{ok ? 'sukses' : (ev.errorClassification || ev.status || 'ditolak')}</Badge>
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
