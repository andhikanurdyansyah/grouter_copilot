import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, fetchMyOrders, fetchCustomerReceipt, formatIDR, fmtDate } from '@/lib/grouter-api'
import { useLanguage } from '@/context/language-provider'
import {} from '@tanstack/react-router'
import {
  QrCode,
  Copy,
  Check,
  Info,
  Clock,
  CheckCircle2,
  AlertTriangle, Printer, Hourglass, ShieldCheck} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'


// Moda page-68..71: Pesanan & pembayaran (Orders & payments)
export function CustomerPayments() {
  const { language, t } = useLanguage()
  const ordersQuery = useQuery({ queryKey: ['my-orders'], queryFn: fetchMyOrders })

  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null)
  const receiptQuery = useQuery({
    queryKey: ['customer-receipt', selectedReceiptId],
    queryFn: () => fetchCustomerReceipt(selectedReceiptId as string),
    enabled: !!selectedReceiptId,
  })
  const selectedReceipt = receiptQuery.data?.receipt ?? null
  const [activePaymentOrder, setActivePaymentOrder] = useState<null | (typeof effectiveOrders)[number]>(null)
  const [isCheckingStatus, setIsCheckingStatus] = useState(false)
  const [statusNote, setStatusNote] = useState<string | null>(null)
  const [pendingDismissed, setPendingDismissed] = useState(false)

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      // ignore
    }
  }

  // Real data merged with Moda reference demo items
  const realOrders = (ordersQuery.data?.orders ?? []) as Array<{ id: string; planName?: string | null; packageKey?: string; amount?: number; status?: string; createdAt?: number; expiredAt?: string | number | null }>

  // Moda canonical items (page-68)
  // If real server orders exist, prioritize them, but keep canonical Moda shape if empty
  // Hanya order REAL dari server — tanpa fallback mock.
  const displayOrders = realOrders.map((o) => ({
        id: o.id.length > 14 ? `${o.id.slice(0, 8)}...${o.id.slice(-2)}` : o.id,
        fullId: o.id,
        plan: o.planName || o.packageKey || '—',
        amount: o.amount ?? null,
        date: fmtDate(o.createdAt ?? null),
        status: String(o.status || 'pending').toLowerCase(),
        expiresAt: o.expiredAt ?? null,
        qrImage: (o as { qrImage?: string | null }).qrImage ?? null,
        qrUrl: (o as { qrUrl?: string | null }).qrUrl ?? null,
      }))

  const effectiveOrders = displayOrders

  const hasPending = !pendingDismissed && effectiveOrders.some((o) => o.status === 'pending')
  const pendingItem = effectiveOrders.find((o) => o.status === 'pending') || effectiveOrders[0]
  const [nowMs] = useState(() => Date.now())
  const pendingExpiresIn = (() => {
    const raw = pendingItem?.expiresAt as string | number | null | undefined
    if (!raw || nowMs == null) return null
    const ms = new Date(raw).getTime() - nowMs
    if (!Number.isFinite(ms) || ms <= 0) return null
    const m = Math.floor(ms / 60000)
    const sec = Math.floor((ms % 60000) / 1000)
    return `${m}:${sec < 10 ? '0' : ''}${sec}`
  })()

  return (
    <div className='max-w-7xl mx-auto space-y-6 pb-12'>
      {/* Header */}
      <div>
        <h1 className='text-2xl font-bold tracking-tight text-foreground'>
          {t('payments_title')}
        </h1>
        <p className='text-sm text-muted-foreground mt-1'>
          {t('payments_sub')}
        </p>
      </div>

      {/* Pending Payment Card (Moda page-68) with 3D Amber Glow */}
      {hasPending && (
        <div className='rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 card-3d bevel-shine hover-lift-3d transition-all'>
          <div className='flex items-start sm:items-center gap-4'>
            <div className='size-12 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 text-amber-500 shadow-sm'>
              <QrCode className='size-6 animate-pulse' />
            </div>
            <div className='space-y-1'>
              <div className='text-base font-bold text-foreground'>
                {pendingItem.plan} {language === 'id' ? 'menunggu pembayaran' : 'awaiting payment'}
              </div>
              <div className='text-xs text-muted-foreground flex items-center gap-2 flex-wrap'>
                <span className='font-mono font-bold'>{pendingItem.id}</span>
                <span>·</span>
                <span className='font-extrabold text-foreground'>{formatIDR(pendingItem.amount)}</span>
                <span>·</span>
                <span className='text-amber-500 font-bold'>
                  {pendingExpiresIn != null ? `${language === 'id' ? 'kedaluwarsa' : 'expires'} ${pendingExpiresIn}` : (language === 'id' ? 'kedaluwarsa' : 'expires')}
                </span>
              </div>
              <div className='flex items-center gap-2 text-xs text-amber-400 font-semibold pt-0.5'>
                <span className='relative flex size-2'>
                  <span className='animate-radar-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75' />
                  <span className='relative inline-flex rounded-full size-2 bg-amber-500' />
                </span>
                <span>{t('payments_checking_status')}</span>
              </div>
            </div>
          </div>

          <div className='flex items-center gap-3 self-end sm:self-center'>
            <button
              type='button'
              onClick={() => setPendingDismissed(true)}
              className='text-xs font-semibold text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg transition-colors interactive-press'
            >
              {t('payments_btn_cancel')}
            </button>
            <Button
              type='button'
              onClick={() => setActivePaymentOrder(pendingItem)}
              className='bg-[#7778FF] hover:bg-[#8F90FF] text-white font-bold px-5 h-9 shadow-md hover:shadow-[0_0_15px_rgba(119,120,255,0.4)] interactive-press'
            >
              {t('payments_btn_continue')} →
            </Button>
          </div>
        </div>
      )}

      {/* History Card (Moda page-68) with 3D Depth */}
      <div className='rounded-xl border border-border/80 bg-card/80 card-3d bevel-shine overflow-hidden'>
        <div className='p-5 sm:p-6 border-b border-border/60 flex items-center justify-between'>
          <h2 className='text-base font-bold text-foreground'>
            {t('payments_history_title')}
          </h2>
          <span className='text-xs text-muted-foreground font-mono font-semibold'>
            {effectiveOrders.length} {language === 'id' ? 'order' : 'orders'}
          </span>
        </div>

        {/* Table */}
        <div className='overflow-x-auto'>
          <table className='w-full text-left border-collapse'>
            <thead>
              <tr className='border-b border-border/40 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase bg-secondary/20'>
                <th className='py-3.5 px-6 font-semibold'>{t('payments_col_order')}</th>
                <th className='py-3.5 px-6 font-semibold'>{t('payments_col_plan')}</th>
                <th className='py-3.5 px-6 font-semibold'>{t('payments_col_nominal')}</th>
                <th className='py-3.5 px-6 font-semibold'>{t('payments_col_date')}</th>
                <th className='py-3.5 px-6 font-semibold'>{t('payments_col_status')}</th>
                <th className='py-3.5 px-6 text-right font-semibold'></th>
              </tr>
            </thead>
            <tbody className='divide-y divide-border/40 text-sm'>
              {effectiveOrders.map((row) => (
                <tr key={row.fullId} className='hover:bg-secondary/10 transition-colors group'>
                  {/* Order */}
                  <td className='py-4 px-6 font-mono text-xs text-foreground/90 whitespace-nowrap'>
                    <div className='flex items-center gap-2'>
                      <span>{row.id}</span>
                      <button
                        type='button'
                        onClick={() => copyId(row.fullId)}
                        className='text-muted-foreground hover:text-foreground opacity-60 group-hover:opacity-100 transition-opacity p-0.5'
                        title='Salin Order ID'
                      >
                        {copiedId === row.fullId ? (
                          <Check className='size-3 text-emerald-500' />
                        ) : (
                          <Copy className='size-3' />
                        )}
                      </button>
                    </div>
                  </td>

                  {/* Plan */}
                  <td className='py-4 px-6 text-foreground font-medium whitespace-nowrap'>
                    {row.plan}
                  </td>

                  {/* Nominal */}
                  <td className='py-4 px-6 tabular-nums font-medium text-foreground whitespace-nowrap'>
                    {formatIDR(row.amount)}
                  </td>

                  {/* Date */}
                  <td className='py-4 px-6 text-xs text-muted-foreground whitespace-nowrap'>
                    {row.date}
                  </td>

                  {/* Status Badge */}
                  <td className='py-4 px-6 whitespace-nowrap'>
                    {row.status === 'pending' && (
                      <span className='inline-flex items-center gap-1.5 text-xs font-medium text-amber-500'>
                        <Clock className='size-3.5' />
                        {language === 'id' ? 'Menunggu' : 'Pending'}
                      </span>
                    )}
                    {row.status === 'paid' && (
                      <span className='inline-flex items-center gap-1.5 text-xs font-medium text-emerald-500'>
                        <CheckCircle2 className='size-3.5' />
                        {t('status_lunas')}
                      </span>
                    )}
                    {row.status === 'expired' && (
                      <span className='inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground'>
                        <Clock className='size-3.5' />
                        {t('status_kedaluwarsa')}
                      </span>
                    )}
                  </td>

                  {/* Action */}
                  <td className='py-4 px-6 text-right whitespace-nowrap'>
                    {row.status === 'pending' && (
                      <button
                        type='button'
                        onClick={() => setActivePaymentOrder(row)}
                        className='inline-flex items-center gap-1 text-xs font-semibold text-[#7778FF] hover:text-[#8F90FF] transition-colors'
                      >
                        {t('payments_action_pay')}
                      </button>
                    )}
                    {row.status === 'paid' && (
                      <button
                        type='button'
                        onClick={() => setSelectedReceiptId(row.fullId)}
                        className='inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors'
                      >
                        {t('payments_action_receipt')}
                      </button>
                    )}
                    {row.status === 'expired' && (
                      <span className='text-muted-foreground/60 text-xs'>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Sandbox Note */}
        <div className='p-4 m-5 rounded-lg bg-secondary/30 border border-border/40 flex items-start gap-3 text-xs text-muted-foreground'>
          <Info className='size-4 text-muted-foreground shrink-0 mt-0.5' />
          <span>{t('payments_sandbox_disclaimer')}</span>
        </div>
      </div>

      {/* Contextual QRIS Checkout Dialog */}
      {activePaymentOrder && (
        <Dialog open={!!activePaymentOrder} onOpenChange={() => setActivePaymentOrder(null)}>
          <DialogContent className='sm:max-w-[420px] bg-card border-border'>
            <DialogHeader>
              <div className='size-10 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mb-2'>
                <QrCode className='size-5' />
              </div>
              <DialogTitle className='text-lg font-bold'>
                {language === 'id' ? 'Pembayaran QRIS' : 'QRIS Payment'}
              </DialogTitle>
              <DialogDescription className='text-xs text-muted-foreground'>
                {language === 'id'
                  ? 'Pindai kode QRIS di bawah ini dengan aplikasi perbankan atau e-wallet Anda.'
                  : 'Scan the QRIS code below using any banking app or digital wallet.'}
              </DialogDescription>
            </DialogHeader>

            <div className='flex flex-col items-center justify-center p-4 rounded-xl border border-border/80 bg-muted/20 space-y-4'>
              <div className='relative size-52 bg-white rounded-xl p-3 shadow-md flex items-center justify-center overflow-hidden'>
                {/* QR dari provider utk order INI (KlikQRIS createQris). Fallback statis
                    hanya bila provider tidak mengirim image — jangan pernah pakai QR statis
                    sebagai QR pembayaran riil (setiap order punya kode berbeda). */}
                {(() => {
                  const qr = activePaymentOrder.qrImage || activePaymentOrder.qrUrl || '/app/images/qris-code.png'
                  return (
                    <img
                      src={qr}
                      alt='QRIS Barcode'
                      className='size-full object-contain'
                    />
                  )
                })()}
              </div>

              <div className='text-center space-y-1'>
                <div className='text-xs font-mono text-muted-foreground'>
                  {language === 'id' ? 'ID Transaksi:' : 'Transaction ID:'}{' '}
                  <span className='text-foreground font-bold'>{activePaymentOrder.id}</span>
                </div>
                <div className='text-xs font-semibold text-amber-400 flex items-center justify-center gap-1.5'>
                  <Hourglass className='size-3.5' />
                  <span>
                    {pendingExpiresIn != null ? `${language === 'id' ? 'Menunggu pembayaran ·' : 'Awaiting payment ·'} ${pendingExpiresIn} ${language === 'id' ? 'tersisa' : 'remaining'}` : (language === 'id' ? 'Menunggu pembayaran' : 'Awaiting payment')}
                  </span>
                </div>
                <div className='text-sm font-bold text-foreground pt-1'>
                  {activePaymentOrder.amount != null ? formatIDR(activePaymentOrder.amount) : "—"}
                </div>
              </div>
            </div>

            {statusNote && (
              <p className='text-xs text-amber-500 font-medium text-center pt-1'>{statusNote}</p>
            )}
            <DialogFooter className='flex-col sm:flex-row gap-2 pt-2'>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => setActivePaymentOrder(null)}
                className='text-xs'
              >
                {t('btn_cancel')}
              </Button>
              <Button
                type='button'
                size='sm'
                disabled={isCheckingStatus}
                onClick={async () => {
                  setIsCheckingStatus(true)
                  setStatusNote(null)
                  try {
                    const { data } = await api.get(`/orders/${encodeURIComponent(activePaymentOrder.fullId)}`)
                    const st = String((data as { order?: { status?: string } })?.order?.status || '').toUpperCase()
                    if (st === 'PAID') {
                      setActivePaymentOrder(null)
                      setSelectedReceiptId(activePaymentOrder.fullId)
                    } else if (st === 'PENDING') {
                      setStatusNote(language === 'id' ? 'Upstream belum mencatat pembayaran — coba lagi setelah membayar.' : 'Upstream has not recorded payment yet — retry after paying.')
                    } else {
                      setStatusNote(language === 'id' ? `Status order: ${st}` : `Order status: ${st}`)
                    }
                  } catch {
                    setStatusNote(language === 'id' ? 'Gagal memeriksa status — coba lagi.' : 'Failed to check status — please retry.')
                  } finally {
                    setIsCheckingStatus(false)
                  }
                }}
                className='bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs gap-1.5 shadow-md interactive-press'
              >
                <ShieldCheck className='size-3.5' />
                {isCheckingStatus
                  ? (language === 'id' ? 'Memverifikasi...' : 'Verifying...')
                  : (language === 'id' ? 'Periksa status pembayaran' : 'Check payment status')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Receipt Modal */}
      {selectedReceiptId && (
        <Dialog open onOpenChange={() => setSelectedReceiptId(null)}>
          <DialogContent className='receipt-print-dialog sm:max-w-[440px] bg-card border-border'>
            {receiptQuery.isLoading && (
              <div role='status' className='py-10 text-center text-sm text-muted-foreground'>
                {language === 'id' ? 'Memuat bukti pembayaran…' : 'Loading receipt…'}
              </div>
            )}
            {receiptQuery.isError && (
              <div role='alert' className='py-8 text-center space-y-3'>
                <AlertTriangle className='size-6 text-destructive mx-auto' />
                <p className='text-sm font-semibold text-foreground'>
                  {language === 'id' ? 'Bukti pembayaran tidak dapat dimuat.' : 'Receipt could not be loaded.'}
                </p>
                <p className='text-xs text-muted-foreground'>
                  {language === 'id' ? 'Coba lagi atau tutup dialog ini.' : 'Try again or close this dialog.'}
                </p>
                <Button type='button' size='sm' variant='outline' onClick={() => receiptQuery.refetch()}>
                  {language === 'id' ? 'Coba lagi' : 'Retry'}
                </Button>
              </div>
            )}
            {selectedReceipt && (
              <>
                <DialogHeader data-receipt-hide-on-print>
              <div className='size-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center mb-2'>
                <CheckCircle2 className='size-5' />
              </div>
              <DialogTitle className='text-lg font-bold'>
                {language === 'id' ? 'Bukti Pembayaran QRIS' : 'QRIS Payment Receipt'}
              </DialogTitle>
              <DialogDescription className='text-xs text-muted-foreground'>
                {language === 'id'
                  ? 'Transaksi berhasil dikonfirmasi dan diverifikasi server.'
                  : 'Transaction successfully confirmed and verified server-side.'}
              </DialogDescription>
            </DialogHeader>

            <div className='receipt-print-content my-3 rounded-lg border border-border/50 bg-secondary/20 p-4 space-y-3 font-mono text-xs'>
              <div className='flex justify-between border-b border-border/40 pb-2'>
                <span className='text-muted-foreground font-sans'>Order ID:</span>
                <span className='font-semibold text-foreground'>{selectedReceipt.orderId}</span>
              </div>
              <div className='flex justify-between border-b border-border/40 pb-2'>
                <span className='text-muted-foreground font-sans'>
                  {language === 'id' ? 'Paket:' : 'Plan:'}
                </span>
                <span className='text-foreground'>{selectedReceipt.planName ?? selectedReceipt.packageKey ?? '—'}</span>
              </div>
              <div className='flex justify-between border-b border-border/40 pb-2'>
                <span className='text-muted-foreground font-sans'>
                  {language === 'id' ? 'Tanggal:' : 'Date:'}
                </span>
                <span className='text-foreground'>{fmtDate(selectedReceipt.paidAt ?? selectedReceipt.createdAt)}</span>
              </div>
              <div className='flex justify-between border-b border-border/40 pb-2'>
                <span className='text-muted-foreground font-sans'>Status:</span>
                <span className='text-emerald-500 font-semibold'>PAID · server verified</span>
              </div>
              <div className='flex justify-between border-b border-border/40 pb-2'>
                <span className='text-muted-foreground font-sans'>License reference:</span>
                <span className='text-foreground'>{selectedReceipt.licenseReference}</span>
              </div>
              <div className='flex justify-between pt-1 text-sm font-semibold text-foreground font-sans'>
                <span>Total:</span>
                <span className='tabular-nums text-emerald-500'>{formatIDR(selectedReceipt.amount)}</span>
              </div>
            </div>

            <div data-receipt-hide-on-print className='flex items-center justify-end gap-2.5 pt-2'>
              <Button
                variant='outline'
                size='sm'
                disabled={receiptQuery.isLoading || !selectedReceipt}
                onClick={() => selectedReceipt && window.print()}
                className='text-xs gap-1.5'
              >
                <Printer className='size-3.5' />
                {language === 'id' ? 'Cetak' : 'Print'}
              </Button>
              <Button
                size='sm'
                onClick={() => setSelectedReceiptId(null)}
                className='bg-[#7778FF] hover:bg-[#8F90FF] text-white text-xs'
              >
                {t('btn_done')}
              </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
