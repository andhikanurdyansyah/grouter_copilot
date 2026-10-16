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
import { buildCsv, downloadCsv } from '@/lib/csv-export'

/**
 * AI Usage — REAL server data only (D-021 ledger).
 * - Quota & totals: /api/me → usage[0] (store.usageTotals, server-side)
 * - Request rows:   /api/me/ledger (account-scoped)
 * - No hardcoded latency/model/skill values; the detail modal renders only
 *   fields the ledger actually has.
 */
export function CustomerUsage() {
  const { language, t } = useLanguage()
  const isId = language === 'id'

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
    licenseId?: string; usedTokens?: number | null; quotaLimit?: number | null
    requestCount?: number | null; aiEnabled?: boolean
  }>
  const quotaRow = usageRows[0]
  const quotaLimit = quotaRow?.quotaLimit ?? null
  const usedTokens = quotaRow?.usedTokens ?? 0
  const quotaPercent = quotaLimit ? Math.min(100, Math.round((usedTokens / quotaLimit) * 100)) : null
  const aiEnabled = quotaRow?.aiEnabled !== false
  const fmtTok = (n: number | null | undefined) => (n == null ? '0' : n.toLocaleString('id-ID'))
  const fmtWhen = (ts: number | null | undefined) =>
    ts ? new Date(ts).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
  const shortId = (id: string) => (id.length > 15 ? id.slice(0, 9) + '...' + id.slice(-4) : id)

  type LedgerRecord = {
    requestId: string; skill: string | null; model: string | null
    status: string; totalTokens: number | null
    inputTokens: number | null; outputTokens: number | null
    createdAt: number | null; completedAt: number | null
    errorClassification: string | null
  }
  const ledgerRecords = ((myLedger.data?.records ?? []) as LedgerRecord[])

  const requestsList = ledgerRecords.map((r) => {
    const ok = r.status === 'ok'
    const tokens = r.totalTokens ?? (r.inputTokens ?? 0) + (r.outputTokens ?? 0)
    const latencyMs = r.completedAt && r.createdAt ? Math.max(1, r.completedAt - r.createdAt) : null
    return {
      requestId: r.requestId,
      time: fmtWhen(r.createdAt),
      id: shortId(r.requestId),
      skill: r.skill || r.model || (isId ? 'tanpa skill' : 'no skill'),
      tokens: fmtTok(tokens),
      status: ok ? 'ok' : (isId ? 'gagal' : 'failed'),
      isOk: ok,
      latencyMs,
      model: r.model ?? null,
      errorClassification: r.errorClassification ?? null,
    }
  })

  // Skill filter options dari DATA LEDGER (bukan hardcode).
  const skillOptions = Array.from(
    new Set(requestsList.map((r) => r.skill).filter((s): s is string => !!s && s !== '—' && !s.startsWith('tanpa') && !s.startsWith('no '))),
  ).sort()

  const filteredRequests = selectedSkill === 'all'
    ? requestsList
    : requestsList.filter((r) => r.skill === selectedSkill)

  const okCount = requestsList.filter((r) => r.isOk).length
  const failCount = requestsList.length - okCount

  return (
    <div className='space-y-5 sm:space-y-6 animate-fade-in'>
      {/* ── Top Header Row ── */}
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h1 className='text-xl sm:text-2xl font-bold tracking-tight text-foreground'>
            {isId ? 'Penggunaan AI' : 'AI Usage'}
          </h1>
          <p className='text-xs sm:text-sm text-muted-foreground mt-0.5'>
            {isId
              ? 'Token dari setiap permintaan Copilot. Permintaan gagal tidak memotong kuota.'
              : 'Tokens from each Copilot request. Failed requests do not deduct quota.'}
          </p>
        </div>
      </div>

      {/* ── Top Cards Row — compact, 4 per row on md+ ── */}
      <div className='grid grid-cols-2 lg:grid-cols-4 gap-3'>
        {/* Kuota periode ini */}
        <div className='rounded-xl border border-border bg-card/70 p-4 shadow-2xs space-y-2'>
          <p className='text-[11px] font-semibold uppercase tracking-wider text-muted-foreground'>
            {isId ? 'Kuota terpakai' : 'Quota used'}
          </p>
          <p className='text-xl sm:text-2xl font-bold font-mono tracking-tight text-foreground tabular-nums'>
            {quotaLimit == null
              ? (usedTokens > 0 ? fmtTok(usedTokens) : '∞')
              : `${quotaPercent ?? 0}%`}
          </p>
          <p className='text-[11px] text-muted-foreground font-mono tabular-nums'>
            {quotaLimit != null
              ? `${fmtTok(usedTokens)} / ${fmtTok(quotaLimit)}`
              : usedTokens > 0
                ? `${fmtTok(usedTokens)} token`
                : isId ? 'tanpa batas kuota' : 'unlimited quota'}
          </p>
          {quotaPercent != null && (
            <div className='h-1.5 w-full rounded-full bg-muted/60 overflow-hidden'>
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  (quotaPercent ?? 0) >= 90 ? 'bg-[#FF667A]' : 'bg-[#7778FF]',
                )}
                style={{ width: `${quotaPercent ?? 0}%` }}
              />
            </div>
          )}
          {!aiEnabled && (
            <p className='text-[11px] text-amber-500 font-medium'>
              {isId ? 'AI nonaktif di paket ini' : 'AI disabled on this plan'}
            </p>
          )}
        </div>

        {/* Requests (dari total ledger server, bukan page size) */}
        <div className='rounded-xl border border-border bg-card/70 p-4 shadow-2xs space-y-2'>
          <p className='text-[11px] font-semibold uppercase tracking-wider text-muted-foreground'>
            {isId ? 'Permintaan' : 'Requests'}
          </p>
          <p className='text-xl sm:text-2xl font-bold font-mono tracking-tight text-foreground tabular-nums'>
            {fmtTok(quotaRow?.requestCount ?? okCount)}
          </p>
          <p className='text-[11px] text-muted-foreground'>
            {isId ? 'berhasil (server)' : 'successful (server)'}
          </p>
        </div>

        {/* Gagal */}
        <div className='rounded-xl border border-border bg-card/70 p-4 shadow-2xs space-y-2'>
          <p className='text-[11px] font-semibold uppercase tracking-wider text-muted-foreground'>
            {isId ? 'Gagal (tidak ditagih)' : 'Failed (not billed)'}
          </p>
          <p className='text-xl sm:text-2xl font-bold font-mono tracking-tight text-foreground tabular-nums'>
            {fmtTok(failCount)}
          </p>
          <p className='text-[11px] text-muted-foreground'>
            {requestsList.length
              ? `${Math.round((failCount / requestsList.length) * 1000) / 10}% ${isId ? 'dari 50 terakhir' : 'of last 50'}`
              : '—'}
          </p>
        </div>

        {/* Rata-rata token per request OK (dari ledger page; semantik jujur) */}
        <div className='rounded-xl border border-border bg-card/70 p-4 shadow-2xs space-y-2'>
          <p className='text-[11px] font-semibold uppercase tracking-wider text-muted-foreground'>
            {isId ? 'Rata-rata / permintaan' : 'Avg / request'}
          </p>
          <p className='text-xl sm:text-2xl font-bold font-mono tracking-tight text-foreground tabular-nums'>
            {okCount ? fmtTok(Math.round(requestsList.filter((r) => r.isOk).reduce((s, r) => s + (Number(r.tokens.replace(/\./g, '')) || 0), 0) / okCount)) : '0'}
          </p>
          <p className='text-[11px] text-muted-foreground'>
            token · {isId ? '50 terakhir' : 'last 50'}
          </p>
        </div>
      </div>

      {/* ── Table: Riwayat permintaan ── */}
      <div className='rounded-xl border border-border bg-card/70 shadow-2xs space-y-4 p-4 sm:p-5'>
        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3'>
          <h2 className='text-sm sm:text-base font-semibold text-foreground'>
            {isId ? 'Riwayat permintaan' : 'Request history'}
          </h2>

          <div className='flex items-center gap-2.5'>
            {skillOptions.length > 0 && (
              <select
                value={selectedSkill}
                onChange={(e) => setSelectedSkill(e.target.value)}
                aria-label={isId ? 'Filter skill' : 'Filter by skill'}
                className='rounded-lg border border-border bg-card/60 px-3 py-1.5 text-xs text-foreground focus:ring-1 focus:ring-primary'
              >
                <option value='all'>{isId ? 'Skill: Semua' : 'Skill: All'}</option>
                {skillOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            )}

            <Button
              variant='outline'
              size='sm'
              title={isId ? 'Ekspor penggunaan yang dimuat (50 terbaru) dan difilter' : 'Export loaded, filtered usage (latest 50)'}
              className='h-8 gap-1.5 border-border bg-card text-xs font-medium'
              disabled={filteredRequests.length === 0}
              onClick={() => {
                const csv = buildCsv(
                  ['created_at_ms', 'request_id', 'skill', 'model', 'total_tokens', 'status'],
                  filteredRequests.map((r) => {
                    const raw = ledgerRecords.find((record) => record.requestId === r.requestId)
                    return [raw?.createdAt ?? null, r.requestId, raw?.skill ?? null, raw?.model ?? null, raw?.totalTokens ?? ((raw?.inputTokens ?? 0) + (raw?.outputTokens ?? 0)), raw?.status ?? null]
                  }),
                )
                downloadCsv('usage-loaded-latest-50.csv', csv)
              }}
            >
              <Download className='size-3.5' /> {t('btn_export_csv')}
            </Button>
          </div>
        </div>

        {/* Mobile: compact cards; Desktop: table */}
        <div className='md:hidden space-y-2'>
          {filteredRequests.length === 0 ? (
            <div className='py-8 text-center text-muted-foreground text-xs'>
              {ledgerRecords.length === 0
                ? (isId ? 'Belum ada permintaan — mulai dari halaman Instalasi.' : 'No requests yet — start from Installation.')
                : (isId ? 'Tidak ada yang cocok dengan filter skill ini.' : 'No requests match this skill filter.')}
            </div>
          ) : (
            filteredRequests.map((row, i) => (
              <button
                key={i}
                type='button'
                onClick={() => setSelectedRequest(row)}
                className='w-full text-left rounded-xl border border-border/80 bg-card/60 p-3 space-y-1.5 hover:bg-muted/40 transition-colors interactive-press'
              >
                <div className='flex items-center justify-between gap-2'>
                  <span className='font-mono text-xs font-semibold text-foreground'>{row.id}</span>
                  {row.isOk ? (
                    <span className='inline-flex items-center gap-1 text-[#39D6A0] text-[11px] font-medium'>
                      <span className='size-1.5 rounded-full bg-[#39D6A0]' /> ok
                    </span>
                  ) : (
                    <span className='inline-flex items-center gap-1 text-[#FF667A] text-[11px] font-medium'>
                      <AlertCircle className='size-3' /> {row.status}
                    </span>
                  )}
                </div>
                <div className='flex items-center justify-between text-[11px] text-muted-foreground'>
                  <span>{row.time}</span>
                  <span className='font-mono font-bold text-foreground'>{row.tokens} tok</span>
                </div>
                <div className='text-[11px] text-muted-foreground truncate'>{row.skill}</div>
              </button>
            ))
          )}
        </div>

        <div className='hidden md:block overflow-x-auto'>
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
                    <p className='text-xs'>{ledgerRecords.length === 0
                      ? (isId ? 'Belum ada permintaan — mulai dari halaman Instalasi.' : 'No requests yet — start from Installation.')
                      : (isId ? 'Tidak ada permintaan yang cocok dengan filter skill ini.' : 'No requests match this skill filter.')}</p>
                    {selectedSkill !== 'all' && (
                      <button
                        type='button'
                        onClick={() => setSelectedSkill('all')}
                        className='mt-2 text-xs font-semibold text-[#7778FF] hover:underline'
                      >
                        {isId ? 'Reset filter' : 'Reset filter'}
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredRequests.map((row, i) => (
                  <tr
                    key={i}
                    onClick={() => setSelectedRequest(row)}
                    className='hover:bg-muted/40 transition-colors cursor-pointer group'
                  >
                    <td className='py-3 px-2 text-muted-foreground font-sans'>{row.time}</td>
                    <td className='py-3 px-2 text-foreground font-medium group-hover:text-[#7778FF] transition-colors'>{row.id}</td>
                    <td className='py-3 px-2 text-foreground'>{row.skill}</td>
                    <td className='py-3 px-2 text-right text-foreground font-bold tabular-nums'>{row.tokens}</td>
                    <td className='py-3 px-2 text-right font-sans'>
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

      {/* Empty state (truthful): belum ada ledger sama sekali */}
      {(myLedger.data?.total ?? 0) === 0 && !myLedger.isPending && (
        <div className='rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-500 font-medium'>
          {isId
            ? 'Belum ada request pemakaian — mulai dari halaman Instalasi untuk menghubungkan Copilot Anda.'
            : 'No usage requests yet — start from the Installation page to connect your Copilot.'}
        </div>
      )}
      {myLedger.isError && (
        <div className='rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive font-medium flex items-center gap-2'>
          <AlertCircle className='size-4 shrink-0' />
          {isId ? 'Gagal memuat riwayat pemakaian — coba muat ulang.' : 'Failed to load usage history — try reloading.'}
        </div>
      )}

      {/* ── Request Detail Modal — ONLY real ledger fields ── */}
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
                ? 'Rincian eksekusi token gateway Copilot untuk permintaan ini (dari ledger server).'
                : 'Copilot gateway token breakdown for this request (from the server ledger).'}
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className='space-y-3.5 py-2 text-xs'>
              <div className='rounded-xl border border-border p-3.5 bg-muted/40 space-y-2 font-mono'>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground font-sans'>{isId ? 'Skill / Model' : 'Skill / Model'}</span>
                  <span className='font-bold text-foreground'>{selectedRequest.skill}</span>
                </div>
                {selectedRequest.model && (
                  <div className='flex justify-between'>
                    <span className='text-muted-foreground font-sans'>{isId ? 'Model' : 'Model'}</span>
                    <span className='text-foreground'>{selectedRequest.model}</span>
                  </div>
                )}
                <div className='flex justify-between'>
                  <span className='text-muted-foreground font-sans'>{isId ? 'Waktu' : 'Timestamp'}</span>
                  <span className='text-foreground'>{selectedRequest.time}</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground font-sans'>{isId ? 'Latensi' : 'Latency'}</span>
                  <span className='text-foreground'>
                    {selectedRequest.latencyMs != null
                      ? selectedRequest.latencyMs < 1000
                        ? `${selectedRequest.latencyMs} ms`
                        : `${(selectedRequest.latencyMs / 1000).toFixed(2)} ${isId ? 'dtk' : 's'}`
                      : '—'}
                  </span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground font-sans'>{isId ? 'Token Terpakai' : 'Billed Tokens'}</span>
                  <span className='font-bold text-indigo-400'>{selectedRequest.tokens} token</span>
                </div>
                {!selectedRequest.isOk && selectedRequest.errorClassification && (
                  <div className='flex justify-between'>
                    <span className='text-muted-foreground font-sans'>{isId ? 'Klasifikasi galat' : 'Error class'}</span>
                    <span className='text-[#FF667A]'>{selectedRequest.errorClassification}</span>
                  </div>
                )}
              </div>

              <div className='rounded-lg bg-card p-3 border border-border/80 text-[11px] text-muted-foreground flex items-center gap-2'>
                <Zap className='size-4 text-[#7778FF] shrink-0' />
                <span>
                  {selectedRequest.isOk
                    ? (isId ? 'Permintaan berhasil dan token-nya dipotong dari kuota (dicatat server).' : 'Request completed; its tokens were deducted from your quota (server-recorded).')
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
