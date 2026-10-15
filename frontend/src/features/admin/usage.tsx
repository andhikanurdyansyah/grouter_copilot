import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchLedger } from '@/lib/grouter-api'
import { Link } from '@tanstack/react-router'
import {} from '@/components/ui/button'
import { useLanguage } from '@/context/language-provider'
import { cn } from '@/lib/utils'

export function AdminUsage() {
  const { language, t } = useLanguage()
  const isId = language === 'id'

  const [timeRange, setTimeRange] = useState<'24j' | '14h' | '30h'>('14h')

  // Data REAL: agregasi ledger gateway (14 hari terakhir) — token in/out per hari dalam juta.
  const ledger = useQuery({
    queryKey: ['admin-usage-ledger'],
    queryFn: () => fetchLedger({ limit: 200 }),
  })

  const [nowMs] = useState(() => Date.now())
  const rangeDays = timeRange === '24j' ? 1 : timeRange === '30h' ? 30 : 14
  const { barData, topLicenses, inboundTokens, outboundTokens, requestCount, maxDailyTokens } = useMemo(() => {
    const records = (ledger.data?.records ?? []) as Array<{
      licenseId: string; customer: string | null
      inputTokens: number | null; outputTokens: number | null
      totalTokens: number | null; createdAt: number | null
    }>
    const M = 1_000_000
    const fmtCompact = (n: number) =>
      n >= M ? (n / M).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' jt'
        : n >= 1_000 ? (n / 1_000).toLocaleString('id-ID', { maximumFractionDigits: 0 }) + ' rb'
        : n.toLocaleString('id-ID')

    const dayKey = (ts: number) => new Date(ts).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' })
    const days = new Map<string, { inTok: number; outTok: number }>()
    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = new Date(nowMs - i * 86_400_000)
      days.set(dayKey(d.getTime()), { inTok: 0, outTok: 0 })
    }
    const byLicense = new Map<string, { tokens: number; customer: string }>()
    let sumIn = 0, sumOut = 0
    for (const r of records) {
      const inT = r.inputTokens ?? 0
      const outT = r.outputTokens ?? 0
      const tot = r.totalTokens ?? inT + outT
      sumIn += inT; sumOut += outT
      if (r.createdAt) {
        const k = dayKey(r.createdAt)
        const d = days.get(k)
        if (d) { d.inTok += inT; d.outTok += outT }
      }
      const lic = byLicense.get(r.licenseId) ?? { tokens: 0, customer: r.customer ?? r.licenseId }
      lic.tokens += tot
      byLicense.set(r.licenseId, lic)
    }
    const bars = Array.from(days.entries()).map(([date, v]) => ({
      date,
      in: v.inTok / M,
      out: v.outTok / M,
    }))
    const maxTokens = Math.max(1, ...Array.from(byLicense.values()).map((v) => v.tokens))
    const top = Array.from(byLicense.entries())
      .sort((a, b) => b[1].tokens - a[1].tokens)
      .slice(0, 6)
      .map(([, v]) => ({
        name: v.customer,
        tokens: fmtCompact(v.tokens),
        percent: Math.round((v.tokens / maxTokens) * 100),
        isExceeded: false,
      }))
    void sumIn; void sumOut; return { barData: bars, topLicenses: top, inboundTokens: sumIn, outboundTokens: sumOut, requestCount: records.length, maxDailyTokens: Math.max(0, ...bars.map((d) => d.in + d.out)) }
  }, [ledger.data, nowMs, rangeDays])

  return (
    <div className='space-y-6 animate-fade-in'>
      {/* ── Top Header Row ── */}
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight text-foreground'>
            {isId ? 'Penggunaan' : 'Usage'}
          </h1>
          <p className='text-xs sm:text-sm text-muted-foreground mt-0.5'>
            {isId
              ? 'Konsumsi per lisensi dan konsumsi infrastruktur dari satu kredensial layanan gRouter.'
              : 'Per-license consumption and infrastructure usage from a single gRouter service credential.'}
          </p>
        </div>

        {/* Range Switcher */}
        <div className='flex items-center rounded-lg border border-border bg-card/70 p-0.5 shadow-2xs self-start sm:self-auto'>
          {(['24j', '14h', '30h'] as const).map((range) => (
            <button
              key={range}
              type='button'
              onClick={() => setTimeRange(range)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-all',
                timeRange === range
                  ? 'bg-muted text-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI Strip (Moda page-40) ── */}
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 rounded-xl border border-border bg-card/70 shadow-2xs divide-y sm:divide-y-0 sm:divide-x divide-border'>
        <div className='p-5'>
          <p className='text-xs font-medium text-muted-foreground'>
            {isId ? 'Token masuk' : 'Inbound tokens'}
          </p>
          <p className='mt-1 text-3xl font-bold font-mono tracking-tight text-foreground'>
            {inboundTokens.toLocaleString('id-ID')}
          </p>
        </div>

        <div className='p-5'>
          <p className='text-xs font-medium text-muted-foreground'>
            {isId ? 'Token keluar' : 'Outbound tokens'}
          </p>
          <p className='mt-1 text-3xl font-bold font-mono tracking-tight text-foreground'>
            {outboundTokens.toLocaleString('id-ID')}
          </p>
        </div>

        <div className='p-5'>
          <p className='text-xs font-medium text-muted-foreground'>
            {isId ? 'Permintaan' : 'Requests'}
          </p>
          <p className='mt-1 text-3xl font-bold font-mono tracking-tight text-foreground'>
            {requestCount.toLocaleString('id-ID')}
          </p>
        </div>

        <div className='p-5'>
          <p className='text-xs font-medium text-muted-foreground'>
            {isId ? 'Biaya infra (estimasi)' : 'Infra cost (est.)'}
          </p>
          <p className='mt-1 text-3xl font-bold font-mono tracking-tight text-foreground'>
            {ledger.isLoading ? '…' : maxDailyTokens > 0 ? `${maxDailyTokens.toLocaleString('id-ID')} jt/hari` : '—'}
          </p>
        </div>
      </div>

      {/* ── Middle Grid: Stacked Bar Chart (7 cols) + Top Licenses (5 cols) ── */}
      <div className='grid grid-cols-1 lg:grid-cols-12 gap-5'>
        {/* Token per hari Stacked Chart */}
        <div className='lg:col-span-7 rounded-xl border border-border bg-card/70 p-5 shadow-2xs space-y-4'>
          <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2'>
            <div>
              <h2 className='text-sm sm:text-base font-semibold text-foreground'>
                {isId ? 'Token per hari' : 'Tokens per day'}
              </h2>
              <p className='text-xs text-muted-foreground'>
                {isId
                  ? 'Masuk vs keluar · arahkan kursor untuk rincian'
                  : 'Inbound vs outbound · hover for details'}
              </p>
            </div>
            <div className='flex items-center gap-4 text-xs font-medium'>
              <span className='flex items-center gap-1.5 text-foreground'>
                <span className='size-2.5 rounded-xs bg-[#7778FF]' /> {isId ? 'masuk' : 'in'}
              </span>
              <span className='flex items-center gap-1.5 text-foreground'>
                <span className='size-2.5 rounded-xs bg-[#4CC9F0]' /> {isId ? 'keluar' : 'out'}
              </span>
            </div>
          </div>

          {/* Stacked Bars Component */}
          <div className='relative h-64 w-full pt-4'>
            <div className='absolute left-0 top-0 bottom-6 flex flex-col justify-between text-[10px] text-muted-foreground font-mono'>
              <span>4M</span>
              <span>3M</span>
              <span>2M</span>
              <span>1M</span>
              <span>0</span>
            </div>

            <div className='ml-7 h-full flex items-end justify-between gap-1 pb-6 border-b border-border'>
              {barData.map((d, i) => {
                const total = d.in + d.out
                void total
                const inHeightPct = (d.in / 4.0) * 100
                const outHeightPct = (d.out / 4.0) * 100
                return (
                  <div key={i} className='flex-1 flex flex-col items-center h-full justify-end group cursor-pointer'>
                    <div className='w-full max-w-[24px] flex flex-col rounded-t-sm overflow-hidden'>
                      {/* Outbound (Cyan) */}
                      <div
                        className='w-full bg-[#4CC9F0] transition-all group-hover:opacity-80'
                        style={{ height: `${outHeightPct * 1.8}px` }}
                      />
                      {/* Inbound (Purple) */}
                      <div
                        className='w-full bg-[#7778FF] transition-all group-hover:opacity-80'
                        style={{ height: `${inHeightPct * 1.8}px` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* X-Axis Dates */}
            <div className='ml-7 flex justify-between pt-1 text-[10px] text-muted-foreground font-mono'>
              {barData.map((d, i) => (
                <span key={i} className='truncate text-center w-full'>{d.date}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Lisensi teratas */}
        <div className='lg:col-span-5 rounded-xl border border-border bg-card/70 p-5 shadow-2xs space-y-4'>
          <div className='flex items-center justify-between'>
            <h2 className='text-sm sm:text-base font-semibold text-foreground'>
              {isId ? 'Lisensi teratas' : 'Top licenses'}
            </h2>
            <span className='text-xs text-muted-foreground font-mono'>
              token · {timeRange}
            </span>
          </div>

          <div className='space-y-4 pt-1'>
            {topLicenses.map((lic, i) => (
              <div key={i} className='space-y-1.5'>
                <div className='flex justify-between text-xs'>
                  <span className={cn('font-medium', lic.isExceeded ? 'text-[#FF667A]' : 'text-foreground')}>
                    {lic.name}
                  </span>
                  <span className='font-mono font-bold text-foreground'>{lic.tokens}</span>
                </div>
                <div className='h-1.5 w-full rounded-full bg-muted/60 overflow-hidden'>
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      lic.isExceeded ? 'bg-[#FF667A]' : 'bg-[#7778FF]'
                    )}
                    style={{ width: `${lic.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className='pt-3 border-t border-border/70'>
            <Link
              to='/admin/licenses'
              className='text-xs font-semibold text-[#7778FF] hover:underline flex items-center gap-1'
            >
              {t('btn_view_licenses')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
