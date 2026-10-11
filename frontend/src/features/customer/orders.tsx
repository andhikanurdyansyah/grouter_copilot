import { useState, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Check, Download, RefreshCw, Sparkles, Printer, ShieldCheck, ArrowRight, CheckCircle2 } from 'lucide-react'
import { useLanguage } from '@/context/language-provider'
import { cn } from '@/lib/utils'

export function CustomerOrders() {
  const { language, t } = useLanguage()
  const isId = language === 'id'

  const [duration, setDuration] = useState<'7' | '30' | '365'>('30')
  const [selectedPlan, setSelectedPlan] = useState<'starter' | 'pro' | 'enterprise'>('pro')
  const [paymentSuccessOpen, setPaymentSuccessOpen] = useState(false)
  const [timerSeconds, setTimerSeconds] = useState(761) // 12m 41s
  const [isSimulating, setIsSimulating] = useState(false)

  // Countdown clock tick
  useEffect(() => {
    const interval = setInterval(() => {
      setTimerSeconds((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  const plans = [
    {
      id: 'starter',
      name: 'Starter',
      price: duration === '7' ? 'Rp 35 rb' : duration === '30' ? 'Rp 150 rb' : 'Rp 1,6 jt',
      rawPrice: duration === '7' ? '35.000' : duration === '30' ? '150.000' : '1.620.000',
      period: duration === '7' ? '/7 hari' : duration === '30' ? '/30 hari' : '/tahun',
      desc: isId ? '500 rb token · 1 domain · fast-mini' : '500k tokens · 1 domain · fast-mini',
      sub: isId ? 'Untuk tim kecil dan uji coba' : 'For small teams and testing',
      isCurrent: false,
    },
    {
      id: 'pro',
      name: 'Pro',
      price: duration === '7' ? 'Rp 105 rb' : duration === '30' ? 'Rp 450 rb' : 'Rp 4,8 jt',
      rawPrice: duration === '7' ? '105.000' : duration === '30' ? '450.000' : '4.860.000',
      period: duration === '7' ? '/7 hari' : duration === '30' ? '/30 hari' : '/tahun',
      desc: isId ? '2 jt token · 3 domain · balanced' : '2M tokens · 3 domains · balanced',
      sub: isId ? 'Prioritas antrean gateway' : 'Gateway queue priority',
      isCurrent: true,
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: duration === '7' ? 'Rp 315 rb' : duration === '30' ? 'Rp 1,35 jt' : 'Rp 14,5 jt',
      rawPrice: duration === '7' ? '315.000' : duration === '30' ? '1.350.000' : '14.580.000',
      period: duration === '7' ? '/7 hari' : duration === '30' ? '/30 hari' : '/tahun',
      desc: isId ? '10 jt token · domain tak terbatas · pro-large' : '10M tokens · unlimited domains · pro-large',
      sub: isId ? 'Kontrak tahunan · hubungi sales' : 'Annual contract · contact sales',
      isCurrent: false,
    },
  ]

  const activePlan = plans.find((p) => p.id === selectedPlan) || plans[1]

  const handleDownloadQr = () => {
    const a = document.createElement('a')
    a.href = '/app/images/qris-code.png'
    a.download = 'qris-grouter-copilot.png'
    a.click()
  }

  const handleSimulatePayment = () => {
    setIsSimulating(true)
    setTimeout(() => {
      setIsSimulating(false)
      setPaymentSuccessOpen(true)
    }, 800)
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
          {[
            { id: '7', label: isId ? '7 hari' : '7 days' },
            { id: '30', label: isId ? '30 hari' : '30 days' },
            { id: '365', label: isId ? '1 tahun · hemat 10%' : '1 year · save 10%' },
          ].map((item) => (
            <button
              key={item.id}
              type='button'
              onClick={() => setDuration(item.id as any)}
              className={cn(
                'px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap text-center interactive-press',
                duration === item.id
                  ? 'bg-[#7778FF] text-white shadow-md'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {item.label}
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
              onClick={() => setSelectedPlan(p.id as any)}
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
                  {activePlan.name} · {duration} {isId ? 'hari' : 'days'} · ord_9QX2...T4
                </p>
              </div>
              <span className='rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[11px] font-bold text-amber-500 uppercase tracking-wide'>
                SANDBOX
              </span>
            </div>

            {/* 3D QRIS Container */}
            <div className='relative flex flex-col items-center justify-center p-6 rounded-2xl bg-muted/40 border border-border/80 shadow-inner overflow-hidden'>
              <div
                onClick={handleSimulatePayment}
                className='cursor-pointer group relative rounded-2xl bg-white p-3.5 shadow-2xl transition-shadow duration-200 hover:shadow-[0_0_24px_rgba(119,120,255,0.25)]'
                title={isId ? 'Klik QR untuk simulasikan sukses bayar' : 'Click QR to simulate payment success'}
              >
                <img
                  src='/app/images/qris-code.png'
                  alt='QRIS Code'
                  className='w-56 h-56 object-contain'
                />

                {/* Click tooltip overlay */}
                <div className='absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 rounded-2xl flex items-center justify-center transition-opacity backdrop-blur-xs'>
                  <span className='rounded-lg bg-emerald-500 text-white font-bold text-xs px-3 py-1.5 shadow-lg flex items-center gap-1.5'>
                    <Sparkles className='size-3.5' /> {isId ? 'Simulasi Sukses Bayar' : 'Simulate Paid'}
                  </span>
                </div>
              </div>

              {/* Price */}
              <div className='mt-4 font-mono text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight'>
                Rp {activePlan.rawPrice}
              </div>

              {/* Status Polling Pill with Pulsing Indicator */}
              <div className='mt-3 flex items-center gap-2.5 rounded-full border border-border/80 bg-card/85 px-4 py-1.5 text-xs text-muted-foreground shadow-xs'>
                <span className='relative flex size-2'>
                  <span className='animate-radar-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75' />
                  <span className='relative inline-flex rounded-full size-2 bg-amber-500' />
                </span>
                <span>{isId ? 'Menunggu pembayaran · cek tiap 4 dtk' : 'Waiting for payment · polls every 4s'}</span>
              </div>
            </div>

            {/* Receipt Summary */}
            <div className='space-y-2.5 text-xs pt-1 border-t border-border/60'>
              <div className='flex justify-between text-muted-foreground'>
                <span>Subtotal</span>
                <span className='font-mono font-medium text-foreground'>Rp {activePlan.rawPrice}</span>
              </div>
              <div className='flex justify-between text-muted-foreground'>
                <span>{isId ? 'Biaya layanan' : 'Service fee'}</span>
                <span className='font-mono font-medium text-emerald-500'>Rp 0</span>
              </div>
              <div className='flex justify-between text-sm font-bold text-foreground pt-1.5 border-t border-border/40'>
                <span>Total</span>
                <span className='font-mono text-lg font-extrabold text-[#7778FF]'>Rp {activePlan.rawPrice}</span>
              </div>
              <p className='text-[11px] text-muted-foreground pt-1 flex items-center justify-between'>
                <span>{isId ? 'Kedaluwarsa dalam' : 'Expires in'} <span className='font-mono font-bold text-amber-500'>{formatTimer(timerSeconds)}</span></span>
                <span className='text-[10px]'>{isId ? 'dihitung server' : 'server computed'}</span>
              </p>
            </div>

            {/* Interactive Action Buttons */}
            <div className='flex flex-col sm:flex-row items-center gap-2.5 pt-2'>
              <Button
                variant='outline'
                onClick={handleSimulatePayment}
                disabled={isSimulating}
                className='w-full sm:flex-1 h-9 border-[#7778FF]/40 bg-[#7778FF]/10 hover:bg-[#7778FF]/20 text-[#7778FF] text-xs font-semibold interactive-press'
              >
                {isSimulating ? <RefreshCw className='size-3.5 animate-spin' /> : <Sparkles className='size-3.5' />}
                {isId ? 'Simulasi Bayar' : 'Simulate Pay'}
              </Button>
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
      <Dialog open={paymentSuccessOpen} onOpenChange={setPaymentSuccessOpen}>
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
                  ? 'Server mengonfirmasi pembayaran. Lisensi Pro Anda diperpanjang hingga 12 Jan 2027.'
                  : 'Server confirmed payment. Your Pro license has been extended until 12 Jan 2027.'}
              </DialogDescription>
            </div>

            {/* Receipt Summary Card */}
            <div className='w-full rounded-xl border border-border/80 bg-muted/40 p-4 text-xs font-mono space-y-2.5 text-left shadow-inner'>
              <div className='flex justify-between'>
                <span className='text-muted-foreground font-sans'>Order ID</span>
                <span className='font-bold text-foreground'>ord_9QX2891K72L9T4</span>
              </div>
              <div className='flex justify-between'>
                <span className='text-muted-foreground font-sans'>{isId ? 'Dibayar' : 'Paid'}</span>
                <span className='font-extrabold text-emerald-400'>Rp {activePlan.rawPrice}</span>
              </div>
              <div className='flex justify-between'>
                <span className='text-muted-foreground font-sans'>{isId ? 'Kuota' : 'Quota'}</span>
                <span className='font-bold text-foreground'>{activePlan.id === 'starter' ? '500.000' : activePlan.id === 'pro' ? '2.000.000' : '10.000.000'} token</span>
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
                <Link to='/user/install' onClick={() => setPaymentSuccessOpen(false)}>
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
