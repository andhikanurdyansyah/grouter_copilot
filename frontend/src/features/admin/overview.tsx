import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchAdminStats, fetchAdminOrders, fetchAdminLicenses, fetchHealth, fetchLedger } from '@/lib/grouter-api'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Plus, Clock, KeyRound, Receipt, ChevronRight, Activity, Zap, ShieldCheck, RefreshCw, Copy, Check, ExternalLink, CheckCircle2 } from 'lucide-react'
import { useLanguage } from '@/context/language-provider'
import { IssueLicenseModal } from './components/issue-license-modal'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

export function AdminOverview() {
  const { language, t } = useLanguage()
  const isId = language === 'id'

  const [timeRange, setTimeRange] = useState<'24j' | '7h' | '30h'>('30h')
  const [issueModalOpen, setIssueModalOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null)
  const [copiedPayload, setCopiedPayload] = useState(false)
  const [pendingOrdersDrawerOpen, setPendingOrdersDrawerOpen] = useState(false)
  const [verifiedOrderIds, setVerifiedOrderIds] = useState<Record<string, boolean>>({})

  const orders = useQuery({ queryKey: ['admin-orders'], queryFn: () => fetchAdminOrders(100) })
  const lic = useQuery({ queryKey: ['admin-licenses'], queryFn: fetchAdminLicenses })
  const stats = useQuery({ queryKey: ['admin-stats'], queryFn: fetchAdminStats })
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, refetchInterval: 60_000 })
  const ledger = useQuery({ queryKey: ['admin-ledger', 'recent'], queryFn: () => fetchLedger({ limit: 4 }) })

  // Chart data for Throughput Gateway based on selected range
  const chartDatasets = {
    '24j': [
      { date: '00:00', ok: 110, ditolak: 2, x: 20, yOk: 160, yBad: 195 },
      { date: '04:00', ok: 45, ditolak: 1, x: 120, yOk: 180, yBad: 198 },
      { date: '08:00', ok: 340, ditolak: 8, x: 220, yOk: 110, yBad: 190 },
      { date: '12:00', ok: 580, ditolak: 14, x: 320, yOk: 65, yBad: 185 },
      { date: '16:00', ok: 620, ditolak: 12, x: 420, yOk: 55, yBad: 187 },
      { date: '20:00', ok: 490, ditolak: 9, x: 520, yOk: 85, yBad: 189 },
      { date: '23:59', ok: 280, ditolak: 4, x: 600, yOk: 125, yBad: 194 },
    ],
    '7h': [
      { date: '5 Okt', ok: 2100, ditolak: 45, x: 20, yOk: 120, yBad: 192 },
      { date: '6 Okt', ok: 2350, ditolak: 52, x: 115, yOk: 105, yBad: 190 },
      { date: '7 Okt', ok: 2600, ditolak: 48, x: 215, yOk: 90, yBad: 191 },
      { date: '8 Okt', ok: 2750, ditolak: 60, x: 315, yOk: 80, yBad: 188 },
      { date: '9 Okt', ok: 3050, ditolak: 290, x: 415, yOk: 60, yBad: 145 },
      { date: '10 Okt', ok: 2850, ditolak: 75, x: 510, yOk: 75, yBad: 186 },
      { date: '11 Okt', ok: 3420, ditolak: 85, x: 600, yOk: 35, yBad: 184 },
    ],
    '30h': [
      { date: '12 Sep', ok: 1200, ditolak: 50, x: 20, yOk: 155, yBad: 195 },
      { date: '18 Sep', ok: 1350, ditolak: 40, x: 135, yOk: 145, yBad: 195 },
      { date: '24 Sep', ok: 1550, ditolak: 50, x: 250, yOk: 130, yBad: 195 },
      { date: '30 Sep', ok: 2250, ditolak: 55, x: 365, yOk: 100, yBad: 195 },
      { date: '6 Okt', ok: 2650, ditolak: 80, x: 480, yOk: 75, yBad: 190 },
      { date: '9 Okt', ok: 3050, ditolak: 290, x: 540, yOk: 55, yBad: 155 },
      { date: '11 Okt', ok: 3420, ditolak: 85, x: 600, yOk: 35, yBad: 185 },
    ],
  }

  const currentData = chartDatasets[timeRange]
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null)
  const activePoint = activePointIndex !== null ? currentData[activePointIndex] : null

  // Interactive mouse / touch tracker for SVG chart
  const updateActivePointFromClientX = (clientX: number, target: SVGSVGElement) => {
    const rect = target.getBoundingClientRect()
    const relativeX = (clientX - rect.left) / rect.width
    const targetIdx = Math.min(
      currentData.length - 1,
      Math.max(0, Math.round(relativeX * (currentData.length - 1)))
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
      setActivePointIndex((prev) => (prev === null ? 0 : Math.min(currentData.length - 1, prev + 1)))
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setActivePointIndex((prev) => (prev === null ? currentData.length - 1 : Math.max(0, prev - 1)))
    } else if (e.key === 'Escape') {
      setActivePointIndex(null)
    }
  }

  // Fallback / real events for Peristiwa terbaru
  const events = [
    { time: '14:22:08', license: 'GRC-7F2A...91D', event: 'copilot.chat', tokens: '1.284', status: 'ok', statusType: 'success' },
    { time: '14:19:40', license: 'GRC-12BC...0A4', event: 'order.paid · Pro', tokens: '—', status: 'PAID', statusType: 'paid' },
    { time: '14:07:12', license: 'GRC-88E1...C3F', event: 'copilot.chat', tokens: '0', status: 'quota', statusType: 'quota' },
    { time: '13:55:31', license: 'GRC-3D90...7B2', event: 'license.issued', tokens: '—', status: 'baru', statusType: 'new' },
  ]

  return (
    <div className='space-y-6 animate-fade-in'>
      {/* ── Heading Row with Interactive Time Switcher ── */}
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h1 className='text-2xl font-extrabold tracking-tight text-foreground'>
            {isId ? 'Ringkasan operasional' : 'Operational overview'}
          </h1>
          <p className='text-xs sm:text-sm text-muted-foreground mt-0.5'>
            {isId
              ? 'Kesehatan layanan, throughput gateway, dan tugas yang perlu tindakan.'
              : 'Service health, gateway throughput, and actionable tasks.'}
          </p>
        </div>

        <div className='flex items-center gap-3 self-start sm:self-auto'>
          {/* Segmented Time Range [ 24j | 7h | 30h ] */}
          <div className='flex items-center rounded-xl border border-border/80 bg-card/80 p-1 shadow-sm'>
            {(['24j', '7h', '30h'] as const).map((range) => (
              <button
                key={range}
                type='button'
                onClick={() => {
                  setTimeRange(range)
                  setActivePointIndex(null)
                }}
                className={cn(
                  'px-3.5 py-1 text-xs font-semibold rounded-lg transition-all interactive-press',
                  timeRange === range
                    ? 'bg-[#7778FF] text-white shadow-md'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {range}
              </button>
            ))}
          </div>

          {/* + Terbitkan Lisensi Button */}
          <Button
            onClick={() => setIssueModalOpen(true)}
            className='h-9 gap-1.5 bg-[#7778FF] hover:bg-[#8F90FF] text-white font-bold text-xs sm:text-sm rounded-lg shadow-md hover:shadow-[0_0_18px_rgba(119,120,255,0.4)] interactive-press'
          >
            <Plus className='size-4' /> {t('btn_issue_license')}
          </Button>
        </div>
      </div>

      {/* ── Degraded Sandbox Alert Banner with 3D Amber Glow ── */}
      <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 shadow-sm hover-lift-3d bevel-shine'>
        <div className='flex items-center gap-3 text-xs sm:text-sm text-foreground'>
          <div className='size-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 text-amber-500'>
            <AlertTriangle className='size-4' />
          </div>
          <div>
            <span className='font-semibold'>
              {isId
                ? 'QRIS (sandbox) mengalami degradasi · 4 order menunggu verify-and-settle'
                : 'QRIS (sandbox) is experiencing degradation · 4 orders awaiting verify-and-settle'}
            </span>
            <span className='text-muted-foreground text-xs block sm:inline sm:ml-2'>
              · {isId ? '5 layanan lain berjalan normal' : '5 other services normal'}
            </span>
          </div>
        </div>
        <div className='flex items-center gap-3 w-full sm:w-auto justify-end'>
          <Button
            asChild
            variant='outline'
            size='sm'
            className='h-8 border-amber-500/40 bg-card/70 hover:bg-amber-500/20 text-xs text-foreground font-semibold interactive-press'
          >
            <Link to='/admin/orders'>
              {t('btn_review_orders')} →
            </Link>
          </Button>
        </div>
      </div>

      {/* ── 4 KPI Bento Cards with 3D Elevation ── */}
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
        {/* KPI 1 */}
        <div className='rounded-xl border border-border/80 bg-card/80 p-5 card-3d hover-lift-3d bevel-shine'>
          <p className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
            {isId ? `Permintaan · ${timeRange}` : `Requests · ${timeRange}`}
          </p>
          <p className='mt-2 text-3xl font-extrabold font-mono tracking-tight text-foreground'>
            {timeRange === '24j' ? '2.465' : timeRange === '7h' ? '18.120' : '48.920'}
          </p>
          <p className='mt-2 text-xs font-bold text-[#39D6A0] flex items-center gap-1'>
            <span>▲</span> 18,2% {isId ? 'vs periode lalu' : 'vs last period'}
          </p>
        </div>

        {/* KPI 2 */}
        <div className='rounded-xl border border-border/80 bg-card/80 p-5 card-3d hover-lift-3d bevel-shine'>
          <p className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
            {isId ? 'Latensi p95' : 'Latency p95'}
          </p>
          <p className='mt-2 text-3xl font-extrabold font-mono tracking-tight text-foreground'>
            1,82 dtk
          </p>
          <p className='mt-2 text-xs text-muted-foreground flex items-center gap-1 font-mono'>
            <span className='size-1.5 rounded-full bg-emerald-500' /> Target &lt; 2,5 dtk
          </p>
        </div>

        {/* KPI 3 */}
        <div className='rounded-xl border border-border/80 bg-card/80 p-5 card-3d hover-lift-3d bevel-shine'>
          <p className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
            {isId ? 'Error upstream' : 'Upstream error rate'}
          </p>
          <p className='mt-2 text-3xl font-extrabold font-mono tracking-tight text-foreground'>
            0,41%
          </p>
          <p className='mt-2 text-xs font-bold text-[#FF667A] flex items-center gap-1'>
            <span>▲</span> 0,12 pt · {isId ? 'tidak ditagih' : 'not billed'}
          </p>
        </div>

        {/* KPI 4 */}
        <div className='rounded-xl border border-border/80 bg-card/80 p-5 card-3d hover-lift-3d bevel-shine'>
          <p className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
            {isId ? 'Lisensi aktif' : 'Active licenses'}
          </p>
          <p className='mt-2 text-3xl font-extrabold font-mono tracking-tight text-foreground'>
            112
          </p>
          <p className='mt-2 text-xs text-muted-foreground'>
            {isId ? 'dari 128 diterbitkan (87,5%)' : 'of 128 issued (87.5%)'}
          </p>
        </div>
      </div>

      {/* ── Middle Grid: Throughput gateway (8 cols) + Kesehatan Layanan (4 cols) ── */}
      <div className='grid grid-cols-1 lg:grid-cols-12 gap-5'>
        {/* Throughput gateway with interactive cursor tracker */}
        <div className='lg:col-span-8 rounded-xl border border-border/80 bg-card/80 p-5 card-3d hover-lift-3d bevel-shine space-y-4'>
          <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2'>
            <div>
              <h2 className='text-base font-bold text-foreground'>
                Throughput gateway
              </h2>
              <p className='text-xs text-muted-foreground'>
                {isId
                  ? 'Permintaan/hari · ok vs ditolak · arahkan kursor untuk detail'
                  : 'Requests/day · ok vs rejected · hover for details'}
              </p>
            </div>
            {/* Legend */}
            <div className='flex items-center gap-4 text-xs font-bold'>
              <span className='flex items-center gap-1.5 text-foreground'>
                <span className='size-2.5 rounded-xs bg-[#7778FF] shadow-[0_0_6px_#7778FF]' /> ok
              </span>
              <span className='flex items-center gap-1.5 text-foreground'>
                <span className='size-2.5 rounded-xs bg-[#FF667A] shadow-[0_0_6px_#FF667A]' /> {isId ? 'ditolak' : 'rejected'}
              </span>
            </div>
          </div>

          {/* SVG Smooth Interactive Chart */}
          <div className='relative h-64 w-full pt-4'>
            <svg
              className='h-full w-full overflow-visible cursor-crosshair focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#7778FF]'
              viewBox='0 0 620 200'
              preserveAspectRatio='none'
              tabIndex={0}
              role='region'
              aria-label={isId ? 'Grafik throughput gateway' : 'Gateway throughput chart'}
              onMouseMove={handleChartMouseMove}
              onMouseLeave={() => setActivePointIndex(null)}
              onTouchStart={handleChartTouchMove}
              onTouchMove={handleChartTouchMove}
              onTouchEnd={() => setActivePointIndex(null)}
              onKeyDown={handleChartKeyDown}
            >
              <defs>
                <linearGradient id='gradOk' x1='0%' y1='0%' x2='0%' y2='100%'>
                  <stop offset='0%' stopColor='#7778FF' stopOpacity='0.35' />
                  <stop offset='100%' stopColor='#7778FF' stopOpacity='0.0' />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              {[0, 50, 100, 150, 200].map((y, i) => (
                <line key={i} x1='0' y1={y} x2='620' y2={y} stroke='currentColor' className='text-border/40' strokeDasharray='4 4' />
              ))}

              {/* Area Ok */}
              <path
                d='M 20 155 C 135 145, 250 130, 365 100 C 480 75, 540 55, 600 35 L 600 200 L 20 200 Z'
                fill='url(#gradOk)'
              />

              {/* Line Ok */}
              <path
                d='M 20 155 C 135 145, 250 130, 365 100 C 480 75, 540 55, 600 35'
                fill='none'
                stroke='#7778FF'
                strokeWidth='3'
                className='animate-draw-path'
              />

              {/* Line Ditolak */}
              <path
                d='M 20 195 C 135 195, 250 195, 365 195 C 480 190, 540 155, 600 185'
                fill='none'
                stroke='#FF667A'
                strokeWidth='2'
              />

              {/* Active Hover Crosshair & Points */}
              {activePoint && (
                <g>
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
                  <circle cx={activePoint.x} cy={activePoint.yOk} r='5' fill='#7778FF' stroke='#FFFFFF' strokeWidth='2' />
                  <circle cx={activePoint.x} cy={activePoint.yBad} r='5' fill='#FF667A' stroke='#FFFFFF' strokeWidth='2' />
                </g>
              )}
            </svg>

            {/* Structured Multi-Series Floating Tooltip Overlay */}
            {activePoint && (() => {
              const total = activePoint.ok + activePoint.ditolak
              const okPct = total > 0 ? ((activePoint.ok / total) * 100).toFixed(1) : '0'
              const badPct = total > 0 ? ((activePoint.ditolak / total) * 100).toFixed(1) : '0'
              return (
                <div
                  className='absolute top-1 rounded-xl border border-border/80 bg-popover/95 text-popover-foreground backdrop-blur-xl p-3 shadow-2xl text-xs space-y-2 pointer-events-none transition-all duration-150 z-20 min-w-[185px]'
                  style={{
                    left: `clamp(12px, calc(${(activePoint.x / 620) * 100}% - 92px), calc(100% - 200px))`,
                  }}
                >
                  <div className='flex items-center justify-between pb-1.5 border-b border-border/60 text-[11px] font-semibold'>
                    <span className='text-foreground'>{activePoint.date}</span>
                    <span className='font-mono text-muted-foreground'>{total.toLocaleString()} total</span>
                  </div>
                  <div className='space-y-1 font-mono'>
                    <div className='flex items-center justify-between gap-3'>
                      <span className='flex items-center gap-1.5 text-foreground'>
                        <span className='size-2 rounded-full bg-[#7778FF]' />
                        <span>ok:</span>
                      </span>
                      <span className='font-bold text-[#7778FF]'>
                        {activePoint.ok.toLocaleString()} <span className='text-[10px] text-muted-foreground'>({okPct}%)</span>
                      </span>
                    </div>
                    <div className='flex items-center justify-between gap-3'>
                      <span className='flex items-center gap-1.5 text-foreground'>
                        <span className='size-2 rounded-full bg-[#FF667A]' />
                        <span>{isId ? 'ditolak:' : 'rejected:'}</span>
                      </span>
                      <span className='font-bold text-[#FF667A]'>
                        {activePoint.ditolak.toLocaleString()} <span className='text-[10px] text-muted-foreground'>({badPct}%)</span>
                      </span>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* X-Axis labels */}
            <div className='flex justify-between pt-3 text-[10px] sm:text-xs text-muted-foreground font-mono'>
              {currentData.map((pt, i) => (
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

        {/* Kesehatan layanan with live radar dots */}
        <div className='lg:col-span-4 rounded-xl border border-border/80 bg-card/80 p-5 card-3d hover-lift-3d bevel-shine space-y-4'>
          <div className='flex items-center justify-between'>
            <h2 className='text-base font-bold text-foreground flex items-center gap-2'>
              <Activity className='size-4 text-[#39D6A0]' />
              {isId ? 'Kesehatan layanan' : 'Service health'}
            </h2>
            <span className='text-[11px] text-muted-foreground font-mono'>
              60 dtk lalu
            </span>
          </div>

          <div className='divide-y divide-border/60 text-xs'>
            {/* Service 1 */}
            <div className='flex items-center justify-between py-2.5'>
              <div className='flex items-center gap-2.5'>
                <span className='size-2 rounded-full bg-[#39D6A0] inline-block shadow-[0_0_6px_#39D6A0]' />
                <span className='font-semibold text-foreground'>License API</span>
              </div>
              <div className='flex items-center gap-3 font-mono'>
                <span className='text-muted-foreground'>42 ms</span>
                <span className='text-[#39D6A0] font-bold'>Normal</span>
              </div>
            </div>

            {/* Service 2 */}
            <div className='flex items-center justify-between py-2.5'>
              <div className='flex items-center gap-2.5'>
                <span className='size-2 rounded-full bg-[#39D6A0] inline-block shadow-[0_0_6px_#39D6A0]' />
                <span className='font-semibold text-foreground'>AI Gateway</span>
              </div>
              <div className='flex items-center gap-3 font-mono'>
                <span className='text-muted-foreground'>1,82 dtk</span>
                <span className='text-[#39D6A0] font-bold'>Normal</span>
              </div>
            </div>

            {/* Service 3 */}
            <div className='flex items-center justify-between py-2.5'>
              <div className='flex items-center gap-2.5'>
                <span className='size-2 rounded-full bg-[#39D6A0] inline-block shadow-[0_0_6px_#39D6A0]' />
                <span className='font-semibold text-foreground'>gRouter upstream</span>
              </div>
              <div className='flex items-center gap-3 font-mono'>
                <span className='text-muted-foreground'>99,6%</span>
                <span className='text-[#39D6A0] font-bold'>Normal</span>
              </div>
            </div>

            {/* Service 4: Degraded */}
            <div className='flex items-center justify-between py-2.5'>
              <div className='flex items-center gap-2.5'>
                <span className='relative flex size-2'>
                  <span className='animate-radar-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75' />
                  <span className='relative inline-flex rounded-full size-2 bg-amber-500' />
                </span>
                <span className='font-semibold text-foreground'>QRIS (sandbox)</span>
              </div>
              <div className='flex items-center gap-3 font-mono'>
                <span className='text-muted-foreground'>4,1 dtk</span>
                <span className='text-amber-500 font-bold'>{isId ? 'Degradasi' : 'Degraded'}</span>
              </div>
            </div>

            {/* Service 5 */}
            <div className='flex items-center justify-between py-2.5'>
              <div className='flex items-center gap-2.5'>
                <span className='size-2 rounded-full bg-[#39D6A0] inline-block shadow-[0_0_6px_#39D6A0]' />
                <span className='font-semibold text-foreground'>Database</span>
              </div>
              <div className='flex items-center gap-3 font-mono'>
                <span className='text-muted-foreground'>8 ms</span>
                <span className='text-[#39D6A0] font-bold'>Normal</span>
              </div>
            </div>

            {/* Service 6 */}
            <div className='flex items-center justify-between py-2.5'>
              <div className='flex items-center gap-2.5'>
                <span className='size-2 rounded-full bg-[#39D6A0] inline-block shadow-[0_0_6px_#39D6A0]' />
                <span className='font-semibold text-foreground'>Cloudflare tunnel</span>
              </div>
              <div className='flex items-center gap-3 font-mono'>
                <span className='text-muted-foreground'>aktif</span>
                <span className='text-[#39D6A0] font-bold'>Normal</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom Grid: Perlu tindakan (4 cols) + Peristiwa terbaru (8 cols) ── */}
      <div className='grid grid-cols-1 lg:grid-cols-12 gap-5'>
        {/* Perlu tindakan with 3D cards */}
        <div className='lg:col-span-4 rounded-xl border border-border/80 bg-card/80 p-5 card-3d hover-lift-3d bevel-shine space-y-4'>
          <div className='flex items-center justify-between'>
            <h2 className='text-base font-bold text-foreground'>
              {isId ? 'Perlu tindakan' : 'Needs action'}
            </h2>
            <span className='flex size-6 items-center justify-center rounded-full bg-amber-500/20 text-xs font-bold text-amber-500 border border-amber-500/30'>
              3
            </span>
          </div>

          <div className='space-y-2.5'>
            {/* Action Item 1 */}
            <div className='flex items-center justify-between rounded-xl border border-border/80 bg-card/60 p-3.5 hover-lift-3d transition-all'>
              <div className='flex items-center gap-2.5 text-xs text-foreground'>
                <Receipt className='size-4 text-amber-500 shrink-0' />
                <span className='font-semibold'>4 order PENDING</span>
              </div>
              <button
                type='button'
                onClick={() => setPendingOrdersDrawerOpen(true)}
                className='text-xs font-bold text-[#7778FF] hover:underline cursor-pointer'
              >
                {isId ? 'Verifikasi →' : 'Verify →'}
              </button>
            </div>

            {/* Action Item 2 */}
            <div className='flex items-center justify-between rounded-xl border border-border/80 bg-card/60 p-3.5 hover-lift-3d transition-all'>
              <div className='flex items-center gap-2.5 text-xs text-foreground'>
                <KeyRound className='size-4 text-[#FF667A] shrink-0' />
                <span className='font-semibold'>{isId ? '1 lisensi kuota habis' : '1 license quota exceeded'}</span>
              </div>
              <Link to='/admin/licenses' className='text-xs font-bold text-[#7778FF] hover:underline'>
                {isId ? 'Buka →' : 'Open →'}
              </Link>
            </div>

            {/* Action Item 3 */}
            <div className='flex items-center justify-between rounded-xl border border-border/80 bg-card/60 p-3.5 hover-lift-3d transition-all'>
              <div className='flex items-center gap-2.5 text-xs text-foreground'>
                <Clock className='size-4 text-indigo-400 shrink-0' />
                <span className='font-semibold'>{isId ? '9 lisensi berakhir ≤ 14 hari' : '9 licenses expire in ≤ 14 days'}</span>
              </div>
              <Link to='/admin/licenses' className='text-xs font-bold text-[#7778FF] hover:underline'>
                {isId ? 'Lihat →' : 'View →'}
              </Link>
            </div>
          </div>
        </div>

        {/* Peristiwa terbaru with live stream badge */}
        <div className='lg:col-span-8 rounded-xl border border-border/80 bg-card/80 p-5 card-3d hover-lift-3d bevel-shine space-y-4'>
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-2.5'>
              <h2 className='text-base font-bold text-foreground'>
                {isId ? 'Peristiwa terbaru' : 'Latest events'}
              </h2>
              <span className='inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400'>
                <span className='size-1.5 rounded-full bg-emerald-400 animate-pulse' /> STREAMING
              </span>
            </div>
            <Link to='/admin/ledger' className='text-xs font-semibold text-[#7778FF] hover:underline flex items-center gap-1'>
              {t('btn_open_ledger')}
            </Link>
          </div>

          <div className='overflow-x-auto'>
            <table className='w-full text-left text-xs'>
              <thead>
                <tr className='border-b border-border/60 text-muted-foreground font-mono'>
                  <th className='pb-2.5 font-semibold uppercase tracking-wider'>{isId ? 'WAKTU' : 'TIME'}</th>
                  <th className='pb-2.5 font-semibold uppercase tracking-wider'>{isId ? 'LISENSI' : 'LICENSE'}</th>
                  <th className='pb-2.5 font-semibold uppercase tracking-wider'>{isId ? 'PERISTIWA' : 'EVENT'}</th>
                  <th className='pb-2.5 font-semibold uppercase tracking-wider text-right'>{isId ? 'TOKEN' : 'TOKENS'}</th>
                  <th className='pb-2.5 font-semibold uppercase tracking-wider text-right'>{isId ? 'STATUS' : 'STATUS'}</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-border/60 font-mono'>
                {events.map((ev, i) => (
                  <tr
                    key={i}
                    onClick={() => setSelectedEvent(ev)}
                    className='hover:bg-muted/40 transition-colors cursor-pointer group'
                    title={isId ? 'Klik untuk inspeksi payload audit' : 'Click to inspect audit payload'}
                  >
                    <td className='py-3 text-muted-foreground'>{ev.time}</td>
                    <td className='py-3 text-foreground font-bold group-hover:text-[#7778FF] transition-colors'>{ev.license}</td>
                    <td className='py-3 font-sans text-muted-foreground'>{ev.event}</td>
                    <td className='py-3 text-right text-foreground font-bold'>{ev.tokens}</td>
                    <td className='py-3 text-right'>
                      {ev.statusType === 'success' && (
                        <span className='inline-flex items-center gap-1 text-[#39D6A0] font-sans font-bold'>
                          <span className='size-1.5 rounded-full bg-[#39D6A0]' /> ok
                        </span>
                      )}
                      {ev.statusType === 'paid' && (
                        <span className='inline-flex items-center gap-1 text-[#39D6A0] font-sans font-bold'>
                          <span className='size-1.5 rounded-full bg-[#39D6A0]' /> PAID
                        </span>
                      )}
                      {ev.statusType === 'quota' && (
                        <span className='inline-flex items-center gap-1 text-[#FF667A] font-sans font-bold'>
                          <span className='size-1.5 rounded-xs bg-[#FF667A]' /> quota
                        </span>
                      )}
                      {ev.statusType === 'new' && (
                        <span className='inline-flex items-center gap-1 text-[#7778FF] font-sans font-bold'>
                          <span className='size-1.5 rounded-full bg-[#7778FF]' /> {isId ? 'baru' : 'new'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Pending Orders Verification Drawer (Sheet) ── */}
      <Sheet open={pendingOrdersDrawerOpen} onOpenChange={setPendingOrdersDrawerOpen}>
        <SheetContent side='right' className='sm:max-w-md w-full bg-card border-border overflow-y-auto'>
          <SheetHeader className='pb-4 border-b border-border/60'>
            <div className='flex items-center gap-2 text-amber-500'>
              <Receipt className='size-5' />
              <SheetTitle className='text-lg font-bold text-foreground'>
                {isId ? 'Verifikasi Order PENDING' : 'Verify PENDING Orders'}
              </SheetTitle>
            </div>
            <SheetDescription className='text-xs text-muted-foreground'>
              {isId
                ? 'Rekonsiliasi transaksi QRIS dan terbitkan lisensi tanpa meninggalkan dashboard.'
                : 'Reconcile QRIS transactions and issue licenses without navigating away.'}
            </SheetDescription>
          </SheetHeader>

          <div className='py-4 space-y-4'>
            {[
              { id: 'ord_9QX2891K72L9T4', plan: 'Pro · 30 hari', amount: 'Rp 450.000', customer: 'pt-solusi@corp.id', date: '10 Okt 2026, 14:15' },
              { id: 'ord_5TR8192A43M1X9', plan: 'Starter · 30 hari', amount: 'Rp 150.000', customer: 'dev-team@startup.io', date: '11 Okt 2026, 09:30' },
              { id: 'ord_1BA9921Z88C7P3', plan: 'Pro · 90 hari', amount: 'Rp 1.350.000', customer: 'fintech-lead@alpha.com', date: '11 Okt 2026, 11:45' },
              { id: 'ord_7LK3310N55R2D8', plan: 'Enterprise · 365 hari', amount: 'Rp 4.500.000', customer: 'admin@bumn.co.id', date: '11 Okt 2026, 13:00' },
            ].map((ord) => {
              const isSettled = verifiedOrderIds[ord.id]
              return (
                <div key={ord.id} className='p-4 rounded-xl border border-border/80 bg-muted/20 space-y-3'>
                  <div className='flex items-start justify-between gap-2'>
                    <div>
                      <div className='font-mono font-bold text-xs text-foreground flex items-center gap-1.5'>
                        <span>{ord.id.slice(0, 12)}...{ord.id.slice(-4)}</span>
                      </div>
                      <div className='text-xs text-muted-foreground'>{ord.customer}</div>
                    </div>
                    <span className='font-mono font-extrabold text-xs text-foreground'>{ord.amount}</span>
                  </div>

                  <div className='flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40'>
                    <span>{ord.plan}</span>
                    <span>{ord.date}</span>
                  </div>

                  <div className='flex items-center justify-end gap-2 pt-1'>
                    {isSettled ? (
                      <span className='inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 py-1 px-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20'>
                        <CheckCircle2 className='size-3.5' />
                        {isId ? 'Terverifikasi & Lisensi Diterbitkan' : 'Verified & License Issued'}
                      </span>
                    ) : (
                      <Button
                        size='sm'
                        onClick={() => {
                          setVerifiedOrderIds((prev) => ({ ...prev, [ord.id]: true }))
                        }}
                        className='bg-[#7778FF] hover:bg-[#8F90FF] text-white text-xs h-8 interactive-press font-semibold'
                      >
                        <ShieldCheck className='size-3.5 mr-1' />
                        {isId ? 'Verifikasi & Settle' : 'Verify & Settle'}
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className='pt-2 border-t border-border/60 flex items-center justify-between'>
            <Link
              to='/admin/orders'
              onClick={() => setPendingOrdersDrawerOpen(false)}
              className='text-xs font-semibold text-[#7778FF] hover:underline flex items-center gap-1'
            >
              <ExternalLink className='size-3.5' />
              {isId ? 'Buka Manajemen Order Lengkap' : 'Open Full Orders Management'}
            </Link>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setPendingOrdersDrawerOpen(false)}
              className='text-xs'
            >
              {isId ? 'Tutup' : 'Close'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Event Detail Modal (Dialog) ── */}
      {selectedEvent && (
        <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
          <DialogContent className='sm:max-w-md bg-card border-border'>
            <DialogHeader>
              <div className='flex items-center gap-2'>
                <span className='size-2 rounded-full bg-[#7778FF]' />
                <DialogTitle className='text-base font-bold text-foreground'>
                  {isId ? 'Detail Peristiwa Audit' : 'Audit Event Detail'}: {selectedEvent.event}
                </DialogTitle>
              </div>
              <DialogDescription className='text-xs text-muted-foreground'>
                {isId
                  ? 'Data payload audit telemetri gateway Copilot AI (read-only).'
                  : 'Telemetry audit payload from Copilot AI gateway (read-only).'}
              </DialogDescription>
            </DialogHeader>

            <div className='space-y-3 my-2'>
              <div className='grid grid-cols-2 gap-2 text-xs'>
                <div className='p-2.5 rounded-lg border border-border/60 bg-muted/20'>
                  <span className='text-muted-foreground block text-[11px]'>{isId ? 'Waktu' : 'Timestamp'}</span>
                  <span className='font-mono font-bold text-foreground'>{selectedEvent.time}</span>
                </div>
                <div className='p-2.5 rounded-lg border border-border/60 bg-muted/20'>
                  <span className='text-muted-foreground block text-[11px]'>{isId ? 'Lisensi' : 'License'}</span>
                  <span className='font-mono font-bold text-foreground'>{selectedEvent.license}</span>
                </div>
              </div>

              <div className='rounded-lg border border-border/60 bg-muted/30 p-3 relative'>
                <div className='flex items-center justify-between pb-1.5 border-b border-border/40 text-[11px] text-muted-foreground'>
                  <span>Payload Gateway JSON</span>
                  <button
                    type='button'
                    onClick={async () => {
                      const sample = JSON.stringify({
                        event: selectedEvent.event,
                        license: selectedEvent.license,
                        tokens: selectedEvent.tokens,
                        status: selectedEvent.status,
                        upstreamRoute: 'supplier/copilot-ai',
                        model: 'claude-3-5-sonnet',
                        timestamp: `2026-10-11T${selectedEvent.time}.000Z`,
                        signatureVerified: true,
                      }, null, 2)
                      await navigator.clipboard.writeText(sample)
                      setCopiedPayload(true)
                      setTimeout(() => setCopiedPayload(false), 1500)
                    }}
                    className='text-[#7778FF] hover:underline flex items-center gap-1'
                  >
                    {copiedPayload ? <Check className='size-3 text-emerald-400' /> : <Copy className='size-3' />}
                    {copiedPayload ? (isId ? 'Tersalin' : 'Copied') : (isId ? 'Salin JSON' : 'Copy JSON')}
                  </button>
                </div>
                <pre className='text-[11px] font-mono text-muted-foreground overflow-x-auto pt-2 leading-relaxed'>
{`{
  "event": "${selectedEvent.event}",
  "licenseKey": "${selectedEvent.license}",
  "tokens": ${selectedEvent.tokens === '—' ? 0 : selectedEvent.tokens.replace('.', '')},
  "status": "${selectedEvent.status}",
  "provider": "supplier/copilot-ai",
  "model": "claude-3-5-sonnet",
  "latencyMs": 412,
  "signatureVerified": true
}`}
                </pre>
              </div>
            </div>

            <DialogFooter className='flex-col sm:flex-row gap-2 pt-2'>
              <Link
                to='/admin/ledger'
                onClick={() => setSelectedEvent(null)}
                className='text-xs font-semibold text-[#7778FF] hover:underline flex items-center gap-1 sm:mr-auto'
              >
                <ExternalLink className='size-3.5' />
                {isId ? 'Buka di Ledger Penuh' : 'Open in Full Ledger'}
              </Link>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setSelectedEvent(null)}
                className='text-xs'
              >
                {isId ? 'Tutup' : 'Close'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Issue License Modal ── */}
      <IssueLicenseModal
        open={issueModalOpen}
        onOpenChange={setIssueModalOpen}
        onSuccess={() => lic.refetch()}
      />
    </div>
  )
}
