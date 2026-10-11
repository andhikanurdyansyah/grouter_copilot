import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, fetchPlans, fetchMe, formatIDR } from '@/lib/grouter-api'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Check, Download, RefreshCw, Printer, ShieldCheck, ArrowRight, X } from 'lucide-react'
import { useLanguage } from '@/context/language-provider'
import { cn } from '@/lib/utils'

export function CustomerOrders() {
  const { language, t } = useLanguage()
  const isId = language === 'id'

  const qc = useQueryClient()

  // ── Data REAL ──
  const plansQ = useQuery({ queryKey: ['plans'], queryFn: fetchPlans })
  const meQ = useQuery({ queryKey: ['me'], queryFn: fetchMe })
  const latestQ = useQuery({
    queryKey: ['orders-latest'],
    queryFn: async () => (await api.get('/orders/latest')).data as {
      order: { id: string; status?: string; qrUrl?: string; amount?: number; packageKey?: string; expiredAt?: string | number | null } | null
    },
  })

  // Order yang sedang dibuat/di-poll (yang baru dibuat menang atas latest)
  const [activeOrder, setActiveOrder] = useState<{ id: string; qrUrl?: string; qrImage?: string; amount?: number; expiredAt?: string | null } | null>(null)
  const pendingFromLatest = (() => {
    const o = latestQ.data?.order
    return o && String(o.status || '').toUpperCase() === 'PENDING' ? o : null
  })()
  const polled = activeOrder ?? (pendingFromLatest ? { id: pendingFromLatest.id, qrUrl: pendingFromLatest.qrUrl, amount: pendingFromLatest.amount, expiredAt: String(pendingFromLatest.expiredAt ?? '') } : null)

  // Polling status order (server-side verify; stop saat PAID/CANCELLED/EXPIRED)
  const pollQ = useQuery({
    queryKey: ['order-status', polled?.id],
    enabled: !!polled?.id,
    refetchInterval: (query) => {
      const st = String((query.state.data as { order?: { status?: string } } | undefined)?.order?.status || '').toUpperCase()
      return polled?.id && st === 'PENDING' ? 4000 : false
    },
    refetchIntervalInBackground: false,
    staleTime: 0,
    retry: 2,
    queryFn: async ({ signal }) =>
      (await api.get(`/orders/${encodeURIComponent(String(polled?.id))}`, { signal })).data as { order?: { id: string; status?: string } },
  })
  const pollStatus = String((pollQ.data as { order?: { status?: string } } | undefined)?.order?.status || '').toUpperCase()

  // ── Mapping paket server → kartu desain Jie ──
  const planList = (plansQ.data?.plans ?? []).filter((p) => p.amount > 0 && p.key !== 'custom')
  const myLicense = meQ.data?.licenses?.find((l) => String(l.status ?? 'active') === 'active') ?? meQ.data?.licenses?.[0]

  // Toggle periode: diterapkan sebagai filter paket per expiresInDays yang ADA di katalog server.
  const availableDurations = Array.from(new Set(planList.map((p) => p.expiresInDays))).sort((a, b) => a - b)
  const [durationDays, setDurationDays] = useState<number | null>(null)
  const effectiveDuration = durationDays ?? (availableDurations.includes(30) ? 30 : availableDurations[0] ?? 0)
  const shownPlans = planList.filter((p) => p.expiresInDays === effectiveDuration)

  const plans = shownPlans.map((p) => ({
    id: p.key,
    key: p.key,
    name: p.name,
    price: formatIDR(p.amount),
    rawPrice: p.amount,
    period: `/${p.expiresInDays} ${p.expiresInDays >= 365 ? (isId ? 'hari' : 'days') : isId ? 'hari' : 'days'}`,
    desc: p.quota ? `${p.quota.toLocaleString('id-ID')} token` : (isId ? 'Paket kuota' : 'Quota plan'),
    sub: (p.features ?? []).join(' · ') || '—',
    isCurrent: myLicense?.planKey === p.key,
  }))
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const activePlan = plans.find((p) => p.id === selectedPlan) ?? plans.find((p) => myLicense?.planKey === p.key) ?? plans[0]

  // Timer kedaluwarsa dari server (expiredAt order), bukan angka hardcode
  const expiresAtMs = polled?.expiredAt ? new Date(polled.expiredAt).getTime() : null
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    if (!expiresAtMs) return
    const iv = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [expiresAtMs])
  const secondsLeft = expiresAtMs && nowTick != null ? Math.max(0, Math.floor((expiresAtMs - nowTick) / 1000)) : null
  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  // ── Checkout real: POST /api/orders (hanya packageKey; nominal dari server) ──
  const buy = useMutation({
    mutationFn: async (packageKey: string) =>
      (await api.post<{ order: { id: string; amount?: number; packageKey?: string }; qr: { qrUrl?: string; qrImage?: string; expiredAt?: string } }>('/orders', { packageKey })).data,
    onSuccess: (data) => {
      setActiveOrder({ id: data.order.id, qrUrl: data.qr?.qrUrl, qrImage: data.qr?.qrImage, amount: data.order.amount, expiredAt: data.qr?.expiredAt ?? null })
      qc.invalidateQueries({ queryKey: ['orders-latest'] })
    },
  })
  const cancelOrder = useMutation({
    mutationFn: async (orderId: string) => (await api.post(`/orders/${encodeURIComponent(orderId)}/cancel`)).data,
    onSuccess: () => {
      setActiveOrder(null)
      qc.invalidateQueries({ queryKey: ['orders-latest'] })
    },
  })

  // Modal sukses muncul HANYA saat server mengonfirmasi PAID (polling) — derived, tanpa setState-in-effect.
  const paidOrderRef = polled?.id && pollStatus === 'PAID' ? polled : null
  useEffect(() => {
    if (paidOrderRef) {
      qc.invalidateQueries({ queryKey: ['me'] })
      qc.invalidateQueries({ queryKey: ['orders-latest'] })
    }
  }, [paidOrderRef?.id, qc])

  const handleDownloadQr = () => {
    const url = polled?.qrUrl || polled?.qrImage
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = `qris-order-${polled?.id}.png`
    a.click()
  }

  return (
    <div className='space-y-6 animate-fade-in'>
      {/* ── Top Header Row ── */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight text-foreground'>
            {isId ? 'Paket & harga' : 'Plans & pricing'}
          </h1>
          <p className='text-xs sm:text-sm text-muted-foreground mt-0.5'>
            {isId
              ? 'Harga ditetapkan server. Pembayaran QRIS dalam mode sandbox terverifikasi otomatis.'
              : 'Prices set server-side. QRIS payments in auto-verified sandbox mode.'}
          </p>
        </div>

        {/* Duration Segmented Toggle */}
        <div className='flex items-center rounded-xl border border-border/80 bg-card/80 p-1 shadow-sm self-start sm:self-auto'>
          {availableDurations.map((d) => (
            <button
              key={d}
              type='button'
              onClick={() => setDurationDays(d)}
              className={cn(
                'px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap text-center interactive-press',
                effectiveDuration === d
                  ? 'bg-[#7778FF] text-white shadow-md'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {isId ? `${d} hari` : `${d} days`}
            </button>
          ))}
        </div>
      </div>

      {/* ── 2 Column Grid: Left Plans (7 cols) + Right 3D QRIS Checkout (5 cols) ── */}
      <div className='grid grid-cols-1 lg:grid-cols-12 gap-6'>
        {/* Left Column (7 cols): 3D Plan Cards */}
        <div className='lg:col-span-7 space-y-4'>
          {plans.map((p) => (
            <div
              key={p.id}
              onClick={() => setSelectedPlan(p.id)}
              className={cn(
                'rounded-xl border p-5 card-3d bevel-shine cursor-pointer transition-all flex items-start justify-between gap-4 interactive-press',
                selectedPlan === p.id
                  ? 'border-[#7778FF] bg-card/95 ring-2 ring-[#7778FF]/30 shadow-[0_0_25px_rgba(119,120,255,0.2)]'
                  : 'border-border/80 bg-card/75 hover:border-border hover:bg-card/90 hover-lift-3d'
              )}
            >
              <div className='flex items-start gap-3.5'>
                <div
                  className={cn(
                    'mt-0.5 size-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
                    selectedPlan === p.id
                      ? 'border-[#7778FF] bg-[#7778FF]'
                      : 'border-muted-foreground/40 bg-transparent'
                  )}
                >
                  {selectedPlan === p.id && <div className='size-2 rounded-full bg-white shadow-xs' />}
                </div>

                <div className='space-y-1'>
                  <div className='flex items-center gap-2'>
                    <span className='font-bold text-base text-foreground'>{p.name}</span>
                    {p.isCurrent && (
                      <span className='rounded-full bg-[#7778FF]/15 border border-[#7778FF]/30 px-2.5 py-0.5 text-[11px] font-bold text-[#7778FF]'>
                        {isId ? 'Paket saat ini' : 'Current plan'}
                      </span>
                    )}
                  </div>
                  <p className='text-xs text-muted-foreground'>{p.desc}</p>
                  <p className='text-[11px] text-muted-foreground/80 font-mono'>{p.sub}</p>
                </div>
              </div>

              <div className='text-right shrink-0'>
                <div className='font-mono font-extrabold text-lg sm:text-xl text-foreground'>{p.price}</div>
                <div className='text-[11px] text-muted-foreground font-mono'>{p.period}</div>
              </div>
            </div>
          ))}

          {/* Inclusions Card: Termasuk di semua paket */}
          <div className='rounded-xl border border-border/80 bg-card/75 p-5 card-3d bevel-shine space-y-3.5 pt-4'>
            <h2 className='text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2'>
              <ShieldCheck className='size-4 text-[#7778FF]' />
              {isId ? 'Termasuk di semua paket' : 'Included in all plans'}
            </h2>
            <div className='space-y-2.5 text-xs text-muted-foreground'>
              <div className='flex items-center gap-2.5'>
                <Check className='size-4 text-emerald-500 shrink-0' />
                <span className='text-foreground'>{isId ? 'Gateway AI terkelola · tanpa kunci provider di aplikasi Anda' : 'Managed AI Gateway · no provider keys in your application'}</span>
              </div>
              <div className='flex items-center gap-2.5'>
                <Check className='size-4 text-emerald-500 shrink-0' />
                <span className='text-foreground'>{isId ? 'Skill read-only dengan registri eksplisit' : 'Read-only skills with explicit registry'}</span>
              </div>
              <div className='flex items-center gap-2.5'>
                <Check className='size-4 text-emerald-500 shrink-0' />
                <span className='text-foreground'>{isId ? 'Permintaan gagal tidak memotong kuota' : 'Failed requests do not deduct quota'}</span>
              </div>
              <div className='flex items-center gap-2.5'>
                <Check className='size-4 text-emerald-500 shrink-0' />
                <span className='text-foreground'>{isId ? 'Lisensi bertanda tangan Ed25519' : 'Ed25519 cryptographically signed license'}</span>
              </div>
            </div>
            <p className='text-[11px] text-muted-foreground/75 pt-2 border-t border-border/60'>
              {isId
                ? 'Lisensi yang sedang berjalan tidak berubah; paket baru berlaku setelah pembayaran dikonfirmasi server.'
                : 'Active licenses remain unchanged; new plan takes effect upon server payment confirmation.'}
            </p>
          </div>
        </div>

        {/* Right Column: 3D QRIS Checkout Box with Laser Scanline (5 cols) */}
        <div className='lg:col-span-5 space-y-4'>
          <div className='rounded-xl border border-border/80 bg-card/85 p-6 card-3d bevel-shine space-y-5'>
            <div className='flex items-start justify-between'>
              <div>
                <h2 className='text-base font-bold text-foreground'>
                  {isId ? 'Bayar dengan QRIS' : 'Pay with QRIS'}
                </h2>
                <p className='text-xs text-muted-foreground font-mono mt-0.5'>
                  {activePlan?.name ?? '—'} · {effectiveDuration} {isId ? 'hari' : 'days'}{polled ? ` · ${polled.id.slice(0, 10)}...` : ''}
                </p>
              </div>
              <span className='rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[11px] font-bold text-amber-500 uppercase tracking-wide'>
                SANDBOX
              </span>
            </div>

            {/* 3D QRIS Container */}
            <div className='relative flex flex-col items-center justify-center p-6 rounded-2xl bg-muted/40 border border-border/80 shadow-inner overflow-hidden'>
              {polled?.qrUrl || polled?.qrImage ? (
                <a
                  href={polled?.qrUrl || polled?.qrImage}
                  target='_blank'
                  rel='noreferrer'
                  className='group relative block rounded-2xl bg-white p-3.5 shadow-2xl transition-shadow duration-200 hover:shadow-[0_0_24px_rgba(119,120,255,0.25)]'
                  title={isId ? 'Buka QR di tab baru' : 'Open QR in a new tab'}
                >
                  <img
                    src={polled?.qrImage || polled?.qrUrl}
                    alt='QRIS Code'
                    className='w-56 h-56 object-contain'
                  />
                </a>
              ) : (
                <div className='flex w-56 h-56 rounded-2xl border border-dashed border-border items-center justify-center text-xs text-muted-foreground text-center px-4'>
                  {isId ? 'Pilih paket lalu tekan "Bayar dengan QRIS" untuk membuat QR' : 'Pick a plan then press "Pay with QRIS" to generate a QR'}
                </div>
              )}

              {/* Price — nominal server-side */}
              <div className='mt-4 font-mono text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight'>
                {polled?.amount != null ? formatIDR(polled.amount) : (activePlan?.price ?? '—')}
              </div>

              {/* Status Polling Pill with Pulsing Indicator */}
              <div className='mt-3 flex items-center gap-2.5 rounded-full border border-border/80 bg-card/85 px-4 py-1.5 text-xs text-muted-foreground shadow-xs'>
                <span className='relative flex size-2'>
                  <span className='animate-radar-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75' />
                  <span className='relative inline-flex rounded-full size-2 bg-amber-500' />
                </span>
                <span>{pollStatus === 'PAID' ? (isId ? 'Pembayaran terkonfirmasi' : 'Payment confirmed') : polled ? (isId ? 'Menunggu pembayaran · cek tiap 4 dtk' : 'Waiting for payment · polls every 4s') : (isId ? 'Belum ada order aktif' : 'No active order')}</span>
              </div>
            </div>

            {/* Receipt Summary */}
            <div className='space-y-2.5 text-xs pt-1 border-t border-border/60'>
              <div className='flex justify-between text-muted-foreground'>
                <span>Subtotal</span>
                <span className='font-mono font-medium text-foreground'>{polled?.amount != null ? formatIDR(polled.amount) : (activePlan?.price ?? '—')}</span>
              </div>
              <div className='flex justify-between text-muted-foreground'>
                <span>{isId ? 'Biaya layanan' : 'Service fee'}</span>
                <span className='font-mono font-medium text-emerald-500'>Rp 0</span>
              </div>
              <div className='flex justify-between text-sm font-bold text-foreground pt-1.5 border-t border-border/40'>
                <span>Total</span>
                <span className='font-mono text-lg font-extrabold text-[#7778FF]'>{polled?.amount != null ? formatIDR(polled.amount) : (activePlan?.price ?? '—')}</span>
              </div>
              <p className='text-[11px] text-muted-foreground pt-1 flex items-center justify-between'>
                <span>{isId ? 'Kedaluwarsa dalam' : 'Expires in'} <span className='font-mono font-bold text-amber-500'>{secondsLeft != null ? formatTimer(secondsLeft) : '—'}</span></span>
                <span className='text-[10px]'>{isId ? 'dihitung server' : 'server computed'}</span>
              </p>
            </div>

            {/* Interactive Action Buttons */}
            <div className='flex flex-col sm:flex-row items-center gap-2.5 pt-2'>
              {polled ? (
                <Button
                  variant='outline'
                  onClick={() => polled?.id && cancelOrder.mutate(polled.id)}
                  disabled={cancelOrder.isPending}
                  className='w-full sm:flex-1 h-9 border-[#FF667A]/40 bg-[#FF667A]/10 hover:bg-[#FF667A]/20 text-[#FF667A] text-xs font-semibold interactive-press'
                >
                  {cancelOrder.isPending ? <RefreshCw className='size-3.5 animate-spin' /> : <X className='size-3.5' />}
                  {isId ? 'Batalkan order' : 'Cancel order'}
                </Button>
              ) : (
                <Button
                  onClick={() => activePlan && buy.mutate(activePlan.key)}
                  disabled={buy.isPending || !activePlan}
                  className='w-full sm:flex-1 h-9 bg-[#7778FF] hover:bg-[#8F90FF] text-white text-xs font-semibold interactive-press'
                >
                  {buy.isPending ? <RefreshCw className='size-3.5 animate-spin' /> : <ShieldCheck className='size-3.5' />}
                  {isId ? 'Bayar dengan QRIS' : 'Pay with QRIS'}
                </Button>
              )}
              <Button
                variant='outline'
                onClick={handleDownloadQr}
                className='w-full sm:flex-1 h-9 border-border bg-card text-xs font-medium gap-1.5 interactive-press'
              >
                <Download className='size-3.5' /> {t('btn_download_qr')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── 3D Payment Success Modal (Moda page-64 1:1) ── */}
      <Dialog open={!!paidOrderRef} onOpenChange={() => {}}>
        <DialogContent className='sm:max-w-md p-0 overflow-hidden border border-border/80 bg-card/95 backdrop-blur-2xl shadow-2xl rounded-2xl'>
          {/* Ambient Lighting inside Modal */}
          <div className='absolute -top-16 left-1/2 -translate-x-1/2 size-60 rounded-full bg-[#7778FF]/25 blur-3xl pointer-events-none' />

          {/* Standalone Metallic 3D Router Hub Graphic */}
          <div className='flex flex-col items-center pt-8 pb-5 px-6 text-center space-y-4 relative z-10'>
            <div className='relative'>
              <div className='absolute inset-0 bg-[#7778FF]/15 rounded-full blur-2xl' />
              <img
                src='/app/images/grouter-hub-standalone.png'
                alt='gRouter Hub'
                className='w-44 h-44 object-contain dark:drop-shadow-[0_15px_25px_rgba(0,0,0,0.5)] drop-shadow-[0_12px_20px_rgba(119,120,255,0.2)] transition-transform duration-300'
              />
            </div>

            <div className='space-y-1.5'>
              <div className='inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 px-3.5 py-1 text-xs font-bold text-emerald-400 shadow-sm'>
                <Check className='size-3.5' /> PAID · {isId ? 'dikonfirmasi' : 'confirmed'}
              </div>
              <DialogTitle className='text-2xl font-extrabold text-foreground pt-1 tracking-tight'>
                {isId ? 'Pembayaran berhasil' : 'Payment Successful'}
              </DialogTitle>
              <DialogDescription className='text-xs text-muted-foreground max-w-sm leading-relaxed'>
                {isId
                  ? 'Server mengonfirmasi pembayaran. Lisensi Anda sudah aktif — cek halaman Lisensi & Instalasi.'
                  : 'Server confirmed payment. Your license is active — see License & Installation.'}
              </DialogDescription>
            </div>

            {/* Receipt Summary Card */}
            <div className='w-full rounded-xl border border-border/80 bg-muted/40 p-4 text-xs font-mono space-y-2.5 text-left shadow-inner'>
              <div className='flex justify-between'>
                <span className='text-muted-foreground font-sans'>Order ID</span>
                <span className='font-bold text-foreground'>{paidOrderRef?.id}</span>
              </div>
              <div className='flex justify-between'>
                <span className='text-muted-foreground font-sans'>{isId ? 'Dibayar' : 'Paid'}</span>
                <span className='font-extrabold text-emerald-400'>{paidOrderRef?.amount != null ? formatIDR(paidOrderRef.amount) : '—'}</span>
              </div>
              <div className='flex justify-between'>
                <span className='text-muted-foreground font-sans'>{isId ? 'Kuota' : 'Quota'}</span>
                <span className='font-bold text-foreground'>{isId ? 'sesuai paket' : 'per plan'}</span>
              </div>
            </div>

            {/* Actions */}
            <div className='flex items-center gap-3 w-full pt-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => window.print()}
                className='flex-1 h-9 text-xs border-border bg-card interactive-press gap-1.5'
              >
                <Printer className='size-3.5' />
                {isId ? 'Cetak / Bukti' : 'Print receipt'}
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
        </DialogContent>
      </Dialog>
    </div>
  )
}
