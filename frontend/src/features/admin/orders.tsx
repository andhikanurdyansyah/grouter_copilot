import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchAdminOrders, settleOrder, formatIDR, fmtDate } from '@/lib/grouter-api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useState } from 'react'

export function AdminOrders() {
  const qc = useQueryClient()
  const orders = useQuery({ queryKey: ['admin-orders'], queryFn: () => fetchAdminOrders(100) })
  const [target, setTarget] = useState<string | null>(null)

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

  if (orders.isLoading) return <Skeleton className='h-64' />
  const rows = orders.data?.orders ?? []

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>Orders & Pembayaran</h1>
        <p className='text-muted-foreground text-sm'>
          Status pembayaran server-side. Settle selalu re-verify status ke KlikQRIS upstream.
        </p>
      </div>

      <Card>
        <CardContent className='pt-6'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead className='hidden md:table-cell'>Paket</TableHead>
                <TableHead className='text-right'>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className='hidden lg:table-cell'>Dibuat</TableHead>
                <TableHead className='hidden lg:table-cell'>Dibayar</TableHead>
                <TableHead className='text-right'>Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className='text-muted-foreground'>Belum ada order.</TableCell>
                </TableRow>
              ) : rows.map((o) => {
                const ord = o as { id: string; packageKey?: string; amount?: number; status?: string; createdAt?: string; paidAt?: string }
                const st = String(ord.status || '—')
                const pending = st === 'PENDING'
                return (
                  <TableRow key={ord.id}>
                    <TableCell className='font-mono text-xs'>{ord.id}</TableCell>
                    <TableCell className='hidden md:table-cell text-sm'>{ord.packageKey || '—'}</TableCell>
                    <TableCell className='text-right tabular-nums'>{formatIDR(ord.amount)}</TableCell>
                    <TableCell>
                      <Badge variant={st === 'PAID' ? 'default' : st === 'EXPIRED' || st === 'FAILED' ? 'destructive' : 'secondary'}>
                        {st.toLowerCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className='hidden lg:table-cell text-sm'>{fmtDate(ord.createdAt)}</TableCell>
                    <TableCell className='hidden lg:table-cell text-sm'>{fmtDate(ord.paidAt)}</TableCell>
                    <TableCell className='text-right'>
                      {pending && (
                        <Button size='sm' variant='outline' onClick={() => setTarget(ord.id)}>
                          Verifikasi & settle
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!target} onOpenChange={(v) => !v && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Verifikasi & settle {target}?</AlertDialogTitle>
            <AlertDialogDescription>
              Server akan memeriksa status pembayaran ke KlikQRIS upstream. Lisensi hanya
              diterbitkan jika pembayaran terverifikasi. Jika belum, permintaan ditolak
              dengan aman.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (target) settle.mutate(target); setTarget(null) }}
            >
              Verifikasi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
