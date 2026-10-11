import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useMe } from '@/features/shared/use-me'
import { fetchMyLedger } from '@/lib/grouter-api'
import { Button } from '@/components/ui/button'
import { Download, AlertCircle, FileCode, CheckCircle2, Zap } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useLanguage } from '@/context/language-provider'
import { cn } from '@/lib/utils'

export function CustomerUsage() {
  const { language, t } = useLanguage()
  const isId = language === 'id'

  const [timeRange, setTimeRange] = useState<'7h' | '14h' | 'periode'>('14h')
  const [selectedSkill, setSelectedSkill] = useState('all')
  const [selectedRequest, setSelectedRequest] = useState<null | (typeof requestsList)[number]>(null)
  // Data REAL dari ledger milik akun (D-021, server-side).
  const myLedger = useQuery({
    queryKey: ['my-ledger-live'],
    queryFn: () => fetchMyLedger(50),
    refetchInterval: 30_000,
  })
  const { data: meData } = useMe(true)
  // Kuota & pemakaian dari server (/api/me) — bukan angka hardcode.
  const usageRows = ((meData && 'usage' in meData ? meData.usage : []) ?? []) as Array<{
    licenseId?: string; usedTokens?: number | null; quotaLimit?: number | null; requestCount?: number | null
  }>
  const quotaRow = usageRows[0]
  const quotaLimit = quotaRow?.quotaLimit ?? null
  const usedTokens = quotaRow?.usedTokens ?? 0
  const quotaPercent = quotaLimit ? Math.min(100, Math.round((usedTokens / quotaLimit) * 100)) : null
  const fmtTok = (n: number | null | undefined) => (n == null ? '0' : n.toLocaleString('id-ID'))
  const fmtWhen = (ts: number | null | undefined) =>
    ts ? new Date(ts).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
  const shortId = (id: string) => (id.length > 15 ? id.slice(0, 9) + '...' + id.slice(-4) : id)

  const requestsList = ((myLedger.data?.records ?? []) as Array<{
    requestId: string; skill: string | null; model: string | null
    status: string; totalTokens: number | null
    inputTokens: number | null; outputTokens: number | null
    createdAt: number | null
  }>).map((r) => {
    const ok = r.status === 'ok'
    const tokens = r.totalTokens ?? (r.inputTokens ?? 0) + (r.outputTokens ?? 0)
    return {
      time: fmtWhen(r.createdAt),
      id: shortId(r.requestId),
      skill: r.skill || r.model || '—',
      tokens: fmtTok(tokens),
      status: ok ? 'ok' : (isId ? 'gagal' : 'failed'),
      isOk: ok,
    }
  })

  const filteredRequests = selectedSkill === 'all'
    ? requestsList
    : requestsList.filter((r) => r.skill === selectedSkill)

  return (
    <div className='space-y-6 animate-fade-in'>
      {/* ── Top Header Row ── */}
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight text-foreground'>
            {isId ? 'Penggunaan AI' : 'AI Usage'}
          </h1>
          <p className='text-xs sm:text-sm text-muted-foreground mt-0.5'>
            {isId
              ? 'Token dari setiap permintaan Copilot. Permintaan gagal tidak memotong kuota.'
              : 'Tokens from each Copilot request. Failed requests do not deduct quota.'}
          </p>
        </div>

        {/* Time Switcher */}
        <div className='flex items-center rounded-lg border border-border bg-card/70 p-0.5 shadow-2xs self-start sm:self-auto'>
          {[
            { id: '7h', label: '7h' },
            { id: '14h', label: '14h' },
            { id: 'periode', label: isId ? 'Periode' : 'Period' },
          ].map((item) => (
            <button
              key={item.id}
              type='button'
              onClick={() => setTimeRange(item.id as Parameters<typeof setTimeRange>[0])}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-all',
                timeRange === item.id
                  ? 'bg-muted text-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Top Cards Row (Moda page-56) ── */}
      <div className='grid grid-cols-1 lg:grid-cols-12 gap-5'>
        {/* Kuota periode ini (Col 5) */}
        <div className='lg:col-span-5 rounded-xl border border-border bg-card/70 p-5 shadow-2xs space-y-3'>
          <div className='flex items-center justify-between'>
            <span className='text-xs font-semibold text-muted-foreground'>
              {isId ? 'Kuota periode ini' : 'Quota this period'}
            </span>
            <span className='text-xs text-muted-foreground font-mono'>
              {isId ? 'periode berjalan' : 'current period'}
            </span>
          </div>

          <div className='space-y-2'>
            <div className='flex items-baseline justify-between'>
              <span className='text-3xl font-bold font-mono tracking-tight text-foreground'>
                {quotaPercent != null ? `${quotaPercent}%` : quotaLimit == null ? '∞' : '—'}
              </span>
              <span className='font-mono text-xs text-muted-foreground'>
                {quotaLimit != null
                  ? `${fmtTok(usedTokens)} / ${fmtTok(quotaLimit)}`
                  : usedTokens > 0
                    ? `${fmtTok(usedTokens)} token`
                    : '—'}
              </span>
            </div>
            <div className='h-2 w-full rounded-full bg-muted/60 overflow-hidden'>
              <div className='h-full rounded-full bg-[#7778FF]' style={{ width: `${quotaPercent ?? 0}%` }} />
            </div>
          </div>

          <p className='text-xs text-muted-foreground pt-1'>
            {isId
              ? 'Kuota berkurang dari pemakaian nyata per permintaan; permintaan gagal tidak memotong kuota.'
              : 'Quota decrements from real usage per request; failed requests do not deduct quota.'}
          </p>
        </div>

        {/* 3 Metrics (Col 7) */}
        <div className='lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 rounded-xl border border-border bg-card/70 shadow-2xs divide-y sm:divide-y-0 sm:divide-x divide-border'>
          <div className='p-5'>
            <p className='text-xs font-medium text-muted-foreground'>
              {isId ? 'Permintaan' : 'Requests'}
            </p>
            <p className='mt-1 text-3xl font-bold font-mono tracking-tight text-foreground'>
              {fmtTok(requestsList.length)}
            </p>
            <p className='mt-2 text-xs text-muted-foreground'>
              {isId ? '50 terakhir dari ledger' : 'last 50 from ledger'}
            </p>
          </div>

          <div className='p-5'>
            <p className='text-xs font-medium text-muted-foreground'>
              {isId ? 'Rata-rata / permintaan' : 'Average / request'}
            </p>
            <p className='mt-1 text-3xl font-bold font-mono tracking-tight text-foreground'>
              {requestsList.length
                ? fmtTok(Math.round((quotaRow?.usedTokens ?? 0) / requestsList.length))
                : '0'}
            </p>
            <p className='mt-2 text-xs text-muted-foreground'>
              token
            </p>
          </div>

          <div className='p-5'>
            <p className='text-xs font-medium text-muted-foreground'>
              {isId ? 'Gagal (tidak ditagih)' : 'Failed (not billed)'}
            </p>
            <p className='mt-1 text-3xl font-bold font-mono tracking-tight text-foreground'>
              {fmtTok(requestsList.filter((r) => !r.isOk).length)}
            </p>
            <p className='mt-2 text-xs text-muted-foreground'>
              {requestsList.length
                ? `${Math.round((requestsList.filter((r) => !r.isOk).length / requestsList.length) * 1000) / 10}%`
                : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Table: Riwayat permintaan ── */}
      <div className='rounded-xl border border-border bg-card/70 shadow-2xs space-y-4 p-5'>
        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3'>
          <h2 className='text-sm sm:text-base font-semibold text-foreground'>
            {isId ? 'Riwayat permintaan' : 'Request history'}
          </h2>

          <div className='flex items-center gap-2.5'>
            <select
              value={selectedSkill}
              onChange={(e) => setSelectedSkill(e.target.value)}
              className='rounded-lg border border-border bg-card/60 px-3 py-1.5 text-xs text-foreground focus:ring-1 focus:ring-primary'
            >
              <option value='all'>{isId ? 'Skill: Semua ▾' : 'Skill: All ▾'}</option>
              <option value='orders.list'>orders.list</option>
              <option value='tickets.list'>tickets.list</option>
              <option value='customers.find'>customers.find</option>
            </select>

            <Button
              variant='outline'
              size='sm'
              className='h-8 gap-1.5 border-border bg-card text-xs font-medium'
              onClick={() => {
                const csv = 'time,id,skill,tokens,status\n' + filteredRequests.map(r => `${r.time},${r.id},${r.skill},${r.tokens},${r.status}`).join('\n')
                const blob = new Blob([csv], { type: 'text/csv' })
                const a = document.createElement('a')
                a.href = URL.createObjectURL(blob)
                a.download = 'requests.csv'
                a.click()
              }}
            >
              <Download className='size-3.5' /> {t('btn_export_csv')}
            </Button>
          </div>
        </div>

        <div className='overflow-x-auto'>
          <table className='w-full text-left text-xs'>
            <thead>
              <tr className='border-b border-border text-muted-foreground font-semibold uppercase tracking-wider font-mono'>
                <th className='pb-3 px-2'>{isId ? 'WAKTU ↓' : 'TIME ↓'}</th>
                <th className='pb-3 px-2'>REQUEST ID</th>
                <th className='pb-3 px-2'>SKILL</th>
                <th className='pb-3 px-2 text-right'>TOKEN</th>
                <th className='pb-3 px-2 text-right'>STATUS</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-border/60 font-mono'>
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={5} className='py-8 text-center text-muted-foreground'>
                    <p className='text-xs'>{isId ? 'Tidak ada permintaan yang cocok dengan filter skill ini.' : 'No requests match this skill filter.'}</p>
                    <button
                      type='button'
                      onClick={() => setSelectedSkill('all')}
                      className='mt-2 text-xs font-semibold text-[#7778FF] hover:underline'
                    >
                      {isId ? 'Reset filter' : 'Reset filter'}
                    </button>
                  </td>
                </tr>
              ) : (
                filteredRequests.map((row, i) => (
                  <tr
                    key={i}
                    onClick={() => setSelectedRequest(row)}
                    className='hover:bg-muted/40 transition-colors cursor-pointer group'
                  >
                    <td className='py-3.5 px-2 text-muted-foreground font-sans'>{row.time}</td>
                    <td className='py-3.5 px-2 text-foreground font-medium group-hover:text-[#7778FF] transition-colors'>{row.id}</td>
                    <td className='py-3.5 px-2 text-foreground'>{row.skill}</td>
                    <td className='py-3.5 px-2 text-right text-foreground font-bold'>{row.tokens}</td>
                    <td className='py-3.5 px-2 text-right font-sans'>
                      {row.isOk ? (
                        <span className='inline-flex items-center gap-1.5 text-[#39D6A0] font-medium'>
                          <span className='size-1.5 rounded-full bg-[#39D6A0]' /> ok
                        </span>
                      ) : (
                        <span className='inline-flex items-center gap-1.5 text-[#FF667A] font-medium'>
                          <AlertCircle className='size-3' /> {row.status}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className='flex items-center justify-between pt-3 border-t border-border/70 text-xs text-muted-foreground'>
          <div>
            {filteredRequests.length} {isId ? 'dari' : 'of'} {(myLedger.data?.total ?? filteredRequests.length).toLocaleString('id-ID')} {isId ? 'permintaan' : 'requests'}
          </div>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => myLedger.refetch()}
            className='h-7 text-xs text-[#7778FF] hover:text-[#8F90FF] font-medium interactive-press'
          >
            {isId ? 'Muat lebih banyak' : 'Load more'}
          </Button>
        </div>
      </div>

      {(myLedger.data?.total ?? 0) === 0 && !myLedger.isPending && (
        <div className='rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-500 font-medium'>
          {isId
            ? 'Belum ada request pemakaian — mulai dari halaman Instalasi untuk menghubungkan Copilot Anda.'
            : 'No usage requests yet — start from the Installation page to connect your Copilot.'}
        </div>
      )}

            {/* ── Request Detail Modal (Moda contextual modal pattern) ── */}

      <Dialog open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
        <DialogContent className='sm:max-w-md border-border bg-card/95 backdrop-blur-xl shadow-2xl'>
          <DialogHeader>
            <div className='flex items-center justify-between pr-4'>
              <DialogTitle className='text-base font-bold text-foreground flex items-center gap-2'>
                <FileCode className='size-4 text-[#7778FF]' />
                <span className='font-mono'>{selectedRequest?.id}</span>
              </DialogTitle>
              {selectedRequest?.isOk ? (
                <span className='inline-flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 font-bold border border-emerald-500/20'>
                  <CheckCircle2 className='size-3' /> ok
                </span>
              ) : (
                <span className='inline-flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded-md bg-[#FF667A]/10 text-[#FF667A] font-bold border border-[#FF667A]/20'>
                  <AlertCircle className='size-3' /> {selectedRequest?.status}
                </span>
              )}
            </div>
            <DialogDescription className='text-xs text-muted-foreground pt-1'>
              {isId
                ? 'Rincian eksekusi token gateway Copilot untuk permintaan ini.'
                : 'Copilot gateway token execution breakdown for this request.'}
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className='space-y-3.5 py-2 text-xs'>
              <div className='rounded-xl border border-border p-3.5 bg-muted/40 space-y-2 font-mono'>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground font-sans'>{isId ? 'Skill Terpanggil' : 'Invoked Skill'}</span>
                  <span className='font-bold text-foreground'>{selectedRequest.skill}</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground font-sans'>{isId ? 'Waktu Eksekusi' : 'Timestamp'}</span>
                  <span className='text-foreground'>{selectedRequest.time}</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground font-sans'>{isId ? 'Token Terpakai' : 'Billed Tokens'}</span>
                  <span className='font-bold text-indigo-400'>{selectedRequest.tokens} token</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground font-sans'>{isId ? 'Model Gateway' : 'Gateway Model'}</span>
                  <span className='text-foreground'>grouter/balanced</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground font-sans'>{isId ? 'Latensi P95' : 'Latency P95'}</span>
                  <span className='text-foreground'>1,42 dtk</span>
                </div>
              </div>

              <div className='rounded-lg bg-card p-3 border border-border/80 text-[11px] text-muted-foreground flex items-center gap-2'>
                <Zap className='size-4 text-[#7778FF] shrink-0' />
                <span>
                  {selectedRequest.isOk
                    ? (isId ? 'Permintaan berhasil diselesaikan dan dipotong dari kuota bulanan.' : 'Request completed successfully and deducted from monthly quota.')
                    : (isId ? 'Permintaan gagal. Tidak ada token yang dipotong dari kuota Anda (invarian biaya).' : 'Request failed. Zero tokens deducted from your quota (cost invariant).')}
                </span>
              </div>
            </div>
          )}

          <div className='pt-2 flex justify-end'>
            <Button
              type='button'
              onClick={() => setSelectedRequest(null)}
              className='text-xs bg-[#7778FF] hover:bg-[#8F90FF] text-white font-semibold'
            >
              {isId ? 'Tutup' : 'Close'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
