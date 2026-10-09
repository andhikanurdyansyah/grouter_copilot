import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchAdminOrders, settleOrder, formatIDR, fmtDate } from '@/lib/grouter-api'
import { PageHeader } from '@/components/shared/page-header'
import { StatusBadge, orderTone } from '@/components/shared/status-badge'
import { TableSkeleton, EmptyState, ErrorState } from '@/components/shared/data-states'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { RefreshCw } from 'lucide-react'

export function AdminOrders() {
  const qc = useQueryClient()
  const orders = useQuery({ queryKey: ['admin-orders'], queryFn: () => fetchAdminOrders(100) })
  const [target, setTarget] = useState<{ id: string; amount: number | null } | null>(null)

  const settle = useMutation({
    mutationFn: (orderId: string) => settleOrder(orderId),
    onSuccess: (data, orderId) => {
      toast.success('Order ' + orderId + ' settled' + (data.licenseId ? ' — lisensi ' + data.licenseId : ''))
      qc.invalidateQueries({ queryKey: ['admin-orders'] })
    },
    onError: (e, orderId) => {
      const err = e as { response?: { status?: number; data?: { error?: string } } }
      let msg = err?.response?.data?.error || 'gagal'
      if (err?.response?.status === 409) msg = 'pembayaran belum terverifikasi upstream'
      if (err?.response?.status === 502) msg = 'gagal memeriksa status upstream'
      toast.error('Settle ' + orderId + ' gagal: ' + msg)
    },
  })

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

  const rows = orders.data.orders as { id: string; packageKey?: string; planName?: string | null; quota?: string | null; amount?: number; status?: string; createdAt?: number | string; paidAt?: number | string | null }[]

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

      {rows.length === 0 ? (
        <EmptyState title='Belum ada order' description='Order muncul otomatis saat customer memulai checkout.' />
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
                  return (
                    <TableRow key={o.id}>
                      <TableCell className='font-mono text-xs'>{o.id}</TableCell>
                      <TableCell className='hidden md:table-cell text-sm'>
                        {o.planName || o.packageKey || <span className='text-muted-foreground'>—</span>}
                        {o.quota && <span className='block text-xs text-muted-foreground'>{o.quota}</span>}
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>{formatIDR(o.amount)}</TableCell>
                      <TableCell>
                        <StatusBadge tone={orderTone(st)}>{st.toLowerCase()}</StatusBadge>
                      </TableCell>
                      <TableCell className='hidden lg:table-cell text-sm whitespace-nowrap'>{fmtDate(o.createdAt)}</TableCell>
                      <TableCell className='hidden xl:table-cell text-sm whitespace-nowrap'>{fmtDate(o.paidAt)}</TableCell>
                      <TableCell className='text-right'>
                        {pending ? (
                          <Button size='sm' variant='outline' onClick={() => setTarget({ id: o.id, amount: o.amount ?? null })}>
                            Verifikasi & settle
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
              Server akan memeriksa status pembayaran ke KlikQRIS upstream{target?.amount ? ` (Rp ${target.amount.toLocaleString('id-ID')})` : ''}.
              Lisensi hanya diterbitkan jika pembayaran terverifikasi; jika belum, permintaan
              ditolak dengan aman.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (target) settle.mutate(target.id); setTarget(null) }}>
              Verifikasi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
