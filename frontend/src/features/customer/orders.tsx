import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchPlans, formatIDR } from '@/lib/grouter-api'
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
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>Paket & Order</h1>
        <p className='text-muted-foreground text-sm'>
          Pilih paket — harga & entitlement ditetapkan server. Pembayaran via QRIS.
        </p>
      </div>

      <div className='grid gap-4 md:grid-cols-3'>
        {planList.map((p) => (
          <Card key={p.key}>
            <CardHeader>
              <CardTitle className='text-lg'>{p.name}</CardTitle>
              <CardDescription>{p.key}</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              <div className='text-2xl font-bold tabular-nums'>{formatIDR(p.amount)}</div>
              <div className='text-sm text-muted-foreground'>
                Masa aktif {p.expiresInDays} hari
              </div>
              {p.ai ? (
                p.ai.enabled ? (
                  <Badge variant='secondary'>
                    AI termasuk · {p.ai.quotaTokens === null ? 'token unlimited' : p.ai.quotaTokens.toLocaleString('id-ID') + ' tokens'}
                  </Badge>
                ) : (
                  <Badge variant='outline'>AI: tidak termasuk</Badge>
                )
              ) : null}
              {p.quota != null && (
                <div className='text-sm text-muted-foreground'>Kuota {p.quota.toLocaleString('id-ID')}</div>
              )}
              <Button
                className='w-full'
                disabled={buy.isPending || p.amount === 0}
                onClick={() => buy.mutate(p.key)}
              >
                {p.amount === 0 ? 'Hubungi kami' : buy.isPending ? 'Memproses…' : 'Beli via QRIS'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

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
