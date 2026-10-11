import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchCustomerStatus, fetchCustomerOrders } from '@/lib/grouter-api'
import { Button } from '@/components/ui/button'
import { Hourglass, ShieldCheck, Zap, KeyRound, ChevronRight, CheckCircle2, AlertCircle, QrCode, Sparkles, X } from 'lucide-react'
import { useLanguage } from '@/context/language-provider'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

export function CustomerOverview() {
  const { language, t } = useLanguage()
  const isId = language === 'id'

  const status = useQuery({ queryKey: ['customer-status'], queryFn: fetchCustomerStatus })
  const orders = useQuery({ queryKey: ['customer-orders'], queryFn: fetchCustomerOrders })

  const [qrisModalOpen, setQrisModalOpen] = useState(false)
  const [isSimulating, setIsSimulating] = useState(false)
  const [isPaid, setIsPaid] = useState(false)
  const [selectedReq, setSelectedReq] = useState<{ skill: string; time: string; status: string; isOk: boolean; latency: string } | null>(null)

  const handleSimulatePayment = () => {
    setIsSimulating(true)
    setTimeout(() => {
      setIsSimulating(false)
      setIsPaid(true)
      setQrisModalOpen(false)
    }, 1000)
  }

  // 14-day token usage history with coordinates for interactive hover tracking
  const usageHistory = [
    { date: '28/9', fullDate: '28 Sep 2026', tokens: 62450, x: 20, y: 145 },
    { date: '29/9', fullDate: '29 Sep 2026', tokens: 78100, x: 65, y: 120 },
    { date: '30/9', fullDate: '30 Sep 2026', tokens: 71200, x: 110, y: 135 },
    { date: '1/10', fullDate: '1 Okt 2026', tokens: 94800, x: 155, y: 100 },
    { date: '2/10', fullDate: '2 Okt 2026', tokens: 46200, x: 200, y: 165 },
    { date: '3/10', fullDate: '3 Okt 2026', tokens: 38900, x: 245, y: 175 },
    { date: '4/10', fullDate: '4 Okt 2026', tokens: 104500, x: 290, y: 85 },
    { date: '5/10', fullDate: '5 Okt 2026', tokens: 112000, x: 335, y: 75 },
    { date: '6/10', fullDate: '6 Okt 2026', tokens: 110400, x: 380, y: 78 },
    { date: '7/10', fullDate: '7 Okt 2026', tokens: 118200, x: 425, y: 65 },
    { date: '8/10', fullDate: '8 Okt 2026', tokens: 122800, x: 470, y: 58 },
    { date: '9/10', fullDate: '9 Okt 2026', tokens: 59300, x: 515, y: 148 },
    { date: '10/10', fullDate: '10 Okt 2026', tokens: 54100, x: 560, y: 155 },
    { date: '11/10', fullDate: '11 Okt 2026', tokens: 138420, x: 600, y: 30 },
  ]

  const [activePointIndex, setActivePointIndex] = useState<number | null>(null)
  const activePoint = activePointIndex !== null ? usageHistory[activePointIndex] : null

  // Recent requests mockup matching Moda page-48
  const recentRequests = [
    { skill: 'orders.list', time: '14:22 · 1.284 token', status: 'ok', isOk: true, latency: '42ms' },
    { skill: 'tickets.list', time: '13:58 · 938 token', status: 'ok', isOk: true, latency: '38ms' },
    {
      skill: 'customers.find',
      time: isId ? '13:41 · gagal, tidak ditagih' : '13:41 · failed, not billed',
      status: 'error',
      isOk: false,
      latency: '1.82s',
    },
    { skill: 'orders.list', time: '12:07 · 1.610 token', status: 'ok', isOk: true, latency: '45ms' },
  ]

  // Interactive mouse / touch tracker for SVG chart
  const updateActivePointFromClientX = (clientX: number, target: SVGSVGElement) => {
    const rect = target.getBoundingClientRect()
    const relativeX = (clientX - rect.left) / rect.width
    const targetIdx = Math.min(
      usageHistory.length - 1,
      Math.max(0, Math.round(relativeX * (usageHistory.length - 1)))
    )
    setActivePointIndex(targetIdx)
  }

  const handleChartMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    updateActivePointFromClientX(e.clientX, e.currentTarget)
  }

  const handleChartTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (!e.touches[0]) return
    updateActivePointFromClientX(e.touches[0].clientX, e.currentTarget)
  }

  const handleChartKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      setActivePointIndex((prev) => (prev === null ? 0 : Math.min(usageHistory.length - 1, prev + 1)))
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setActivePointIndex((prev) => (prev === null ? usageHistory.length - 1 : Math.max(0, prev - 1)))
    } else if (e.key === 'Escape') {
      setActivePointIndex(null)
    }
  }

  return (
    <div className='space-y-6 animate-fade-in'>
      {/* ── 3D Hero Banner with Floating Router Hub Cluster (Moda page-48) ── */}
      <div className='relative overflow-hidden rounded-2xl border border-border/80 bg-card/85 p-6 md:p-8 card-3d bevel-shine flex flex-col md:flex-row items-start md:items-center justify-between gap-8 group'>
        {/* Ambient background glow inside hero */}
        <div className='absolute -top-24 -right-12 size-96 rounded-full bg-[#7778FF]/15 blur-3xl pointer-events-none' />
        <div className='absolute -bottom-20 -left-12 size-80 rounded-full bg-[#4CC9F0]/10 blur-3xl pointer-events-none' />

        <div className='space-y-3.5 max-w-xl z-10'>
          <div className='inline-flex items-center gap-2 rounded-full border border-[#7778FF]/30 bg-[#7778FF]/10 px-3 py-1 text-xs font-semibold text-[#7778FF] uppercase tracking-wider font-mono shadow-xs'>
            <span className='size-1.5 rounded-full bg-[#7778FF] animate-pulse' />
            {isId ? 'Langkah 3 dari 5 · Definisikan skill' : 'Step 3 of 5 · Define skills'}
          </div>

          <h1 className='text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground'>
            {isId ? 'Selamat siang, Rina' : 'Good afternoon, Rina'}
          </h1>

          <p className='text-xs sm:text-sm text-muted-foreground leading-relaxed'>
            {isId
              ? 'Copilot aktif di pt-maju.id. Tambahkan skill read-only agar Copilot bisa menjawab pertanyaan tentang data Anda secara real-time dan terisolasi.'
              : 'Copilot is active on pt-maju.id. Add read-only skills so Copilot can answer questions about your data in real-time and isolated.'}
          </p>

          <div className='flex flex-wrap items-center gap-3 pt-2'>
            <Button
              asChild
              className='h-9 sm:h-10 bg-[#7778FF] hover:bg-[#8F90FF] text-white font-semibold text-xs sm:text-sm rounded-lg shadow-md hover:shadow-[0_0_20px_rgba(119,120,255,0.4)] transition-all interactive-press gap-2'
            >
              <Link to='/user/install'>
                {t('btn_continue_setup')}
                <ChevronRight className='size-4' />
              </Link>
            </Button>
            <Button
              asChild
              variant='outline'
              className='h-9 sm:h-10 border-border bg-card/70 hover:bg-muted text-foreground font-medium text-xs sm:text-sm rounded-lg transition-all interactive-press'
            >
              <Link to='/user/install'>
                {isId ? 'Lihat panduan' : 'View guide'}
              </Link>
            </Button>
          </div>
        </div>

        {/* 3D Graphic Cluster with Static Clean Badges */}
        <div className='shrink-0 self-center md:self-auto relative flex items-center justify-center p-4'>
          {/* Radial ambient cyber glow behind cluster */}
          <div className='radial-glow-hub' />

          {/* 3D Cluster Graphic */}
          <div className='relative z-10'>
            <img
              src='/app/images/grouter-hub-cluster.png'
              alt='gRouter Cluster'
              className='w-56 sm:w-64 md:w-72 object-contain dark:drop-shadow-[0_20px_25px_rgba(0,0,0,0.5)] drop-shadow-[0_12px_20px_rgba(119,120,255,0.18)] transition-transform duration-300'
            />

            {/* Holographic Badge 1 */}
            <div className='absolute -top-1 -left-2 hidden sm:flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-card/95 backdrop-blur-md px-2.5 py-1 text-[11px] font-semibold text-emerald-400 shadow-md'>
              <ShieldCheck className='size-3 text-emerald-400' />
              <span>Ed25519 Signed</span>
            </div>

            {/* Holographic Badge 2 */}
            <div className='absolute -bottom-1 -right-1 hidden sm:flex items-center gap-1.5 rounded-full border border-[#4CC9F0]/30 bg-card/95 backdrop-blur-md px-2.5 py-1 text-[11px] font-semibold text-[#4CC9F0] shadow-md'>
              <Zap className='size-3 text-[#4CC9F0]' />
              <span>42ms Latency</span>
            </div>

            {/* Holographic Badge 3 */}
            <div className='absolute top-1/2 -right-4 hidden lg:flex items-center gap-1.5 rounded-full border border-[#7778FF]/30 bg-card/95 backdrop-blur-md px-2.5 py-1 text-[11px] font-semibold text-[#7778FF] shadow-md'>
              <KeyRound className='size-3 text-[#7778FF]' />
              <span>Zero-Trust</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Contextual QRIS Payment Warning / Success Banner ── */}
      {isPaid ? (
        <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 shadow-sm bevel-shine transition-all'>
          <div className='flex items-center gap-3 text-xs sm:text-sm text-foreground'>
            <div className='size-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 text-emerald-500'>
              <CheckCircle2 className='size-4' />
            </div>
            <div>
              <span className='font-semibold text-emerald-400'>
                {isId ? 'Pembayaran QRIS Berhasil Dikonfirmasi' : 'QRIS Payment Successfully Confirmed'}
              </span>
              <span className='text-muted-foreground font-mono text-xs block sm:inline sm:ml-2'>
                · Pro · 30 hari · Lisensi aktif hingga 12 Jan 2027
              </span>
            </div>
          </div>
          <Button
            asChild
            size='sm'
            variant='outline'
            className='h-8 border-emerald-500/30 bg-card text-xs text-foreground font-semibold shadow-xs interactive-press shrink-0'
          >
            <Link to='/user/payments'>
              {isId ? 'Lihat Bukti Pembayaran →' : 'View Payment Receipt →'}
            </Link>
          </Button>
        </div>
      ) : (
        <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 shadow-sm bevel-shine transition-all'>
          <div className='flex items-center gap-3 text-xs sm:text-sm text-foreground'>
            <div className='size-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 text-amber-500'>
              <Hourglass className='size-4' />
            </div>
            <div>
              <span className='font-semibold'>
                {isId
                  ? 'Perpanjangan Pro · 30 hari menunggu pembayaran QRIS'
                  : 'Pro renewal · 30 days awaiting QRIS payment'}
              </span>
              <span className='text-amber-500/90 font-mono text-xs block sm:inline sm:ml-2'>
                · {isId ? 'kedaluwarsa dalam 12:41' : 'expires in 12:41'}
              </span>
            </div>
          </div>
          <Button
            type='button'
            onClick={() => setQrisModalOpen(true)}
            size='sm'
            className='h-8 bg-[#7778FF] hover:bg-[#8F90FF] text-white text-xs font-semibold shadow-xs interactive-press shrink-0'
          >
            {isId ? 'Lanjutkan pembayaran →' : 'Continue payment →'}
          </Button>
        </div>
      )}

      {/* ── 4-KPI Bento Metric Cards (Moda page-48) ── */}
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
        {/* KPI 1: Status lisensi */}
        <div className='rounded-xl border border-border/80 bg-card/80 p-5 card-3d hover-lift-3d bevel-shine'>
          <p className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
            {isId ? 'Status lisensi' : 'License status'}
          </p>
          <div className='mt-2.5 flex items-center gap-2.5'>
            {/* Pulsing Dual-Layer Radar Indicator */}
            <span className='relative flex size-3'>
              <span className='animate-radar-ping absolute inline-flex h-full w-full rounded-full bg-[#39D6A0] opacity-75' />
              <span className='relative inline-flex rounded-full size-3 bg-[#39D6A0] shadow-[0_0_10px_#39D6A0]' />
            </span>
            <span className='text-2xl sm:text-3xl font-extrabold text-foreground'>
              {isId ? 'Aktif' : 'Active'}
            </span>
          </div>
          <p className='mt-2 text-[11px] text-muted-foreground font-mono'>
            Ed25519 · pt-maju.id
          </p>
        </div>

        {/* KPI 2: Sisa kuota token */}
        <div className='rounded-xl border border-border/80 bg-card/80 p-5 card-3d hover-lift-3d bevel-shine'>
          <p className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
            {isId ? 'Sisa kuota token' : 'Remaining tokens'}
          </p>
          <p className='mt-2 text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-foreground'>
            715.670
          </p>
          <p className='mt-2 text-[11px] text-muted-foreground'>
            {isId ? 'dari 2.000.000 token bulanan' : 'of 2,000,000 monthly tokens'}
          </p>
        </div>

        {/* KPI 3: Permintaan 14h */}
        <div className='rounded-xl border border-border/80 bg-card/80 p-5 card-3d hover-lift-3d bevel-shine'>
          <p className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
            {isId ? 'Permintaan · 14h' : 'Requests · 14d'}
          </p>
          <p className='mt-2 text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-foreground'>
            1.842
          </p>
          <p className='mt-2 text-[11px] text-[#39D6A0] font-medium flex items-center gap-1'>
            <span>▲</span> 18,2% {isId ? 'vs periode lalu' : 'vs last period'}
          </p>
        </div>

        {/* KPI 4: Berakhir */}
        <div className='rounded-xl border border-border/80 bg-card/80 p-5 card-3d hover-lift-3d bevel-shine'>
          <p className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
            {isId ? 'Berakhir' : 'Expires'}
          </p>
          <p className='mt-2 text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-foreground'>
            12 Jan 2027
          </p>
          <p className='mt-2 text-[11px] text-muted-foreground'>
            {isId ? '92 hari tersisa' : '92 days remaining'}
          </p>
        </div>
      </div>

      {/* ── Middle Grid: Interactive Pemakaian token curve (8 cols) + Permintaan terbaru (4 cols) ── */}
      <div className='grid grid-cols-1 lg:grid-cols-12 gap-5'>
        {/* Pemakaian token curve chart */}
        <div className='lg:col-span-8 rounded-xl border border-border/80 bg-card/80 p-5 card-3d hover-lift-3d bevel-shine space-y-4'>
          <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2'>
            <div>
              <h2 className='text-base font-bold text-foreground'>
                {isId ? 'Pemakaian token' : 'Token usage'}
              </h2>
              <p className='text-xs text-muted-foreground'>
                {isId ? '14 hari · arahkan kursor atau gunakan panah keyboard' : '14 days · hover or use arrow keys for details'}
              </p>
            </div>
            <div className='inline-flex items-center gap-2 rounded-lg border border-border/70 bg-card/60 px-3 py-1 text-xs text-muted-foreground font-mono'>
              <span className='size-2 rounded-full bg-[#7778FF]' />
              <span>{isId ? 'Rata-rata: 82.710 token/hari' : 'Average: 82,710 tokens/day'}</span>
            </div>
          </div>

          <div className='relative h-64 w-full pt-4'>
            <svg
              className='h-full w-full overflow-visible cursor-crosshair focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#7778FF]'
              viewBox='0 0 620 200'
              preserveAspectRatio='none'
              tabIndex={0}
              role='region'
              aria-label={isId ? 'Grafik riwayat pemakaian token 14 hari' : '14-day token usage history chart'}
              onMouseMove={handleChartMouseMove}
              onMouseLeave={() => setActivePointIndex(null)}
              onTouchStart={handleChartTouchMove}
              onTouchMove={handleChartTouchMove}
              onTouchEnd={() => setActivePointIndex(null)}
              onKeyDown={handleChartKeyDown}
            >
              <defs>
                <linearGradient id='gradCust' x1='0%' y1='0%' x2='0%' y2='100%'>
                  <stop offset='0%' stopColor='#7778FF' stopOpacity='0.35' />
                  <stop offset='100%' stopColor='#7778FF' stopOpacity='0.0' />
                </linearGradient>
                <filter id='glowLine' x='-20%' y='-20%' width='140%' height='140%'>
                  <feDropShadow dx='0' dy='0' stdDeviation='3' floodColor='#7778FF' floodOpacity='0.6' />
                </filter>
              </defs>

              {/* Grid Lines */}
              {[0, 50, 100, 150, 200].map((y, i) => (
                <line
                  key={i}
                  x1='0'
                  y1={y}
                  x2='620'
                  y2={y}
                  stroke='currentColor'
                  className='text-border/40'
                  strokeDasharray='4 4'
                />
              ))}

              {/* Gradient Area Fill */}
              <path
                d='M 20 145 C 65 120, 110 135, 155 100 C 200 165, 245 175, 290 85 C 335 75, 380 78, 425 65 C 470 58, 515 148, 560 155 L 600 30 L 600 200 L 20 200 Z'
                fill='url(#gradCust)'
              />

              {/* Animated Glowing Stroke Line */}
              <path
                d='M 20 145 C 65 120, 110 135, 155 100 C 200 165, 245 175, 290 85 C 335 75, 380 78, 425 65 C 470 58, 515 148, 560 155 L 600 30'
                fill='none'
                stroke='#7778FF'
                strokeWidth='3'
                filter='url(#glowLine)'
                className='animate-draw-path'
              />

              {/* Active Tracking Point & Guide Line */}
              {activePoint && (
                <g>
                  {/* Vertical guide line */}
                  <line
                    x1={activePoint.x}
                    y1={0}
                    x2={activePoint.x}
                    y2={200}
                    stroke='#7778FF'
                    strokeWidth='1.5'
                    strokeDasharray='3 3'
                    opacity='0.7'
                  />
                  {/* Outer pulse circle */}
                  <circle
                    cx={activePoint.x}
                    cy={activePoint.y}
                    r='9'
                    fill='#7778FF'
                    opacity='0.25'
                    className='animate-ping'
                  />
                  {/* Glowing Node */}
                  <circle
                    cx={activePoint.x}
                    cy={activePoint.y}
                    r='5.5'
                    fill='#7778FF'
                    stroke='#FFFFFF'
                    strokeWidth='2.5'
                  />
                </g>
              )}
            </svg>

            {/* Floating Contextual Tooltip Overlay */}
            {activePoint && (
              <div
                className='absolute -top-3 rounded-xl border border-border/80 bg-popover/95 text-popover-foreground backdrop-blur-xl p-3 shadow-2xl text-xs space-y-1.5 pointer-events-none transition-all duration-150 z-20 min-w-[155px]'
                style={{
                  left: `clamp(12px, calc(${(activePoint.x / 620) * 100}% - 75px), calc(100% - 170px))`,
                }}
              >
                <div className='font-semibold text-foreground text-[11px] pb-1 border-b border-border/60 flex items-center justify-between'>
                  <span>{activePoint.fullDate}</span>
                  <span className='text-[10px] text-muted-foreground font-mono'>Hari {activePointIndex! + 1}/14</span>
                </div>
                <div className='flex items-center justify-between gap-3 font-mono'>
                  <span className='flex items-center gap-1.5 text-muted-foreground'>
                    <span className='size-2 rounded-full bg-[#7778FF]' />
                    <span>Token:</span>
                  </span>
                  <span className='font-bold text-[#7778FF]'>{activePoint.tokens.toLocaleString('id-ID')}</span>
                </div>
                <div className='text-[10px] text-muted-foreground pt-0.5 flex justify-between'>
                  <span>{isId ? 'Porsi kuota:' : 'Quota share:'}</span>
                  <span className='font-mono font-medium text-foreground'>
                    {((activePoint.tokens / 2000000) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            )}

            {/* X-Axis labels */}
            <div className='flex justify-between pt-3 text-[10px] text-muted-foreground font-mono'>
              {usageHistory.map((pt, i) => (
                <span
                  key={i}
                  className={cn(
                    'transition-colors',
                    activePointIndex === i ? 'text-[#7778FF] font-bold' : ''
                  )}
                >
                  {pt.date}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Permintaan terbaru list with hover depth */}
        <div className='lg:col-span-4 rounded-xl border border-border/80 bg-card/80 p-5 card-3d hover-lift-3d bevel-shine space-y-4'>
          <div className='flex items-center justify-between'>
            <h2 className='text-base font-bold text-foreground'>
              {isId ? 'Permintaan terbaru' : 'Recent requests'}
            </h2>
            <Link to='/user/usage' className='text-xs font-semibold text-[#7778FF] hover:underline flex items-center gap-1'>
              {isId ? 'Semua →' : 'All →'}
            </Link>
          </div>

          <div className='divide-y divide-border/60 text-xs font-mono'>
            {recentRequests.map((req, i) => (
              <div
                key={i}
                onClick={() => setSelectedReq(req)}
                className='flex items-center justify-between py-3 px-2 rounded-lg hover:bg-muted/40 transition-colors group cursor-pointer'
              >
                <div className='space-y-0.5'>
                  <div className='flex items-center gap-2'>
                    {req.isOk ? (
                      <span className='size-2 rounded-full bg-[#39D6A0]' />
                    ) : (
                      <span className='size-2 rounded-xs bg-[#FF667A]' />
                    )}
                    <span className='font-bold text-foreground font-sans group-hover:text-[#7778FF] transition-colors'>
                      {req.skill}
                    </span>
                  </div>
                  <div className='text-muted-foreground text-[11px] pl-4'>{req.time}</div>
                </div>
                <div className='text-right'>
                  <span
                    className={cn(
                      'font-sans font-bold text-xs block',
                      req.isOk ? 'text-[#39D6A0]' : 'text-[#FF667A]'
                    )}
                  >
                    {req.status}
                  </span>
                  <span className='text-[10px] text-muted-foreground'>{req.latency}</span>
                </div>
              </div>
            ))}
          </div>

          <div className='pt-2 border-t border-border/70 text-center'>
            <Link
              to='/user/usage'
              className='text-xs text-muted-foreground hover:text-foreground font-medium transition-colors'
            >
              {isId ? 'Buka log permintaan lengkap' : 'Open full request logs'}
            </Link>
          </div>
        </div>
      </div>

      {/* ── Contextual QRIS Modal (In-place on Overview) ── */}
      <Dialog open={qrisModalOpen} onOpenChange={setQrisModalOpen}>
        <DialogContent className='sm:max-w-md border-border bg-card/95 backdrop-blur-xl shadow-2xl'>
          <DialogHeader>
            <div className='flex items-center gap-2 text-xs font-mono font-bold text-[#7778FF] uppercase tracking-wider'>
              <QrCode className='size-4' /> {isId ? 'Pembayaran QRIS · Sandbox' : 'QRIS Payment · Sandbox'}
            </div>
            <DialogTitle className='text-lg font-bold text-foreground mt-1'>
              Pro · 30 hari · Rp 450.000
            </DialogTitle>
            <DialogDescription className='text-xs text-muted-foreground'>
              {isId
                ? 'Pindai kode QRIS di bawah ini dengan aplikasi perbankan atau e-wallet Anda.'
                : 'Scan the QRIS code below using any banking app or digital wallet.'}
            </DialogDescription>
          </DialogHeader>

          <div className='flex flex-col items-center justify-center p-4 rounded-xl border border-border/80 bg-muted/20 space-y-4'>
            {/* Scannable QR code container */}
            <div className='relative size-52 bg-white rounded-xl p-3 shadow-md flex items-center justify-center overflow-hidden'>
              <img
                src='/app/images/qris-code.png'
                alt='QRIS Barcode'
                className='size-full object-contain'
              />
            </div>

            <div className='text-center space-y-1'>
              <div className='text-xs font-mono text-muted-foreground'>
                {isId ? 'ID Transaksi:' : 'Transaction ID:'} <span className='text-foreground font-bold'>ord_9QX2...T4</span>
              </div>
              <div className='text-xs font-semibold text-amber-400 flex items-center justify-center gap-1.5'>
                <Hourglass className='size-3.5' />
                <span>{isId ? 'Menunggu pembayaran · 12:41 tersisa' : 'Awaiting payment · 12:41 remaining'}</span>
              </div>
            </div>
          </div>

          <DialogFooter className='flex-col sm:flex-row gap-2 pt-2'>
            <Button
              type='button'
              variant='outline'
              onClick={() => setQrisModalOpen(false)}
              className='text-xs h-9'
            >
              {isId ? 'Tutup' : 'Close'}
            </Button>
            <Button
              type='button'
              onClick={handleSimulatePayment}
              disabled={isSimulating}
              className='bg-[#7778FF] hover:bg-[#8F90FF] text-white text-xs h-9 font-semibold gap-1.5'
            >
              {isSimulating ? (
                <Hourglass className='size-3.5 animate-spin' />
              ) : (
                <Sparkles className='size-3.5' />
              )}
              {isId ? 'Simulasi Sukses Bayar' : 'Simulate Paid'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Contextual Request Detail Modal ── */}
      <Dialog open={!!selectedReq} onOpenChange={(open) => !open && setSelectedReq(null)}>
        <DialogContent className='sm:max-w-md border-border bg-card/95 backdrop-blur-xl shadow-2xl'>
          <DialogHeader>
            <DialogTitle className='text-base font-bold text-foreground flex items-center gap-2'>
              {selectedReq?.isOk ? (
                <span className='size-2.5 rounded-full bg-[#39D6A0]' />
              ) : (
                <span className='size-2.5 rounded-xs bg-[#FF667A]' />
              )}
              {selectedReq?.skill}
            </DialogTitle>
            <DialogDescription className='text-xs text-muted-foreground'>
              {isId ? 'Detail eksekusi skill Copilot terisolasi' : 'Isolated Copilot skill execution details'}
            </DialogDescription>
          </DialogHeader>

          {selectedReq && (
            <div className='space-y-3 text-xs divide-y divide-border/60'>
              <div className='flex items-center justify-between pt-2'>
                <span className='text-muted-foreground'>{isId ? 'Waktu Eksekusi' : 'Execution Time'}</span>
                <span className='font-mono font-medium text-foreground'>{selectedReq.time}</span>
              </div>
              <div className='flex items-center justify-between pt-2'>
                <span className='text-muted-foreground'>{isId ? 'Status Response' : 'Response Status'}</span>
                <span className={cn('font-semibold font-mono', selectedReq.isOk ? 'text-[#39D6A0]' : 'text-[#FF667A]')}>
                  {selectedReq.status.toUpperCase()}
                </span>
              </div>
              <div className='flex items-center justify-between pt-2'>
                <span className='text-muted-foreground'>{isId ? 'Latensi Gateway' : 'Gateway Latency'}</span>
                <span className='font-mono font-semibold text-foreground'>{selectedReq.latency}</span>
              </div>
              <div className='flex items-center justify-between pt-2'>
                <span className='text-muted-foreground'>{isId ? 'Model AI' : 'AI Model'}</span>
                <span className='font-mono text-foreground'>grouter/balanced</span>
              </div>
              <div className='flex items-center justify-between pt-2'>
                <span className='text-muted-foreground'>{isId ? 'Token Digunakan' : 'Tokens Billed'}</span>
                <span className='font-mono font-bold text-[#7778FF]'>{selectedReq.isOk ? '1.284 token' : '0 (tidak ditagih)'}</span>
              </div>
            </div>
          )}

          <DialogFooter className='pt-2'>
            <Button asChild variant='outline' size='sm' className='text-xs h-8'>
              <Link to='/user/usage'>{isId ? 'Buka di Penggunaan AI →' : 'View in AI Usage →'}</Link>
            </Button>
            <Button size='sm' onClick={() => setSelectedReq(null)} className='text-xs h-8 bg-muted text-foreground'>
              {isId ? 'Tutup' : 'Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
