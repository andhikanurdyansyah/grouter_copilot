import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { fetchAdminOrders, settleOrder } from '@/lib/grouter-api'
import { Button } from '@/components/ui/button'
import { Download, CheckCircle2, Clock, Hourglass, RefreshCw, X, Receipt } from 'lucide-react'
import { useLanguage } from '@/context/language-provider'
import { cn } from '@/lib/utils'
import {


  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'

export function AdminOrders() {
  const { language, t } = useLanguage()
  const isId = language === 'id'
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'paid' | 'expired'>('all')
  const [verifyingId, setVerifyingId] = useState<string | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<{
    id: string
    customer: string
    plan: string
    amount: string
    createdAt: string
    status: string
    statusLabel: string
  } | null>(null)
  const [toastMessage, setToastMessage] = useState<{ title: string; subtitle: string } | null>(null)

  const qc = useQueryClient()
  const settleMut = useMutation({
    mutationFn: (orderId: string) => settleOrder(orderId),
    onSuccess: (res) => {
      setVerifyingId(null)
      setToastMessage({
        title: res.licenseId ? (isId ? 'Pembayaran terverifikasi' : 'Payment verified') : (isId ? 'Belum terbayar' : 'Not paid yet'),
        subtitle: res.licenseId
          ? (isId ? `Lisensi ${res.licenseId.slice(0, 10)}... diterbitkan` : `License ${res.licenseId.slice(0, 10)}... issued`)
          : (isId ? 'Status upstream belum PAID — coba lagi nanti' : 'Upstream status is not PAID yet — retry later'),
      })
      qc.invalidateQueries({ queryKey: ['admin-orders'] })
    },
    onError: () => {
      setVerifyingId(null)
      setToastMessage({ title: isId ? 'Verifikasi gagal' : 'Verification failed', subtitle: isId ? 'Coba lagi' : 'Please retry' })
    },
  })
  const handleVerify = (id: string) => {
    setVerifyingId(id)
    settleMut.mutate(id)
  }

  const ordersQuery = useQuery({ queryKey: ['admin-orders'], queryFn: () => fetchAdminOrders(100), refetchInterval: 30_000 })

  // Data REAL dari /api/admin/orders (join customerName server-side).
  const fmtRp = (n: number | null | undefined) =>
    n == null ? '—' : 'Rp ' + n.toLocaleString('id-ID')
  const fmtWhen = (ts: number | null | undefined) =>
    ts ? new Date(ts).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
  const shortId = (id: string) => (id.length > 14 ? id.slice(0, 8) + '...' + id.slice(-2) : id)

  const ordersList = ((ordersQuery.data?.orders ?? []) as Array<{
    id: string; packageKey: string | null; planName: string | null
    amount: number | null; status: string; createdAt: number | null; customerName: string | null
  }>).map((o) => {
    const st = String(o.status || 'pending').toLowerCase()
    return {
      id: shortId(o.id),
      fullId: o.id,
      customer: o.customerName ?? '—',
      plan: o.planName || o.packageKey || '—',
      amount: fmtRp(o.amount),
      createdAt: fmtWhen(o.createdAt),
      status: st,
      statusLabel:
        st === 'paid' ? (isId ? 'Lunas' : 'Paid')
        : st === 'pending' ? (isId ? 'Menunggu' : 'Pending')
        : st === 'cancelled' ? (isId ? 'Dibatalkan' : 'Cancelled')
        : (isId ? 'Hangus' : 'Expired'),
    }
  })

  const filteredOrders = ordersList.filter((o) => {
    if (activeTab === 'pending' && o.status !== 'pending' && o.status !== 'verifying') return false
    if (activeTab === 'paid' && o.status !== 'paid') return false
    if (activeTab === 'expired' && o.status !== 'expired') return false
    return true
  })

  return (
    <div className='space-y-6 animate-fade-in relative'>
      {/* ── Top Header Row ── */}
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight text-foreground'>
            {isId ? 'Pesanan' : 'Orders'}
          </h1>
          <p className='text-xs sm:text-sm text-muted-foreground mt-0.5'>
            {isId
              ? 'Order QRIS (sandbox). Verify-and-settle memverifikasi ulang status ke upstream di sisi server.'
              : 'QRIS orders (sandbox). Verify-and-settle re-verifies payment status upstream server-side.'}
          </p>
        </div>

        <Button
          variant='outline'
          size='sm'
          className='h-9 gap-1.5 border-border bg-card/60 hover:bg-muted text-xs sm:text-sm font-medium self-start sm:self-auto'
          onClick={() => {
            const csv = 'id,customer,amount,status\n' + ordersList.map((o) => `${o.id},${o.customer},${o.amount},${o.status}`).join('\n')
            const blob = new Blob([csv], { type: 'text/csv' })
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = 'orders.csv'
            a.click()
          }}
        >
          <Download className='size-3.5' /> {t('btn_export_csv')}
        </Button>
      </div>

      {/* ── KPI Strip (Moda page-32) ── */}
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 rounded-xl border border-border bg-card/70 shadow-2xs divide-y sm:divide-y-0 sm:divide-x divide-border'>
        <div className='p-5'>
          <p className='text-xs font-medium text-muted-foreground'>
            LUNAS · 30H
          </p>
          <p className='mt-1 text-3xl font-bold font-mono tracking-tight text-foreground'>
            214
          </p>
        </div>

        <div className='p-5'>
          <p className='text-xs font-medium text-amber-500 flex items-center gap-1.5'>
            <span className='size-2 rounded-full bg-amber-500' />
            {isId ? 'Menunggu verifikasi' : 'Awaiting verification'}
          </p>
          <p className='mt-1 text-3xl font-bold font-mono tracking-tight text-foreground'>
            4
          </p>
        </div>

        <div className='p-5'>
          <p className='text-xs font-medium text-muted-foreground'>
            {isId ? 'Kedaluwarsa / gagal' : 'Expired / failed'}
          </p>
          <p className='mt-1 text-3xl font-bold font-mono tracking-tight text-foreground'>
            17
          </p>
        </div>

        <div className='p-5'>
          <p className='text-xs font-medium text-muted-foreground'>
            {isId ? 'Nilai settle' : 'Settlement value'}
          </p>
          <p className='mt-1 text-3xl font-bold font-mono tracking-tight text-foreground'>
            Rp 48,6 jt
          </p>
        </div>
      </div>

      {/* ── Filter Tabs & Status Note ── */}
      <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3'>
        <div className='flex items-center rounded-lg border border-border bg-card/70 p-0.5 shadow-2xs'>
          {[
            { id: 'all', label: isId ? 'Semua' : 'All' },
            { id: 'pending', label: isId ? 'Pending · 4' : 'Pending · 4' },
            { id: 'paid', label: isId ? 'Lunas' : 'Paid' },
            { id: 'expired', label: isId ? 'Kedaluwarsa' : 'Expired' },
          ].map((tab) => (
            <button
              key={tab.id}
              type='button'
              onClick={() => setActiveTab(tab.id as Parameters<typeof setActiveTab>[0])}
              className={cn(
                'px-3.5 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap',
                activeTab === tab.id
                  ? 'bg-muted text-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <span className='text-xs text-muted-foreground'>
          {isId ? 'Status diperbarui saat Anda memverifikasi' : 'Status updates when verified'}
        </span>
      </div>

      {/* ── Orders Table ── */}
      <div className='rounded-xl border border-border bg-card/70 shadow-2xs overflow-hidden'>
        <div className='overflow-x-auto'>
          <table className='w-full text-left text-xs'>
            <thead>
              <tr className='border-b border-border bg-muted/20 text-muted-foreground font-semibold uppercase tracking-wider'>
                <th className='py-3.5 px-4'>ORDER</th>
                <th className='py-3.5 px-4'>{isId ? 'PELANGGAN' : 'CUSTOMER'}</th>
                <th className='py-3.5 px-4'>{isId ? 'PAKET' : 'PLAN'}</th>
                <th className='py-3.5 px-4'>{isId ? 'NOMINAL' : 'AMOUNT'}</th>
                <th className='py-3.5 px-4'>{isId ? 'DIBUAT ↓' : 'CREATED ↓'}</th>
                <th className='py-3.5 px-4'>{isId ? 'STATUS' : 'STATUS'}</th>
                <th className='py-3.5 px-4 text-right'>{isId ? 'AKSI' : 'ACTION'}</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-border/60 font-mono'>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className='py-8 text-center text-muted-foreground font-sans'>
                    <p className='text-xs'>{isId ? 'Tidak ada pesanan pada status filter ini.' : 'No orders in this status filter.'}</p>
                    <button
                      type='button'
                      onClick={() => setActiveTab('all')}
                      className='mt-2 text-xs font-semibold text-[#7778FF] hover:underline'
                    >
                      {isId ? 'Tampilkan semua pesanan' : 'Show all orders'}
                    </button>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setSelectedOrder(row)}
                  className='hover:bg-muted/40 transition-colors cursor-pointer group'
                >
                  <td className='py-3.5 px-4 font-medium text-foreground group-hover:text-[#7778FF] transition-colors'>{row.id}</td>
                  <td className='py-3.5 px-4 font-sans font-semibold text-foreground'>{row.customer}</td>
                  <td className='py-3.5 px-4 font-sans text-muted-foreground'>{row.plan}</td>
                  <td className='py-3.5 px-4 text-foreground font-bold'>{row.amount}</td>
                  <td className='py-3.5 px-4 text-muted-foreground'>{row.createdAt}</td>
                  <td className='py-3.5 px-4 font-sans'>
                    {row.status === 'pending' && (
                      <span className='inline-flex items-center gap-1.5 text-amber-500 font-medium'>
                        <Hourglass className='size-3' /> {row.statusLabel}
                      </span>
                    )}
                    {row.status === 'verifying' && (
                      <span className='inline-flex items-center gap-1.5 text-[#7778FF] font-medium'>
                        <RefreshCw className='size-3 animate-spin' /> {row.statusLabel}
                      </span>
                    )}
                    {row.status === 'paid' && (
                      <span className='inline-flex items-center gap-1.5 text-[#39D6A0] font-medium'>
                        <CheckCircle2 className='size-3' /> {row.statusLabel}
                      </span>
                    )}
                    {row.status === 'expired' && (
                      <span className='inline-flex items-center gap-1.5 text-muted-foreground font-medium'>
                        <Clock className='size-3' /> {row.statusLabel}
                      </span>
                    )}
                  </td>
                  <td className='py-3.5 px-4 text-right font-sans'>
                    {row.status === 'pending' && (
                      <Button
                        size='sm'
                        onClick={(e) => {
                          e.stopPropagation()
                          handleVerify(row.id)
                        }}
                        disabled={verifyingId === row.id}
                        className='h-7 bg-[#7778FF] hover:bg-[#8F90FF] text-white text-xs font-medium px-3'
                      >
                        {verifyingId === row.id ? (
                          <RefreshCw className='size-3 animate-spin' />
                        ) : (
                          t('btn_verify_settle')
                        )}
                      </Button>
                    )}
                    {row.status === 'verifying' && (
                      <Button
                        size='sm'
                        disabled
                        className='h-7 bg-muted text-muted-foreground text-xs font-medium px-3'
                      >
                        {isId ? 'Memverifikasi...' : 'Verifying...'}
                      </Button>
                    )}
                    {row.status === 'paid' && (
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedOrder(row)
                        }}
                        className='h-7 border-border bg-card hover:bg-muted text-xs font-medium px-3'
                      >
                        {isId ? 'Inspeksi' : 'Inspect'}
                      </Button>
                    )}
                    {row.status === 'expired' && (
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedOrder(row)
                        }}
                        className='h-7 text-xs text-muted-foreground hover:text-foreground px-2'
                      >
                        {isId ? 'Detail' : 'Detail'}
                      </Button>
                    )}
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Contextual Order Inspection Drawer (Sheet) ── */}
      <Sheet open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <SheetContent className='sm:max-w-md border-border bg-card/95 backdrop-blur-2xl p-6 space-y-6 overflow-y-auto'>
          <SheetHeader>
            <div className='flex items-center gap-2'>
              <Receipt className='size-4 text-[#7778FF]' />
              <span className='font-mono text-xs font-bold text-[#7778FF] uppercase tracking-wider'>
                {isId ? 'Detail Pesanan' : 'Order Details'}
              </span>
            </div>
            <SheetTitle className='text-lg font-bold text-foreground font-mono'>
              {selectedOrder?.id}
            </SheetTitle>
            <SheetDescription className='text-xs text-muted-foreground'>
              {isId
                ? 'Inspeksi metadata transaksi QRIS, status settle, dan lisensi terkait.'
                : 'Inspect QRIS transaction metadata, settlement status, and associated license.'}
            </SheetDescription>
          </SheetHeader>

          {selectedOrder && (
            <div className='space-y-4 text-xs'>
              {/* Status Banner */}
              <div className='rounded-xl border border-border p-3.5 bg-muted/20 flex items-center justify-between'>
                <span className='text-muted-foreground font-medium'>{isId ? 'Status Saat Ini' : 'Current Status'}</span>
                {selectedOrder.status === 'paid' && (
                  <span className='inline-flex items-center gap-1.5 text-[#39D6A0] font-bold'>
                    <CheckCircle2 className='size-3.5' /> {selectedOrder.statusLabel}
                  </span>
                )}
                {selectedOrder.status === 'pending' && (
                  <span className='inline-flex items-center gap-1.5 text-amber-500 font-bold'>
                    <Hourglass className='size-3.5' /> {selectedOrder.statusLabel}
                  </span>
                )}
                {selectedOrder.status === 'expired' && (
                  <span className='inline-flex items-center gap-1.5 text-muted-foreground font-bold'>
                    <Clock className='size-3.5' /> {selectedOrder.statusLabel}
                  </span>
                )}
              </div>

              {/* Customer Info */}
              <div className='rounded-xl border border-border p-4 bg-card space-y-2.5'>
                <div className='text-[11px] font-bold uppercase tracking-wider text-muted-foreground'>
                  {isId ? 'Informasi Pelanggan' : 'Customer Info'}
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>{isId ? 'Nama Organisasi' : 'Organization'}</span>
                  <span className='font-bold text-foreground'>{selectedOrder.customer}</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>Domain</span>
                  <span className='font-mono text-foreground'>
                    {selectedOrder.customer.toLowerCase().replace(/\s+/g, '')}.id
                  </span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>Dibuat</span>
                  <span className='font-mono text-foreground'>{selectedOrder.createdAt}</span>
                </div>
              </div>

              {/* Billing Info */}
              <div className='rounded-xl border border-border p-4 bg-card space-y-2.5'>
                <div className='text-[11px] font-bold uppercase tracking-wider text-muted-foreground'>
                  {isId ? 'Rincian Pembayaran' : 'Payment Details'}
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>{isId ? 'Paket Terpilih' : 'Selected Plan'}</span>
                  <span className='font-bold text-foreground'>{selectedOrder.plan}</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>{isId ? 'Nominal Tagihan' : 'Billed Amount'}</span>
                  <span className='font-mono font-bold text-foreground text-sm'>{selectedOrder.amount}</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>Metode</span>
                  <span className='font-mono text-foreground'>KlikQRIS (Sandbox)</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>Ref Provider</span>
                  <span className='font-mono text-foreground'>REF-20261010-9QX2</span>
                </div>
              </div>
            </div>
          )}

          <SheetFooter className='flex-col gap-2 pt-4 border-t border-border'>
            {selectedOrder?.status === 'pending' && (
              <Button
                onClick={() => {
                  handleVerify(selectedOrder.id)
                  setSelectedOrder(prev => prev ? { ...prev, status: 'paid', statusLabel: isId ? 'Lunas' : 'Paid' } : null)
                }}
                disabled={verifyingId === selectedOrder?.id}
                className='w-full bg-[#7778FF] hover:bg-[#8F90FF] text-white text-xs h-9 font-semibold gap-1.5'
              >
                {verifyingId === selectedOrder?.id ? (
                  <RefreshCw className='size-3.5 animate-spin' />
                ) : (
                  <CheckCircle2 className='size-3.5' />
                )}
                {t('btn_verify_settle')}
              </Button>
            )}
            {selectedOrder?.status === 'paid' && (
              <Button
                asChild
                variant='outline'
                className='w-full text-xs h-9 border-border bg-card hover:bg-muted'
              >
                <Link to='/admin/licenses'>
                  {isId ? 'Buka Daftar Lisensi Terkait →' : 'View Associated Licenses →'}
                </Link>
              </Button>
            )}
            <Button
              variant='ghost'
              onClick={() => setSelectedOrder(null)}
              className='w-full text-xs h-8 text-muted-foreground hover:text-foreground'
            >
              {isId ? 'Tutup Drawer' : 'Close Drawer'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ── Toast Floating Bottom Right (Moda page-32) ── */}
      {toastMessage && (
        <div className='fixed bottom-6 right-6 z-50 flex items-center justify-between gap-4 rounded-xl border border-border bg-card/95 p-3.5 px-4 shadow-2xl backdrop-blur-md animate-fade-in'>
          <div className='flex items-center gap-3'>
            <div className='flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-500'>
              <CheckCircle2 className='size-4' />
            </div>
            <div>
              <div className='font-mono text-xs font-bold text-foreground'>
                {toastMessage.title}
              </div>
              <div className='text-[11px] text-muted-foreground'>
                {toastMessage.subtitle}
              </div>
            </div>
          </div>
          <button
            type='button'
            onClick={() => setToastMessage(null)}
            className='text-muted-foreground hover:text-foreground'
          >
            <X className='size-3.5' />
          </button>
        </div>
      )}
    </div>
  )
}
