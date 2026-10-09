import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchPlans, formatIDR, fmtDate } from '@/lib/grouter-api'
import { PageHeader } from '@/components/shared/page-header'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { StatusBadge } from '@/components/shared/status-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/grouter-api'
import { toast } from 'sonner'

interface OrderResp {
  order?: { id: string; qrString?: string; qrUrl?: string; amount?: number; packageKey?: string }
  [k: string]: unknown
}

export function CustomerOrders() {
  const qc = useQueryClient()
  const plans = useQuery({ queryKey: ['plans'], queryFn: fetchPlans })
  const [qr, setQr] = useState<OrderResp | null>(null)

  const buy = useMutation({
    mutationFn: async (packageKey: string) => {
      // Pricing selalu server-side: hanya packageKey yang dikirim.
      const { data } = await api.post<OrderResp>('/orders', { packageKey })
      return data
    },
    onSuccess: (data) => {
      setQr(data)
      qc.invalidateQueries({ queryKey: ['me'] })
    },
    onError: (e) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error('Checkout gagal: ' + (msg || 'coba lagi'))
    },
  })

  if (plans.isLoading) return <Skeleton className='h-64' />
  const planList = plans.data?.plans ?? []

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Paket & Order'
        description='Harga & entitlement ditetapkan server (tidak dari browser). Pembayaran via QRIS; lisensi terbit otomatis setelah terverifikasi.'
      />

      <LatestOrder />

      <Card className='py-0 overflow-hidden'>
        <CardContent className='p-0'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-2/5 md:w-1/3'>Fitur</TableHead>
                {planList.map((p) => (
                  <TableHead key={p.key} className='text-center'>
                    <div className='text-sm font-semibold'>{p.name}</div>
                    <div className='text-xs font-normal text-muted-foreground'>{p.key}</div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className='text-sm text-muted-foreground'>Harga (server-side)</TableCell>
                {planList.map((p) => (
                  <TableCell key={p.key} className='text-center text-base font-semibold tabular-nums'>{formatIDR(p.amount)}</TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className='text-sm text-muted-foreground'>Masa aktif lisensi</TableCell>
                {planList.map((p) => (
                  <TableCell key={p.key} className='text-center text-sm tabular-nums'>{p.expiresInDays} hari</TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className='text-sm text-muted-foreground'>Fitur AI</TableCell>
                {planList.map((p) => (
                  <TableCell key={p.key} className='text-center'>
                    {p.ai?.enabled ? (
                      <Badge variant='secondary'>
                        {p.ai.quotaTokens === null ? 'AI · token unlimited' : 'AI · ' + p.ai.quotaTokens.toLocaleString('id-ID') + ' tok'}
                      </Badge>
                    ) : (
                      <span className='text-sm text-muted-foreground'>tidak termasuk</span>
                    )}
                  </TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className='text-sm text-muted-foreground'>Beli / perpanjang</TableCell>
                {planList.map((p) => (
                  <TableCell key={p.key} className='text-center'>
                    <Button
                      size='sm'
                      disabled={buy.isPending || p.amount === 0}
                      onClick={() => buy.mutate(p.key)}
                    >
                      {p.amount === 0 ? 'Hubungi kami' : buy.isPending ? '…' : 'Beli via QRIS'}
                    </Button>
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {qr && (
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Checkout QRIS</CardTitle>
            <CardDescription>
              Order {String((qr.order as { id?: string })?.id ?? '')} — scan QR di bawah.
              Lisensi terbit otomatis setelah pembayaran terverifikasi webhook.
            </CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col items-center gap-3'>
            {(() => {
              const o = qr.order as { qrString?: string; qrUrl?: string } | undefined
              const qrValue = o?.qrUrl || o?.qrString
              return qrValue ? (
                <img
                  src={'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(qrValue)}
                  alt='QR Code pembayaran'
                  className='rounded-md border bg-white p-2'
                  width={220}
                  height={220}
                />
              ) : (
                <div className='text-sm text-muted-foreground'>QR string:</div>
              )
            })()}
          </CardContent>
        </Card>
      )}
    </div>
  )
}


// Order terakhir customer (status pembayaran server-side)
function LatestOrder() {
  const latest = useQuery({
    queryKey: ['orders-latest'],
    queryFn: async () => (await api.get('/orders/latest')).data as { order: { id: string; packageKey?: string; amount?: number; status?: string; createdAt?: number | string } | null },
  })
  if (latest.isPending || latest.isError) return null
  const o = latest.data?.order
  if (!o) return null
  const st = String(o.status || '—')
  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardTitle className='text-base'>Order terakhir Anda</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-wrap items-center justify-between gap-2 text-sm'>
        <div className='min-w-0'>
          <p className='font-mono text-xs text-muted-foreground'>{o.id}</p>
          <p className='text-muted-foreground'>
            {o.packageKey ? o.packageKey + ' · ' : ''}
            {formatIDR(o.amount)} · {fmtDate(o.createdAt)}
          </p>
        </div>
        <StatusBadge tone={st.toUpperCase() === 'PAID' ? 'success' : st.toUpperCase() === 'PENDING' ? 'warning' : 'danger'}>
          {st.toLowerCase() === 'paid' ? 'dibayar' : st.toLowerCase() === 'pending' ? 'menunggu pembayaran' : st.toLowerCase()}
        </StatusBadge>
      </CardContent>
    </Card>
  )
}
