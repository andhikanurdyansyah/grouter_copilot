import { useQuery } from '@tanstack/react-query'
import { fetchMyOrders, formatIDR, fmtDate } from '@/lib/grouter-api'
import { PageHeader } from '@/components/shared/page-header'
import { StatusBadge, orderTone } from '@/components/shared/status-badge'
import { TableSkeleton, ErrorState, EmptyState } from '@/components/shared/data-states'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Link } from '@tanstack/react-router'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Copy, Check, Wallet, RefreshCw } from 'lucide-react'
import { useState } from 'react'

function statusLabel(s: string): string {
  const u = String(s).toUpperCase()
  if (u === 'PENDING') return 'Menunggu pembayaran'
  if (u === 'PAID') return 'Lunas'
  if (u === 'FAILED' || u === 'EXPIRED') return 'Gagal / hangus'
  if (u === 'CANCELLED') return 'Dibatalkan'
  return String(s)
}

// Adopsi CustomerOrders (ZIP) → produksi: riwayat order session-scoped
// (GET /api/orders). Tanpa fabrikasi status — server truth saja.
export function CustomerPayments() {
  const orders = useQuery({ queryKey: ['my-orders'], queryFn: fetchMyOrders })
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch { /* clipboard bisa ditolak */ }
  }

  const rows = (orders.data?.orders ?? []) as {
    id: string; planName?: string | null; packageKey?: string; amount?: number
    status?: string; createdAt?: number; paidAt?: number | null
  }[]
  const pending = rows.filter((o) => String(o.status).toUpperCase() === 'PENDING')
  const latest = rows[0]

  return (
    <div className='space-y-5'>
      <PageHeader
        title='Orders & Payments'
        description='Riwayat pembelian paket dan status pembayaran QRIS Anda. Status selalu diverifikasi server.'
      >
        <Button variant='outline' size='sm' onClick={() => orders.refetch()} disabled={orders.isFetching}>
          <RefreshCw className={orders.isFetching ? 'size-3.5 animate-spin' : 'size-3.5'} /> Muat ulang
        </Button>
      </PageHeader>

      {orders.isPending ? (
        <TableSkeleton rows={4} cols={5} />
      ) : orders.isError ? (
        <ErrorState
          status={(orders.error as { response?: { status?: number } })?.response?.status}
          message={(orders.error as Error).message}
          onRetry={() => orders.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title='Belum ada order'
          description='Anda belum melakukan pembelian. Pilih paket untuk mulai menggunakan Copilot.'
          action={<Button asChild size='sm'><Link to='/user/orders'>Lihat paket</Link></Button>}
        />
      ) : (
        <>
          {latest && String(latest.status).toUpperCase() === 'PENDING' && (
            <Card className='border-amber-500/30 bg-amber-500/[0.04] py-0'>
              <CardContent className='flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between'>
                <div className='flex items-start gap-3'>
                  <Wallet className='mt-0.5 size-5 text-amber-600' aria-hidden />
                  <div>
                    <p className='text-sm font-medium'>
                      1 order menunggu pembayaran — {latest.planName || latest.packageKey} · {formatIDR(latest.amount)}
                    </p>
                    <p className='text-[13px] font-medium text-amber-800 dark:text-amber-300'>
                      Order {latest.id} dibuat {fmtDate(latest.createdAt ?? null)}. Selesaikan pembayaran QRIS sebelum kode hangus; lisensi terbit otomatis setelah pembayaran terverifikasi server.
                    </p>
                  </div>
                </div>
                <Button asChild size='sm'>
                  <Link to='/user/orders'>Buka pembayaran QRIS</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          <Card className='py-0'>
            <CardContent className='px-0 pb-0'>
              <div className='px-5 py-4'>
                <h2 className='text-[15px] font-semibold'>
                  Riwayat order{' '}
                  <span className='text-muted-foreground'>({rows.length} order{pending.length > 0 ? ` · ${pending.length} menunggu` : ''})</span>
                </h2>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Paket</TableHead>
                    <TableHead className='text-right'>Nominal</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Dibuat</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>
                        <span className='inline-flex items-center gap-1.5'>
                          <span className='font-mono text-xs'>{o.id.slice(0, 18)}{o.id.length > 18 ? '…' : ''}</span>
                          <button
                            type='button'
                            onClick={() => copyId(o.id)}
                            aria-label={`Salin Order ID ${o.id}`}
                            className='rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
                          >
                            {copiedId === o.id ? <Check className='size-3 text-emerald-600' /> : <Copy className='size-3' />}
                          </button>
                        </span>
                        {copiedId === o.id && <span role='status' className='sr-only'>Tersalin</span>}
                      </TableCell>
                      <TableCell className='text-sm'>{o.planName || o.packageKey || '—'}</TableCell>
                      <TableCell className='text-right tabular-nums'>{formatIDR(o.amount)}</TableCell>
                      <TableCell>
                        <StatusBadge tone={orderTone(String(o.status ?? ''))}>{statusLabel(String(o.status ?? ''))}</StatusBadge>
                      </TableCell>
                      <TableCell className='text-xs tabular-nums text-muted-foreground'>{fmtDate(o.createdAt ?? null)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
