import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchAdminOrders, settleOrder, formatIDR, fmtDate } from '@/lib/grouter-api'
import { PageHeader } from '@/components/shared/page-header'
import { StatusBadge, orderTone } from '@/components/shared/status-badge'
import { TableSkeleton, EmptyState, ErrorState } from '@/components/shared/data-states'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { RefreshCw, Copy, Check, Loader2 } from 'lucide-react'

type OrderRow = {
  id: string
  packageKey?: string
  planName?: string | null
  quota?: string | null
  customer?: string | null
  email?: string | null
  amount?: number
  status?: string
  createdAt?: number | string
  paidAt?: number | string | null
}

// Filter status → nilai server (case-insensitive)
const STATUS_FILTERS: { key: string; label: string; match: string[] }[] = [
  { key: 'all', label: 'Semua', match: [] },
  { key: 'pending', label: 'Menunggu', match: ['PENDING'] },
  { key: 'paid', label: 'Lunas', match: ['PAID', 'SETTLED', 'SUCCESS'] },
  { key: 'failed', label: 'Gagal', match: ['FAILED', 'EXPIRED'] },
  { key: 'cancelled', label: 'Dibatalkan', match: ['CANCELLED', 'CANCELED'] },
]

function statusLabel(st: string): string {
  switch (st.toUpperCase()) {
    case 'PENDING': return 'menunggu'
    case 'PAID': return 'lunas'
    case 'FAILED': return 'gagal'
    case 'EXPIRED': return 'kedaluwarsa'
    case 'CANCELLED':
    case 'CANCELED': return 'dibatalkan'
    default: return st.toLowerCase()
  }
}

function countByStatus(rows: OrderRow[], match: string[]): number {
  return rows.filter((o) => match.includes(String(o.status || '').toUpperCase())).length
}

// Tombol copy Order ID — feedback "Tersalin" 1,5 detik
function CopyIdButton({ id }: { id: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <span className='inline-flex items-center gap-1'>
      <span className='max-w-40 truncate md:max-w-none'>{id}</span>
      <Button
        variant='ghost'
        size='icon'
        className='size-6 shrink-0'
        aria-label={`Salin Order ID ${id}`}
        onClick={() => {
          void navigator.clipboard.writeText(id)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? (
          <Check className='size-3.5 text-emerald-600 dark:text-emerald-400' aria-hidden />
        ) : (
          <Copy className='size-3.5' aria-hidden />
        )}
      </Button>
      <span role='status' aria-live='polite' className='sr-only'>
        {copied ? 'Tersalin' : ''}
      </span>
      {copied && (
        <span className='text-xs text-emerald-600 dark:text-emerald-400' aria-hidden>Tersalin</span>
      )}
    </span>
  )
}

export function AdminOrders() {
  const qc = useQueryClient()
  const orders = useQuery({ queryKey: ['admin-orders'], queryFn: () => fetchAdminOrders(100) })
  const [target, setTarget] = useState<{ id: string; amount: number | null } | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const settle = useMutation({
    mutationFn: (orderId: string) => settleOrder(orderId),
    onSuccess: (data, orderId) => {
      toast.success(
        `Lunas terverifikasi — lisensi diterbitkan${data.licenseId ? ` (${data.licenseId})` : ''}`,
        { description: `Order ${orderId} settle. Status dikonfirmasi ulang oleh server.` },
      )
      qc.invalidateQueries({ queryKey: ['admin-orders'] })
    },
    onError: (e, orderId) => {
      const err = e as { response?: { status?: number; data?: { error?: string } } }
      let msg = err?.response?.data?.error || 'permintaan ditolak server'
      if (err?.response?.status === 409) msg = 'pembayaran belum terverifikasi di KlikQRIS — lisensi tidak diterbitkan'
      if (err?.response?.status === 502) msg = 'server gagal memeriksa status ke upstream KlikQRIS — coba lagi nanti'
      toast.error(`Settle ${orderId} gagal`, { description: msg })
    },
  })

  const allRows = useMemo(
    () => (orders.data?.orders ?? []) as OrderRow[],
    [orders.data],
  )

  // Ringkasan status dihitung dari SEMUA data yang di-fetch (bukan hasil filter)
  const summary = useMemo(
    () => ({
      pending: countByStatus(allRows, ['PENDING']),
      paid: countByStatus(allRows, ['PAID', 'SETTLED', 'SUCCESS']),
      failed: countByStatus(allRows, ['FAILED', 'EXPIRED']),
      cancelled: countByStatus(allRows, ['CANCELLED', 'CANCELED']),
    }),
    [allRows],
  )

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const f = STATUS_FILTERS.find((s) => s.key === statusFilter) ?? STATUS_FILTERS[0]
    return allRows.filter((o) => {
      if (f.match.length > 0 && !f.match.includes(String(o.status || '').toUpperCase())) return false
      if (!q) return true
      const hay = [o.id, o.planName, o.packageKey, o.customer, o.email]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [allRows, search, statusFilter])

  if (orders.isPending) {
    return (
      <div className='space-y-5'>
        <PageHeader title='Orders & Pembayaran' description='Status pembayaran server-side. Settlement selalu re-verify ke KlikQRIS upstream.' />
        <TableSkeleton rows={6} cols={6} />
      </div>
    )
  }
  if (orders.isError) {
    return (
      <div className='space-y-5'>
        <PageHeader title='Orders & Pembayaran' description='Status pembayaran server-side.' />
        <ErrorState
          status={(orders.error as { response?: { status?: number } })?.response?.status}
          message={(orders.error as Error).message}
          onRetry={() => orders.refetch()}
        />
      </div>
    )
  }

  return (
    <div className='space-y-5'>
      <PageHeader
        title='Orders & Pembayaran'
        description='Status pembayaran server-side. Settle selalu re-verify status ke KlikQRIS upstream sebelum lisensi diterbitkan.'
      >
        <Button variant='outline' size='sm' onClick={() => orders.refetch()}>
          <RefreshCw className='size-3.5' /> Muat ulang
        </Button>
      </PageHeader>

      {/* Ringkasan status — chip kompak satu baris */}
      <div className='flex flex-wrap items-center gap-2' role='status' aria-label='Ringkasan status order'>
        <StatusBadge tone='warning'>Menunggu {summary.pending.toLocaleString('id-ID')}</StatusBadge>
        <StatusBadge tone='success'>Lunas {summary.paid.toLocaleString('id-ID')}</StatusBadge>
        <StatusBadge tone='danger'>Gagal {summary.failed.toLocaleString('id-ID')}</StatusBadge>
        <StatusBadge tone='neutral'>Dibatalkan {summary.cancelled.toLocaleString('id-ID')}</StatusBadge>
      </div>

      {/* Toolbar: search + filter status (client-side) */}
      <div className='flex flex-wrap items-center gap-2'>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder='Cari Order ID / paket / customer…'
          className='w-64'
          aria-label='Cari order'
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className='w-40' aria-label='Filter status order'>
            <SelectValue placeholder='Semua status' />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((s) => (
              <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(search || statusFilter !== 'all') && (
          <p className='text-xs text-muted-foreground' role='status'>
            {rows.length.toLocaleString('id-ID')} dari {allRows.length.toLocaleString('id-ID')} order
          </p>
        )}
      </div>

      {allRows.length === 0 ? (
        <EmptyState title='Belum ada order' description='Order muncul otomatis saat customer memulai checkout.' />
      ) : rows.length === 0 ? (
        <EmptyState
          title='Tidak ada order yang cocok'
          description='Coba ubah kata kunci pencarian atau filter status.'
          action={
            <Button variant='outline' size='sm' onClick={() => { setSearch(''); setStatusFilter('all') }}>
              Bersihkan filter
            </Button>
          }
        />
      ) : (
        <Card className='py-0'>
          <CardContent className='px-0'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead className='hidden md:table-cell'>Paket</TableHead>
                  <TableHead className='text-right'>Nominal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className='hidden lg:table-cell'>Dibuat</TableHead>
                  <TableHead className='hidden xl:table-cell'>Dibayar</TableHead>
                  <TableHead className='text-right'>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((o) => {
                  const st = String(o.status || '—')
                  const pending = st.toUpperCase() === 'PENDING'
                  const settling = settle.isPending && settle.variables === o.id
                  return (
                    <TableRow key={o.id}>
                      <TableCell className='font-mono text-xs'>
                        <CopyIdButton id={o.id} />
                      </TableCell>
                      <TableCell className='hidden md:table-cell text-sm'>
                        {o.planName || o.packageKey || <span className='text-muted-foreground'>—</span>}
                        {o.quota && <span className='block text-xs text-muted-foreground'>{o.quota}</span>}
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>{formatIDR(o.amount)}</TableCell>
                      <TableCell>
                        <StatusBadge tone={orderTone(st)}>{statusLabel(st)}</StatusBadge>
                      </TableCell>
                      <TableCell className='hidden lg:table-cell text-sm whitespace-nowrap'>{fmtDate(o.createdAt)}</TableCell>
                      <TableCell className='hidden xl:table-cell text-sm whitespace-nowrap'>{fmtDate(o.paidAt)}</TableCell>
                      <TableCell className='text-right'>
                        {pending ? (
                          <Button
                            size='sm'
                            variant='outline'
                            disabled={settle.isPending}
                            onClick={() => setTarget({ id: o.id, amount: o.amount ?? null })}
                          >
                            {settling ? (
                              <>
                                <Loader2 className='size-3.5 animate-spin' aria-hidden />
                                Memverifikasi ke upstream…
                              </>
                            ) : (
                              'Verifikasi & settle'
                            )}
                          </Button>
                        ) : (
                          <span className='text-muted-foreground text-xs'>—</span>
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

      <AlertDialog open={!!target} onOpenChange={(v) => !v && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Verifikasi & settle {target?.id}?</AlertDialogTitle>
            <AlertDialogDescription>
              Server akan memeriksa ulang status pembayaran langsung ke KlikQRIS
              upstream{target?.amount ? ` (${formatIDR(target.amount)})` : ''}. Lisensi
              diterbitkan otomatis <strong>hanya jika</strong> pembayaran terverifikasi
              lunas; jika belum dibayar, permintaan ditolak dengan aman dan tidak ada
              perubahan apa pun.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (target) settle.mutate(target.id); setTarget(null) }}>
              Verifikasi & settle
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
