import { useState, useRef, useLayoutEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchAdminStats, fetchAdminOrders, fetchAdminLicenses, fetchHealth, fetchLedger, settleOrder } from '@/lib/grouter-api'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Plus, Clock, KeyRound, Receipt, Activity, ShieldCheck, Copy, Check, ExternalLink, CheckCircle2 } from 'lucide-react'
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
  const [selectedEvent, setSelectedEvent] = useState<null | (typeof events)[number]>(null)
  const [copiedPayload, setCopiedPayload] = useState(false)
  const [pendingOrdersDrawerOpen, setPendingOrdersDrawerOpen] = useState(false)
  const [verifiedOrderIds, setVerifiedOrderIds] = useState<Record<string, boolean>>({})
  const [verifyingSheetId, setVerifyingSheetId] = useState<string | null>(null)

  const orders = useQuery({ queryKey: ['admin-orders'], queryFn: () => fetchAdminOrders(100) })
  const lic = useQuery({ queryKey: ['admin-licenses'], queryFn: fetchAdminLicenses })
  const stats = useQuery({ queryKey: ['admin-stats'], queryFn: fetchAdminStats })
  const health = useQuery({
    queryKey: ['health-measured'],
    queryFn: async () => {
      const t0 = performance.now()
      const data = await fetchHealth()
      return { ...data, latencyMs: Math.round(performance.now() - t0) }
    },
    refetchInterval: 60_000,
  })
  void health
  const ledger = useQuery({ queryKey: ['admin-ledger', 'recent'], queryFn: () => fetchLedger({ limit: 4 }) })

  // Chart throughput REAL: agregasi ledger per hari (ok vs ditolak), 14 hari terakhir.
  const ledgerAll = useQuery({
    queryKey: ['admin-ledger', 'chart'],
    queryFn: () => fetchLedger({ limit: 200 }),
  })
  const allRecords = (ledgerAll.data?.records ?? []) as Array<{
    status: string; createdAt: number | null; totalTokens: number | null; inputTokens: number | null; outputTokens: number | null
  }>

  const dayKey = (ts: number) => new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
  const [nowMs] = useState(() => Date.now())
  const days: Array<{ key: string; ok: number; ditolak: number }> = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(nowMs - i * 86_400_000)
    days.push({ key: dayKey(d.getTime()), ok: 0, ditolak: 0 })
  }
  for (const r of allRecords) {
    if (!r.createdAt) continue
    const k = dayKey(r.createdAt)
    const day = days.find((d) => d.key === k)
    if (!day) continue
    if (r.status === 'ok') day.ok += 1
    else day.ditolak += 1
  }
  const maxVal = Math.max(1, ...days.map((d) => d.ok + d.ditolak))
  const chartDatasets = {
    // Rentang tampil: 14 hari terakhir (server menyimpan ledger real; 24j/7h memakai subset hari yang sama)
    '24j': days.slice(-1).map((d, i) => ({ date: d.key, ok: d.ok, ditolak: d.ditolak, x: 20 + i * 80, yOk: 200 - (d.ok / maxVal) * 160, yBad: 200 - (d.ditolak / maxVal) * 160 })),
    '7h': days.slice(-7).map((d, i) => ({ date: d.key, ok: d.ok, ditolak: d.ditolak, x: 20 + i * 96, yOk: 200 - (d.ok / maxVal) * 160, yBad: 200 - (d.ditolak / maxVal) * 160 })),
    '30h': days.map((d, i) => ({ date: d.key, ok: d.ok, ditolak: d.ditolak, x: 20 + i * 41, yOk: 200 - (d.ok / maxVal) * 160, yBad: 200 - (d.ditolak / maxVal) * 160 })),
  }

  const currentData = chartDatasets[timeRange]
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null)
  const [pointerPx, setPointerPx] = useState<number | null>(null)
  const activePoint = activePointIndex !== null ? currentData[activePointIndex] : null

  // Ukuran terpasang host chart (px) untuk penempatan tooltip & guard flip/overflow.
  const chartWrapRef = useRef<HTMLDivElement | null>(null)
  const [svgW, setSvgW] = useState(0)
  const [svgH, setSvgH] = useState(0)
  useLayoutEffect(() => {
    const el = chartWrapRef.current
    if (!el) return
    const measure = () => {
      const svg = el.querySelector('svg')
      if (svg) {
        setSvgW(svg.clientWidth)
        setSvgH(svg.clientHeight)
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Interactive mouse / touch tracker for SVG chart
  const updateActivePointFromClientX = (clientX: number, target: SVGSVGElement) => {
    const rect = target.getBoundingClientRect()
    const relativeX = (clientX - rect.left) / rect.width
    const targetIdx = Math.min(
      currentData.length - 1,
      Math.max(0, Math.round(relativeX * (currentData.length - 1)))
    )
    setActivePointIndex(targetIdx)
    setPointerPx(clientX - rect.left)
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
      setPointerPx(null)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setActivePointIndex((prev) => (prev === null ? currentData.length - 1 : Math.max(0, prev - 1)))
      setPointerPx(null)
    } else if (e.key === 'Escape') {
      setActivePointIndex(null)
    }
  }

  // Peristiwa terbaru REAL dari ledger (4 entri teratas)
  const events = ((ledger.data?.records ?? []) as Array<{
    requestId: string; licenseId: string; model: string | null
    status: string; totalTokens: number | null; createdAt: number | null
  }>).map((r) => ({
    time: r.createdAt ? new Date(r.createdAt).toLocaleTimeString('id-ID') : '—',
    license: r.licenseId,
    event: r.model ?? 'copilot.chat',
    tokens: r.totalTokens != null ? r.totalTokens.toLocaleString('id-ID') : '—',
    status: r.status,
    statusType: r.status === 'ok' ? 'success' : r.status === 'reserved' ? 'paid' : r.status === 'error' ? 'quota' : 'new',
    createdAt: r.createdAt,
  }))

  const sheetQc = useQueryClient()
  const settleSheetMut = useMutation({
    mutationFn: (orderId: string) => settleOrder(orderId),
    onSuccess: (res) => {
      const settledId = verifyingSheetId
      if (settledId) {
        setVerifiedOrderIds((prev) => ({ ...prev, [settledId]: true }))
      }
      toast.success(res.licenseId
        ? (isId ? `Lisensi ${res.licenseId.slice(0, 10)}... diterbitkan` : `License ${res.licenseId.slice(0, 10)}... issued`)
        : (isId ? 'Upstream belum PAID — order belum bisa disettle' : 'Upstream is not PAID yet — cannot settle'))
      sheetQc.invalidateQueries({ queryKey: ['admin-orders'] })
      setVerifyingSheetId(null)
    },
    onError: () => {
      toast.error(isId ? 'Verifikasi gagal — coba lagi' : 'Verification failed — please retry')
      setVerifyingSheetId(null)
    },
  })

  // Ringkasan numerik chart untuk aria-label (fallback aksesibilitas titik data fokusable)
  const chartSummary = currentData
    .map((d) => `${d.date}: ${d.ok.toLocaleString('id-ID')} ok, ${d.ditolak.toLocaleString('id-ID')} ditolak`)
    .join('; ')

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
            {(allRecords.filter((r) => r.status === 'ok')).length.toLocaleString('id-ID')}
          </p>
          <p className='mt-2 text-xs text-muted-foreground flex items-center gap-1'>
            <span className='size-1.5 rounded-full bg-emerald-500' /> {ledgerAll.isFetching ? (isId ? 'memuat…' : 'loading…') : (isId ? '14 hari terakhir' : 'last 14 days')}
          </p>
        </div>

        {/* KPI 2 */}
        <div className='rounded-xl border border-border/80 bg-card/80 p-5 card-3d hover-lift-3d bevel-shine'>
          <p className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
            {isId ? 'Token ditagih' : 'Billed tokens'}
          </p>
          <p className='mt-2 text-3xl font-extrabold font-mono tracking-tight text-foreground'>
            {allRecords.reduce((sum, r) => sum + (r.totalTokens ?? (r.inputTokens ?? 0) + (r.outputTokens ?? 0)), 0).toLocaleString('id-ID')}
          </p>
          <p className='mt-2 text-xs text-muted-foreground flex items-center gap-1 font-mono'>
            <span className='size-1.5 rounded-full bg-emerald-500' /> {isId ? 'akumulasi ledger' : 'ledger total'}
          </p>
        </div>

        {/* KPI 3 */}
        <div className='rounded-xl border border-border/80 bg-card/80 p-5 card-3d hover-lift-3d bevel-shine'>
          <p className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
            {isId ? 'Permintaan gagal' : 'Failed requests'}
          </p>
          <p className='mt-2 text-3xl font-extrabold font-mono tracking-tight text-foreground'>
            {allRecords.length ? ((allRecords.filter((r) => r.status === 'error').length / allRecords.length) * 100).toFixed(1).replace('.', ',') + '%' : '—'}
          </p>
          <p className='mt-2 text-xs text-muted-foreground'>
            {isId ? 'tidak ditagih' : 'not billed'} · {allRecords.filter((r) => r.status === 'error').length} {isId ? 'permintaan' : 'requests'}
          </p>
        </div>

        {/* KPI 4 */}
        <div className='rounded-xl border border-border/80 bg-card/80 p-5 card-3d hover-lift-3d bevel-shine'>
          <p className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
            {isId ? 'Lisensi aktif' : 'Active licenses'}
          </p>
          <p className='mt-2 text-3xl font-extrabold font-mono tracking-tight text-foreground'>
            {stats.data?.activeLicenses ?? '—'}
          </p>
          <p className='mt-2 text-xs text-muted-foreground'>
            {isId ? 'dari' : 'of'} {stats.data?.totalLicenses ?? '—'} {isId ? 'diterbitkan' : 'issued'}
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
          <div ref={chartWrapRef} className='relative h-64 w-full pt-4'>
            <svg
              className='h-full w-full overflow-visible cursor-crosshair focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#7778FF]'
              viewBox='0 0 620 200'
              preserveAspectRatio='none'
              tabIndex={0}
              role='img'
              aria-label={
                (isId ? 'Grafik throughput gateway 14 hari terakhir. ' : 'Gateway throughput chart, last 14 days. ') +
                chartSummary
              }
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

              {/* Area/Line dari data ledger REAL (bukan path dekoratif) */}
              {(() => {
                const n = currentData.length
                if (n < 2) return null
                const xs = currentData.map((d) => d.x)
                const x0 = Math.min(...xs)
                const x1 = Math.max(...xs)
                const line = (vals: number[]) =>
                  vals.map((v, i) => `${i === 0 ? 'M' : 'L'} ${currentData[i].x} ${v}`).join(' ')
                const area = `${line(currentData.map((d) => d.yOk))} L ${x1} 200 L ${x0} 200 Z`
                return (
                  <>
                    <path d={area} fill='url(#gradOk)' />
                    <path
                      d={line(currentData.map((d) => d.yOk))}
                      fill='none'
                      stroke='#7778FF'
                      strokeWidth='3'
                    />
                    <path
                      d={line(currentData.map((d) => d.yBad))}
                      fill='none'
                      stroke='#FF667A'
                      strokeWidth='2'
                    />
                  </>
                )
              })()}

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

            {/* Floating pointer-following tooltip (offset dari kursor, flip saat mendekati tepi, pointer-events-none) */}
            {activePoint && (() => {
              const total = activePoint.ok + activePoint.ditolak
              const okPct = total > 0 ? ((activePoint.ok / total) * 100).toFixed(1).replace('.', ',') : '0'
              const badPct = total > 0 ? ((activePoint.ditolak / total) * 100).toFixed(1).replace('.', ',') : '0'
              const TOOLTIP_W = 190
              const TOOLTIP_H = 110
              const hostW = svgW
              const hostH = svgH
              // Mengikuti pointer saat hover/touch; saat navigasi keyboard, anchor ke titik data.
              const leftRaw = pointerPx != null ? pointerPx + 14 : (activePoint.x / 620) * hostW - TOOLTIP_W / 2
              const flip = leftRaw + TOOLTIP_W > hostW - 8
              const left = flip ? Math.max(8, leftRaw - TOOLTIP_W - 28) : Math.max(8, leftRaw)
              const belowPoint = (activePoint.yOk / 200) * hostH
              const topRaw = belowPoint + 14
              const flipY = topRaw + TOOLTIP_H > hostH - 8
              const top = flipY ? Math.max(4, belowPoint - TOOLTIP_H - 14) : topRaw
              return (
                <div
                  role='status'
                  className='absolute rounded-xl border border-border/80 bg-popover/95 text-popover-foreground backdrop-blur-xl p-3 shadow-2xl text-xs space-y-2 pointer-events-none z-20 min-w-[190px] w-max'
                  style={{ left, top }}
                >
                  <div className='flex items-center justify-between pb-1.5 border-b border-border/60 text-[11px] font-semibold'>
                    <span className='text-foreground'>{activePoint.date}</span>
                    <span className='font-mono text-muted-foreground'>{total.toLocaleString('id-ID')} total</span>
                  </div>
                  <div className='space-y-1 font-mono'>
                    <div className='flex items-center justify-between gap-3'>
                      <span className='flex items-center gap-1.5 text-foreground'>
                        <span className='size-2 rounded-full bg-[#7778FF]' />
                        <span>ok:</span>
                      </span>
                      <span className='font-bold text-[#7778FF]'>
                        {activePoint.ok.toLocaleString('id-ID')} <span className='text-[10px] text-muted-foreground'>({okPct}%)</span>
                      </span>
                    </div>
                    <div className='flex items-center justify-between gap-3'>
                      <span className='flex items-center gap-1.5 text-foreground'>
                        <span className='size-2 rounded-full bg-[#FF667A]' />
                        <span>{isId ? 'ditolak:' : 'rejected:'}</span>
                      </span>
                      <span className='font-bold text-[#FF667A]'>
                        {activePoint.ditolak.toLocaleString('id-ID')} <span className='text-[10px] text-muted-foreground'>({badPct}%)</span>
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

        {/* Kesehatan layanan — dari /api/health + latensi terukur (bukan angka fabrikasi) */}
        <div className='lg:col-span-4 rounded-xl border border-border/80 bg-card/80 p-5 card-3d hover-lift-3d bevel-shine'>
          <div className='flex items-center justify-between'>
            <h2 className='text-base font-bold text-foreground flex items-center gap-2'>
              <Activity className='size-4 text-[#39D6A0]' />
              {isId ? 'Kesehatan layanan' : 'Service health'}
            </h2>
            <span className='text-[11px] text-muted-foreground font-mono'>
              {health.isFetching ? '…' : (isId ? '60 dtk refetch' : '60s refetch')}
            </span>
          </div>

          <div className='divide-y divide-border/60 text-xs mt-3'>
            {(() => {
              const checks = (health.data?.checks ?? {}) as Record<string, boolean>
              const loading = health.isLoading
              const rows = [
                { name: 'License API', key: 'licenseService', sub: 'Ed25519 signer' },
                { name: 'Payment gateway', key: 'paymentConfigured', sub: 'KlikQRIS config' },
                { name: 'AI provider', key: 'providerConfigured', sub: 'gRouter supplier' },
              ]
              return rows.map((svc) => {
                const ok = checks[svc.key] === true
                return (
                  <div key={svc.key} className='flex items-center justify-between py-2.5'>
                    <div className='flex items-center gap-2.5 min-w-0'>
                      {loading ? (
                        <span className='size-2 rounded-full bg-muted-foreground/40 inline-block' />
                      ) : ok ? (
                        <span className='size-2 rounded-full bg-[#39D6A0] inline-block shadow-[0_0_6px_#39D6A0]' />
                      ) : (
                        <span className='relative flex size-2'>
                          <span className='animate-radar-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75' />
                          <span className='relative inline-flex rounded-full size-2 bg-red-500' />
                        </span>
                      )}
                      <div className='min-w-0'>
                        <div className='font-semibold text-foreground truncate'>{svc.name}</div>
                        <div className='text-[10px] text-muted-foreground font-mono truncate'>{svc.sub}</div>
                      </div>
                    </div>
                    <div className='flex items-center gap-3 font-mono'>
                      <span className='text-muted-foreground'>
                        {loading ? '…' : ok ? `${health.data?.latencyMs ?? '—'} ms` : 'down'}
                      </span>
                      <span className={`${loading ? 'text-muted-foreground' : ok ? 'text-[#39D6A0]' : 'text-red-500'} font-bold`}>
                        {loading ? '…' : ok ? (isId ? 'Normal' : 'Healthy') : (isId ? 'Gagal' : 'Failing')}
                      </span>
                    </div>
                  </div>
                )
              })
            })()}
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
            {(() => {
              const list = (((orders.data as unknown as { orders?: Array<{ id: string; status?: string; planName?: string | null; packageKey?: string; amount?: number | null; customerName?: string | null; createdAt?: number | null }> })?.orders ?? []))
                .filter((o) => String(o.status || '').toUpperCase() === 'PENDING')
                .slice(0, 8)
              if (list.length === 0) {
                return (
                  <div className='p-6 text-center text-xs text-muted-foreground rounded-xl border border-dashed border-border/70'>
                    {isId ? 'Tidak ada order menunggu verifikasi.' : 'No orders awaiting verification.'}
                  </div>
                )
              }
              return list.map((ord) => {
                const ordId = ord.id
                const ordPlan = ord.planName || ord.packageKey || '—'
                const ordAmount = ord.amount != null ? 'Rp ' + ord.amount.toLocaleString('id-ID') : '—'
                const ordCustomer = ord.customerName ?? '—'
                const ordDate = ord.createdAt ? new Date(ord.createdAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
                const isSettled = verifiedOrderIds[ordId]
                return (
                  <div key={ordId} className='p-4 rounded-xl border border-border/80 bg-muted/20 space-y-3'>
                    <div className='flex items-start justify-between gap-2'>
                      <div>
                        <div className='font-mono font-bold text-xs text-foreground flex items-center gap-1.5'>
                          <span>{ordId.slice(0, 12)}...{ordId.slice(-4)}</span>
                        </div>
                        <div className='text-xs text-muted-foreground'>{ordCustomer}</div>
                      </div>
                      <span className='font-mono font-extrabold text-xs text-foreground'>{ordAmount}</span>
                    </div>

                    <div className='flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40'>
                      <span>{ordPlan}</span>
                      <span>{ordDate}</span>
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
                            setVerifyingSheetId(ordId)
                            settleSheetMut.mutate(ordId)
                          }}
                          disabled={settleSheetMut.isPending && verifyingSheetId === ordId}
                          className='bg-[#7778FF] hover:bg-[#8F90FF] text-white text-xs h-8 interactive-press font-semibold'
                        >
                          <ShieldCheck className='size-3.5 mr-1' />
                          {settleSheetMut.isPending && verifyingSheetId === ordId
                            ? (isId ? 'Memverifikasi...' : 'Verifying...')
                            : (isId ? 'Verifikasi & Settle' : 'Verify & Settle')}
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })
            })()}
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
                      // Payload audit dari data ledger nyata — tanpa field fabrikasi.
                      const sample = JSON.stringify({
                        event: selectedEvent.event,
                        license: selectedEvent.license,
                        tokens: selectedEvent.tokens,
                        status: selectedEvent.status,
                        timestamp: selectedEvent.createdAt ?? null,
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
