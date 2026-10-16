import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, fetchPlans, fetchMe, formatIDR, fmtDate } from '@/lib/grouter-api'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
} from '@/components/ui/dialog'
import {
  Check,
  Download,
  RefreshCw,
  Printer,
  ShieldCheck,
  ArrowRight,
  X,
  Sparkles,
  Zap,
  QrCode,
  BadgeCheck,
  AlertTriangle,
  ReceiptText,
  Info,
  Copy,
} from 'lucide-react'
import { toast } from 'sonner'
import { useLanguage } from '@/context/language-provider'
import { cn } from '@/lib/utils'

type PlanRow = {
  key: string
  name: string
  amount: number
  quota: string | null
  features: string[]
  expiresInDays: number
}

type ActiveOrder = {
  id: string
  qrUrl?: string
  qrImage?: string
  signature?: string | null
  amount?: number | null
  expiredAt?: string | null
  status?: string
  createdAt?: string | number | null
}

export function CustomerOrders() {
  const { language, t } = useLanguage()
  const isId = language === 'id'
  const qc = useQueryClient()

  // ── Data REAL (server-side only; no mock) ──
  const plansQ = useQuery({ queryKey: ['plans'], queryFn: fetchPlans, retry: 2 })
  const meQ = useQuery({ queryKey: ['me'], queryFn: fetchMe, retry: 2 })
  const latestQ = useQuery({
    queryKey: ['orders-latest'],
    queryFn: async () =>
      (await api.get('/orders/latest')).data as {
        order:
          | (ActiveOrder & { packageKey?: string; createdAt?: string | number | null })
          | null
      },
  })

  const [activeOrder, setActiveOrder] = useState<ActiveOrder | null>(null)
  const [checkoutOpen, setCheckoutOpen] = useState(false)

  const pendingFromLatest = (() => {
    const o = latestQ.data?.order
    return o && String(o.status || '').toUpperCase() === 'PENDING' ? o : null
  })()

  // Order yang sedang ditagih: order baru (state) menang, lalu pending terakhir dari server.
  const polled: ActiveOrder | null =
    activeOrder ??
    (pendingFromLatest
      ? {
          id: pendingFromLatest.id,
          qrUrl: pendingFromLatest.qrUrl,
          qrImage: (pendingFromLatest as { qrImage?: string }).qrImage,
          signature: (pendingFromLatest as { signature?: string | null }).signature ?? null,
          amount: pendingFromLatest.amount,
          expiredAt: pendingFromLatest.expiredAt ? String(pendingFromLatest.expiredAt) : null,
          status: pendingFromLatest.status,
          createdAt: (pendingFromLatest as { createdAt?: string | number | null }).createdAt ?? null,
        }
      : null)

  // Polling status order — berhenti saat PAID/CANCELLED/EXPIRED.
  const pollQ = useQuery({
    queryKey: ['order-status', polled?.id],
    enabled: !!polled?.id && checkoutOpen,
    refetchInterval: (query) => {
      const st = String(
        (query.state.data as { order?: { status?: string } } | undefined)?.order?.status || '',
      ).toUpperCase()
      return polled?.id && st === 'PENDING' ? 4000 : false
    },
    refetchIntervalInBackground: false,
    staleTime: 0,
    retry: 2,
    queryFn: async ({ signal }) =>
      (
        await api.get(`/orders/${encodeURIComponent(String(polled?.id))}`, { signal })
      ).data as { order?: { id: string; status?: string; licenseId?: string | null } },
  })
  const pollStatus = String(
    (pollQ.data as { order?: { status?: string } } | undefined)?.order?.status || '',
  ).toUpperCase()
  const settledLicenseId =
    (pollQ.data as { order?: { licenseId?: string | null } } | undefined)?.order?.licenseId ?? null
  const settledCreatedAt =
    (pollQ.data as { order?: { createdAt?: string | number | null } } | undefined)?.order?.createdAt ??
    polled?.createdAt ??
    null
  const isPaid = pollStatus === 'PAID'
  const isTerminalStale =
    pollStatus === 'EXPIRED' || pollStatus === 'CANCELLED' || pollStatus === 'FAILED'

  // ── Plan catalogue → premium cards (server data only) ──
  const planList = (plansQ.data?.plans ?? []).filter(
    (p) => p.amount > 0 && p.key !== 'custom',
  ) as PlanRow[]
  const myLicense = meQ.data?.licenses?.find(
    (l) => String(l.status ?? 'active') === 'active',
  ) ?? meQ.data?.licenses?.[0]

  const availableDurations = Array.from(new Set(planList.map((p) => p.expiresInDays))).sort(
    (a, b) => a - b,
  )
  const [durationDays, setDurationDays] = useState<number | null>(null)
  const effectiveDuration =
    durationDays ?? (availableDurations.includes(90) ? 90 : availableDurations[0] ?? 0)
  const shownPlans = planList.filter((p) => p.expiresInDays === effectiveDuration)
  const currentPlanKey = myLicense?.planKey ?? null

  // ── Countdown dari expiredAt server ──
  const expiresAtMs = polled?.expiredAt ? new Date(polled.expiredAt).getTime() : null
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    if (!expiresAtMs || isPaid) return
    const iv = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [expiresAtMs, isPaid])
  const secondsLeft =
    expiresAtMs && nowTick != null && !isPaid
      ? Math.max(0, Math.floor((expiresAtMs - nowTick) / 1000))
      : null
  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  // ── Checkout real: POST /api/orders (packageKey only; amount server-side) ──
  const buy = useMutation({
    mutationFn: async (packageKey: string) =>
      (
        await api.post<{
          order: { id: string; amount?: number; packageKey?: string; createdAt?: string | number | null }
          qr: { qrUrl?: string; qrImage?: string; signature?: string | null; expiredAt?: string }
        }>('/orders', { packageKey })
      ).data,
    onSuccess: (data) => {
      setActiveOrder({
        id: data.order.id,
        qrUrl: data.qr?.qrUrl,
        qrImage: data.qr?.qrImage,
        signature: data.qr?.signature ?? null,
        amount: data.order.amount,
        expiredAt: data.qr?.expiredAt ?? null,
        createdAt: data.order.createdAt ?? null,
      })
      setCheckoutOpen(true)
      qc.invalidateQueries({ queryKey: ['orders-latest'] })
    },
    onError: () => {
      toast.error(isId ? 'Gagal membuat order — coba lagi.' : 'Failed to create order — try again.')
    },
  })
  const cancelOrder = useMutation({
    mutationFn: async (orderId: string) =>
      (await api.post(`/orders/${encodeURIComponent(orderId)}/cancel`)).data,
    onSuccess: () => {
      setActiveOrder(null)
      setCheckoutOpen(false)
      toast.success(isId ? 'Order dibatalkan.' : 'Order cancelled.')
      qc.invalidateQueries({ queryKey: ['orders-latest'] })
    },
    onError: () => {
      toast.error(isId ? 'Gagal membatalkan order.' : 'Failed to cancel order.')
    },
  })

  // Sukses: derived dari polling (bukan setState-in-effect).
  const paidOrder: (ActiveOrder & { licenseId?: string | null }) | null =
    polled && isPaid ? { ...polled, createdAt: settledCreatedAt, licenseId: settledLicenseId } : null

  useEffect(() => {
    if (paidOrder) {
      qc.invalidateQueries({ queryKey: ['me'] })
      qc.invalidateQueries({ queryKey: ['orders-latest'] })
    }
  }, [paidOrder?.id, qc])

  const handleDownloadQr = () => {
    const url = polled?.qrUrl || polled?.qrImage
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = `qris-order-${polled?.id}.png`
    a.click()
  }

  const plans = shownPlans.map((p) => ({
    key: p.key,
    name: p.name,
    price: formatIDR(p.amount),
    rawPrice: p.amount,
    period: `/${p.expiresInDays} ${isId ? 'hari' : 'days'}`,
    quota: p.quota,
    features: p.features ?? [],
    isCurrent: currentPlanKey === p.key,
  }))

  const selectedPlanKey = plans.find((p) => p.isCurrent)?.key ?? plans[0]?.key ?? null
  const [userSelected, setUserSelected] = useState<string | null>(null)
  const activePlan =
    plans.find((p) => p.key === (userSelected ?? selectedPlanKey)) ?? plans[0] ?? null

  const loadingPlans = plansQ.isLoading
  const plansError = plansQ.isError

  return (
    <div className='space-y-8 animate-fade-in max-w-7xl mx-auto pb-16'>
      {/* ── Header ── */}
      <div className='flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4'>
        <div className='space-y-1'>
          <div className='inline-flex items-center gap-1.5 rounded-full border border-[#7778FF]/30 bg-[#7778FF]/10 px-3 py-1 text-[11px] font-bold text-[#7778FF] uppercase tracking-wider'>
            <Sparkles className='size-3' />
            {isId ? 'Harga & paket' : 'Pricing'}
          </div>
          <h1 className='text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground'>
            {isId ? 'Pilih paket yang sesuai' : 'Choose the plan that fits'}
          </h1>
          <p className='text-xs sm:text-sm text-muted-foreground max-w-xl'>
            {isId
              ? 'Harga ditetapkan dan diverifikasi server — nominal tidak dapat diubah dari browser. Pembayaran QRIS terverifikasi otomatis.'
              : 'Prices are set and verified server-side — amounts cannot be altered from the browser. QRIS payments are verified automatically.'}
          </p>
        </div>

        {/* Duration segmented control */}
        {availableDurations.length > 1 && (
          <div className='flex items-center rounded-xl border border-border/80 bg-card/80 p-1 shadow-sm self-start sm:self-auto'>
            {availableDurations.map((d) => (
              <button
                key={d}
                type='button'
                onClick={() => setDurationDays(d)}
                className={cn(
                  'px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap interactive-press',
                  effectiveDuration === d
                    ? 'bg-[#7778FF] text-white shadow-md'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {isId ? `${d} hari` : `${d} days`}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Plan grid (premium) ── */}
      {loadingPlans ? (
        <div className='grid gap-5 sm:grid-cols-2 lg:grid-cols-3'>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className='h-64 rounded-2xl border border-border/60 bg-card/50 animate-pulse'
            />
          ))}
        </div>
      ) : plansError ? (
        <div className='rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center space-y-2'>
          <AlertTriangle className='size-6 text-destructive mx-auto' />
          <p className='text-sm font-semibold text-foreground'>
            {isId ? 'Katalog paket tidak dapat dimuat.' : 'Could not load the plan catalogue.'}
          </p>
          <p className='text-xs text-muted-foreground'>
            {isId ? 'Coba muat ulang halaman.' : 'Try reloading the page.'}
          </p>
        </div>
      ) : (
        <div className='grid gap-5 sm:grid-cols-2 lg:grid-cols-3 items-stretch'>
          {plans.map((p, idx) => {
            const isActive = activePlan?.key === p.key
            const highlighted = idx === 1 && plans.length > 1
            return (
              <div
                key={p.key}
                onClick={() => setUserSelected(p.key)}
                className={cn(
                  'group relative flex flex-col rounded-2xl border p-6 card-3d bevel-shine cursor-pointer transition-all interactive-press overflow-hidden',
                  isActive
                    ? 'border-[#7778FF] bg-card/95 ring-2 ring-[#7778FF]/30 shadow-[0_0_30px_rgba(119,120,255,0.18)]'
                    : 'border-border/80 bg-card/70 hover:border-[#7778FF]/40 hover:bg-card/90 hover-lift-3d',
                  highlighted && !isActive && 'border-[#7778FF]/40 bg-gradient-to-b from-[#7778FF]/[0.06] to-card/70',
                )}
              >
                {/* ambient corner glow on active */}
                {isActive && (
                  <div className='absolute -top-10 -right-10 size-32 rounded-full bg-[#7778FF]/20 blur-2xl pointer-events-none' />
                )}

                {highlighted && !p.isCurrent && (
                  <div className='absolute top-4 right-4 inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[10px] font-bold text-amber-500 uppercase tracking-wider'>
                    <Zap className='size-3' />
                    {isId ? 'Terlaris' : 'Popular'}
                  </div>
                )}
                {p.isCurrent && (
                  <div className='absolute top-4 right-4 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-500 uppercase tracking-wider'>
                    <BadgeCheck className='size-3' />
                    {isId ? 'Aktif' : 'Active'}
                  </div>
                )}

                <div className='space-y-1.5 relative'>
                  <h3 className='text-base font-bold text-foreground'>{p.name}</h3>
                  <p className='text-[11px] uppercase tracking-wider text-muted-foreground font-semibold'>
                    {p.quota ?? (isId ? 'Lisensi' : 'License')}
                  </p>
                </div>

                <div className='mt-5 flex items-baseline gap-1.5'>
                  <span className='font-mono text-[2rem] leading-none font-extrabold tracking-tight text-foreground tabular-nums'>
                    {p.price}
                  </span>
                  <span className='text-[11px] text-muted-foreground font-mono'>{p.period}</span>
                </div>

                <ul className='mt-5 space-y-2.5 text-xs flex-1'>
                  {(p.features.length ? p.features : ['core']).map((f) => (
                    <li key={f} className='flex items-center gap-2.5'>
                      <span className='size-4.5 rounded-full bg-[#7778FF]/12 border border-[#7778FF]/25 flex items-center justify-center shrink-0'>
                        <Check className='size-2.5 text-[#7778FF]' />
                      </span>
                      <span className='text-foreground/90 capitalize'>{f}</span>
                    </li>
                  ))}
                  <li className='flex items-center gap-2.5'>
                    <span className='size-4.5 rounded-full bg-[#7778FF]/12 border border-[#7778FF]/25 flex items-center justify-center shrink-0'>
                      <Check className='size-2.5 text-[#7778FF]' />
                    </span>
                    <span className='text-foreground/90'>
                      {isId ? 'Gateway AI terkelola (D-021)' : 'Managed AI gateway (D-021)'}
                    </span>
                  </li>
                  <li className='flex items-center gap-2.5'>
                    <span className='size-4.5 rounded-full bg-[#7778FF]/12 border border-[#7778FF]/25 flex items-center justify-center shrink-0'>
                      <Check className='size-2.5 text-[#7778FF]' />
                    </span>
                    <span className='text-foreground/90'>
                      {isId ? 'Lisensi Ed25519 bertanda tangan' : 'Ed25519 signed license'}
                    </span>
                  </li>
                </ul>

                <Button
                  type='button'
                  disabled={buy.isPending}
                  onClick={(e) => {
                    e.stopPropagation()
                    setUserSelected(p.key)
                    buy.mutate(p.key)
                  }}
                  className={cn(
                    'mt-6 w-full h-10 text-xs font-bold rounded-xl interactive-press transition-all',
                    isActive || highlighted
                      ? 'bg-[#7778FF] hover:bg-[#8F90FF] text-white shadow-md hover:shadow-[0_0_18px_rgba(119,120,255,0.35)]'
                      : 'bg-secondary hover:bg-secondary/80 text-foreground border border-border',
                  )}
                >
                  {buy.isPending && userSelected === p.key ? (
                    <RefreshCw className='size-3.5 animate-spin' />
                  ) : p.isCurrent ? (
                    isId ? 'Perpanjang paket' : 'Renew plan'
                  ) : (
                    isId ? 'Beli paket' : 'Buy plan'
                  )}
                </Button>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Included in all plans ── */}
      {!loadingPlans && !plansError && plans.length > 0 && (
        <div className='rounded-2xl border border-border/80 bg-card/60 p-5 sm:p-6 card-3d bevel-shine'>
          <h2 className='text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-4'>
            <ShieldCheck className='size-4 text-[#7778FF]' />
            {isId ? 'Termasuk di semua paket' : 'Included in every plan'}
          </h2>
          <div className='grid gap-x-6 gap-y-2.5 text-xs sm:grid-cols-2'>
            {[
              isId
                ? 'Gateway AI terkelola · tanpa kunci provider di aplikasi Anda'
                : 'Managed AI gateway · no provider keys in your application',
              isId
                ? 'Skill read-only dengan registri eksplisit'
                : 'Read-only skills with explicit registry',
              isId
                ? 'Permintaan gagal tidak memotong kuota'
                : 'Failed requests do not deduct quota',
              isId
                ? 'Kuota & pemakaian tercatat server-side (audit)'
                : 'Quota & usage recorded server-side (auditable)',
            ].map((line) => (
              <div key={line} className='flex items-center gap-2.5'>
                <Check className='size-4 text-emerald-500 shrink-0' />
                <span className='text-foreground'>{line}</span>
              </div>
            ))}
          </div>
          <p className='text-[11px] text-muted-foreground/75 pt-3 mt-4 border-t border-border/60'>
            {isId
              ? 'Lisensi aktif tidak berubah; paket baru berlaku setelah pembayaran dikonfirmasi server. Mode sandbox: tidak ada dana nyata ditagih.'
              : 'Active licenses remain unchanged; the new plan applies once payment is confirmed server-side. Sandbox mode: no real money is charged.'}
          </p>
        </div>
      )}

      {/* ── Pending payment banner (returning user with open order) ── */}
      {!checkoutOpen && polled && !activeOrder && (
        <div className='rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 card-3d'>
          <div className='flex items-start sm:items-center gap-4'>
            <div className='size-11 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 text-amber-500'>
              <QrCode className='size-5' />
            </div>
            <div className='space-y-0.5'>
              <div className='text-sm font-bold text-foreground'>
                {isId ? 'Ada order menunggu pembayaran' : 'You have an order awaiting payment'}
              </div>
              <div className='text-xs text-muted-foreground font-mono'>
                {polled.id.slice(0, 14)}… ·{' '}
                <span className='font-bold text-foreground'>
                  {polled.amount != null ? formatIDR(polled.amount) : '—'}
                </span>
                {secondsLeft != null && (
                  <>
                    {' · '}
                    <span className='text-amber-500 font-bold'>
                      {isId ? 'kedaluwarsa' : 'expires'} {formatTimer(secondsLeft)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <Button
            type='button'
            onClick={() => setCheckoutOpen(true)}
            className='bg-[#7778FF] hover:bg-[#8F90FF] text-white font-bold h-9 shadow-md interactive-press self-start sm:self-center'
          >
            {isId ? 'Lanjutkan pembayaran' : 'Continue payment'} <ArrowRight className='size-3.5 ml-1' />
          </Button>
        </div>
      )}

      {/* ── Checkout modal (premium, single dialog; QR → success transition) ── */}
      <Dialog
        open={checkoutOpen || !!paidOrder}
        onOpenChange={(open) => {
          if (!open && !buy.isPending) {
            setCheckoutOpen(false)
          }
        }}
      >
        <DialogContent className={cn('sm:max-w-[440px] p-0 overflow-hidden border border-border/80 bg-card/95 backdrop-blur-2xl shadow-2xl rounded-2xl', paidOrder && 'receipt-print-dialog')}>
          {/* ambient glow */}
          <div
            className={cn(
              'absolute -top-16 left-1/2 -translate-x-1/2 size-60 rounded-full blur-3xl pointer-events-none transition-colors',
              isPaid ? 'bg-emerald-500/20' : 'bg-[#7778FF]/25',
            )}
          />

          {paidOrder ? (
            /* ── SUCCESS state ── */
            <div className='receipt-print-content relative z-10 flex flex-col items-center pt-8 pb-7 px-6 text-center space-y-4'>
              <div data-receipt-hide-on-print className='relative'>
                <div className='absolute inset-0 bg-emerald-500/15 rounded-full blur-2xl' />
                <img
                  src='/app/images/grouter-hub-standalone.png'
                  alt='gRouter Hub'
                  className='w-40 h-40 object-contain dark:drop-shadow-[0_15px_25px_rgba(0,0,0,0.5)] drop-shadow-[0_12px_20px_rgba(16,185,129,0.2)]'
                />
              </div>

              <div data-receipt-hide-on-print className='space-y-1.5'>
                <div className='inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 px-3.5 py-1 text-xs font-bold text-emerald-400 shadow-sm'>
                  <BadgeCheck className='size-3.5' /> PAID · {isId ? 'dikonfirmasi server' : 'server confirmed'}
                </div>
                <DialogTitle className='text-2xl font-extrabold text-foreground pt-1 tracking-tight'>
                  {isId ? 'Pembayaran berhasil' : 'Payment successful'}
                </DialogTitle>
                <DialogDescription className='text-xs text-muted-foreground max-w-sm leading-relaxed'>
                  {isId
                    ? 'Server memverifikasi pembayaran dan menerbitkan lisensi. Lanjutkan ke instalasi untuk mengaktifkannya di aplikasi Anda.'
                    : 'The server verified your payment and issued a license. Continue to installation to activate it in your application.'}
                </DialogDescription>
              </div>

              {/* receipt */}
              <div className='w-full rounded-xl border border-border/80 bg-muted/40 p-4 text-xs font-mono space-y-2.5 text-left shadow-inner'>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground font-sans'>Order</span>
                  <span className='font-bold text-foreground'>{paidOrder.id.slice(0, 16)}…</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground font-sans'>{isId ? 'Dibayar' : 'Paid'}</span>
                  <span className='font-extrabold text-emerald-400 tabular-nums'>
                    {paidOrder.amount != null ? formatIDR(paidOrder.amount) : '—'}
                  </span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground font-sans'>Status</span>
                  <span className='font-bold text-emerald-400'>PAID · server confirmed</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground font-sans'>Date</span>
                  <span className='font-bold text-foreground'>{fmtDate(paidOrder.createdAt ?? null)}</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground font-sans'>License reference</span>
                  <span className='font-bold text-foreground'>{paidOrder.licenseId || '—'}</span>
                </div>
              </div>

              <div data-receipt-hide-on-print className='flex items-center gap-3 w-full pt-2'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => window.print()}
                  className='flex-1 h-9 text-xs border-border bg-card interactive-press gap-1.5'
                >
                  <Printer className='size-3.5' />
                  {isId ? 'Cetak bukti' : 'Print receipt'}
                </Button>
                <Button
                  asChild
                  size='sm'
                  className='flex-1 h-9 bg-[#7778FF] hover:bg-[#8F90FF] text-white text-xs font-bold shadow-md hover:shadow-[0_0_15px_rgba(119,120,255,0.4)] interactive-press'
                >
                  <Link to='/user/install'>
                    {t('btn_continue_setup')}
                    <ArrowRight className='size-3.5 ml-1.5' />
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            /* ── CHECKOUT (QR) state ── */
            <div className='relative z-10 space-y-5 pt-6 pb-6 px-6'>
              <DialogHeader className='space-y-1 text-left'>
                <div className='flex items-start justify-between gap-3'>
                  <div>
                    <DialogTitle className='text-base font-bold text-foreground flex items-center gap-2'>
                      <QrCode className='size-4 text-[#7778FF]' />
                      {isId ? 'Bayar dengan QRIS' : 'Pay with QRIS'}
                    </DialogTitle>
                    <DialogDescription className='text-[11px] text-muted-foreground font-mono mt-0.5'>
                      {activePlan?.name ?? '—'} · {effectiveDuration} {isId ? 'hari' : 'days'}
                      {polled ? ` · ${polled.id.slice(0, 10)}…` : ''}
                    </DialogDescription>
                  </div>
                  <span className='rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[10px] font-bold text-amber-500 uppercase tracking-wider shrink-0'>
                    SANDBOX
                  </span>
                </div>
              </DialogHeader>

              {/* QR area — sandbox note: provider sandbox returns a generic sample QR.
                  In production this is the real per-transaction QRIS code. */}
              <div className='relative flex flex-col items-center justify-center p-5 rounded-2xl bg-gradient-to-b from-muted/60 to-muted/30 border border-border/80 shadow-inner overflow-hidden'>
                {polled?.qrUrl || polled?.qrImage ? (
                  <a
                    href={polled?.qrUrl || polled?.qrImage}
                    target='_blank'
                    rel='noreferrer'
                    className='group relative block rounded-xl bg-white p-2.5 shadow-2xl ring-1 ring-black/5 transition-shadow duration-200 hover:shadow-[0_0_28px_rgba(119,120,255,0.35)]'
                    title={isId ? 'Buka QR di tab baru' : 'Open QR in a new tab'}
                  >
                    <img
                      src={polled?.qrImage || polled?.qrUrl}
                      alt='QRIS'
                      className='w-48 h-48 object-contain rounded-lg'
                    />
                  </a>
                ) : (
                  <div className='flex w-48 h-48 items-center justify-center'>
                    <RefreshCw className='size-6 animate-spin text-muted-foreground' />
                  </div>
                )}

                <div className='mt-3 flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 px-3 py-1 text-[10px] font-semibold text-amber-600 dark:text-amber-500'>
                  <Info className='size-3 shrink-0' />
                  <span>
                    {isId
                      ? 'Sandbox: QR contoh dari provider — pembayaran via simulator'
                      : 'Sandbox: provider sample QR — pay via the simulator'}
                  </span>
                </div>

                <div className='mt-3 font-mono text-3xl font-extrabold text-foreground tracking-tight tabular-nums'>
                  {polled?.amount != null ? formatIDR(polled.amount) : activePlan?.price ?? '—'}
                </div>

                <div className='mt-3 flex items-center gap-2.5 rounded-full border border-border/80 bg-card/85 px-4 py-1.5 text-xs text-muted-foreground shadow-xs'>
                  {isPaid ? (
                    <>
                      <span className='relative flex size-2'>
                        <span className='relative inline-flex rounded-full size-2 bg-emerald-500' />
                      </span>
                      <span className='text-emerald-500 font-semibold'>
                        {isId ? 'Pembayaran terkonfirmasi' : 'Payment confirmed'}
                      </span>
                    </>
                  ) : isTerminalStale ? (
                    <>
                      <AlertTriangle className='size-3.5 text-muted-foreground' />
                      <span>{isId ? `Order ${pollStatus.toLowerCase()}` : `Order ${pollStatus.toLowerCase()}`}</span>
                    </>
                  ) : (
                    <>
                      <span className='relative flex size-2'>
                        <span className='animate-radar-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75' />
                        <span className='relative inline-flex rounded-full size-2 bg-amber-500' />
                      </span>
                      <span>
                        {isId ? 'Menunggu pembayaran · cek otomatis tiap 4 dtk' : 'Awaiting payment · auto-checks every 4s'}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* receipt lines */}
              <div className='space-y-2.5 text-xs pt-1 border-t border-border/60'>
                {/* Transaction signature (owner-only) — for snap.js / sandbox simulator */}
                {polled?.signature ? (
                  <div className='rounded-lg border border-border/70 bg-muted/40 p-2.5 space-y-1.5'>
                    <div className='flex items-center justify-between gap-2'>
                      <span className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
                        {isId ? 'Signature transaksi' : 'Transaction signature'}
                      </span>
                      <button
                        type='button'
                        onClick={() => {
                          navigator.clipboard
                            .writeText(String(polled.signature))
                            .then(() => toast.success(isId ? 'Signature disalin' : 'Signature copied'))
                            .catch(() => toast.error(isId ? 'Gagal menyalin' : 'Copy failed'));
                        }}
                        className='inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-[10px] font-semibold text-[#7778FF] hover:bg-[#7778FF]/10 transition-colors interactive-press'
                      >
                        <Copy className='size-3' />
                        {isId ? 'Salin' : 'Copy'}
                      </button>
                    </div>
                    <p className='font-mono text-[10px] text-foreground/80 break-all leading-relaxed select-all'>
                      {polled.signature}
                    </p>
                    <p className='text-[10px] text-muted-foreground/80'>
                      {isId
                        ? 'Dipakai snap.js / simulator pembayaran provider untuk order ini.'
                        : 'Used by the provider snap.js / payment simulator for this order.'}
                    </p>
                  </div>
                ) : null}
                <div className='flex justify-between text-muted-foreground'>
                  <span>{isId ? 'Nominal' : 'Amount'}</span>
                  <span className='font-mono font-medium text-foreground tabular-nums'>
                    {polled?.amount != null ? formatIDR(polled.amount) : activePlan?.price ?? '—'}
                  </span>
                </div>
                <div className='flex justify-between text-muted-foreground'>
                  <span>{isId ? 'Biaya layanan' : 'Service fee'}</span>
                  <span className='font-mono font-medium text-emerald-500'>Rp 0</span>
                </div>
                <div className='flex justify-between text-sm font-bold text-foreground pt-1.5 border-t border-border/40'>
                  <span>{isId ? 'Total' : 'Total'}</span>
                  <span className='font-mono text-lg font-extrabold text-[#7778FF] tabular-nums'>
                    {polled?.amount != null ? formatIDR(polled.amount) : activePlan?.price ?? '—'}
                  </span>
                </div>
                <p className='text-[11px] text-muted-foreground pt-1 flex items-center justify-between'>
                  <span>
                    {isId ? 'Kedaluwarsa dalam' : 'Expires in'}{' '}
                    <span className='font-mono font-bold text-amber-500'>
                      {secondsLeft != null ? formatTimer(secondsLeft) : '—'}
                    </span>
                  </span>
                  <span className='text-[10px] inline-flex items-center gap-1'>
                    <ShieldCheck className='size-3' />
                    {isId ? 'dihitung server' : 'server computed'}
                  </span>
                </p>
              </div>

              {/* actions */}
              <div className='flex flex-col sm:flex-row items-center gap-2.5 pt-1'>
                <Button
                  variant='outline'
                  onClick={() => polled?.id && cancelOrder.mutate(polled.id)}
                  disabled={cancelOrder.isPending}
                  className='w-full sm:flex-1 h-9 border-[#FF667A]/40 bg-[#FF667A]/10 hover:bg-[#FF667A]/20 text-[#FF667A] text-xs font-semibold interactive-press'
                >
                  {cancelOrder.isPending ? (
                    <RefreshCw className='size-3.5 animate-spin' />
                  ) : (
                    <X className='size-3.5' />
                  )}
                  {isId ? 'Batalkan order' : 'Cancel order'}
                </Button>
                <Button
                  variant='outline'
                  onClick={handleDownloadQr}
                  className='w-full sm:flex-1 h-9 border-border bg-card text-xs font-medium gap-1.5 interactive-press'
                >
                  <Download className='size-3.5' /> {t('btn_download_qr')}
                </Button>
              </div>

              <p data-receipt-hide-on-print className='text-[10px] text-muted-foreground/70 text-center flex items-center justify-center gap-1.5'>
                <ReceiptText className='size-3' />
                {isId
                  ? 'Status diverifikasi server sebelum lisensi diterbitkan — bukan dari payload notifikasi.'
                  : 'Status is verified server-side before any license is issued — never from the notification payload.'}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
