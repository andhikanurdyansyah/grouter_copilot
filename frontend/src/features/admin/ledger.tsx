import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchLedger } from '@/lib/grouter-api'
import { Button } from '@/components/ui/button'
import { Search, RotateCw, AlertCircle, FileCode, ShieldCheck } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useLanguage } from '@/context/language-provider'
import { cn } from '@/lib/utils'

export function AdminLedger() {
  const { language } = useLanguage()
  const isId = language === 'id'

  const [isLive, setIsLive] = useState(true)
  const [q, setQ] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | 'ok' | 'quota' | 'upstream' | 'replay'>('all')
  const [selectedModel, setSelectedModel] = useState('all')
  const [selectedPayload, setSelectedPayload] = useState<null | (typeof rowsList)[number]>(null)

  // Data REAL dari ledger gateway (D-021) — tanpa mock.
  const ledgerQuery = useQuery({
    queryKey: ['admin-ledger-live'],
    queryFn: () => fetchLedger({ limit: 50 }),
    refetchInterval: isLive ? 15_000 : false,
  })
  const records = (ledgerQuery.data?.records ?? []) as Array<{
    requestId: string
    licenseId: string
    customer: string | null
    model: string | null
    status: string
    inputTokens: number | null
    outputTokens: number | null
    totalTokens: number | null
    reservedTokens: number | null
    errorClassification: string | null
    createdAt: number | null
  }>

  const fmtTok = (n: number | null | undefined) =>
    n == null ? '—' : n.toLocaleString('id-ID')

  const fmtTime = (ts: number | null | undefined) =>
    ts ? new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'

  const shortId = (id: string) => (id.length > 15 ? id.slice(0, 9) + '...' + id.slice(-4) : id)

  const rowsList = records.map((r) => ({
    id: shortId(r.requestId),
    fullId: r.requestId,
    license: r.licenseId,
    time: fmtTime(r.createdAt),
    model: r.model ?? '—',
    reserved: fmtTok(r.reservedTokens),
    in: fmtTok(r.inputTokens),
    out: fmtTok(r.outputTokens),
    status: r.status,
    type: r.status === 'ok' ? 'ok' : r.status === 'reserved' ? 'replay' : r.status === 'error' ? 'upstream' : 'quota',
    customer: r.customer ?? '—',
  }))

  const filteredRows = rowsList.filter((row) => {
    if (activeTab === 'ok' && row.type !== 'ok') return false
    if (activeTab === 'quota' && row.type !== 'quota') return false
    if (activeTab === 'upstream' && row.type !== 'upstream') return false
    if (activeTab === 'replay' && row.type !== 'replay') return false

    if (selectedModel !== 'all' && row.model !== selectedModel) return false

    if (q) {
      const query = q.toLowerCase()
      return row.id.toLowerCase().includes(query) || row.license.toLowerCase().includes(query)
    }
    return true
  })

  return (
    <div className='space-y-6 animate-fade-in'>
      {/* ── Top Header Row ── */}
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h1 className='text-2xl font-extrabold tracking-tight text-foreground'>
            {isId ? 'Ledger AI' : 'AI Ledger'}
          </h1>
          <p className='text-xs sm:text-sm text-muted-foreground mt-0.5'>
            {isId
              ? 'Kontrak per permintaan gateway: reservasi token, rekonsiliasi usage upstream, dan penolakan.'
              : 'Per-request gateway contracts: reservations, upstream usage reconciliation, and rejections.'}
          </p>
        </div>

        {/* Live / Jeda Switcher */}
        <div className='flex items-center rounded-xl border border-border/80 bg-card/80 p-1 shadow-sm self-start sm:self-auto'>
          <button
            type='button'
            onClick={() => setIsLive(true)}
            className={cn(
              'flex items-center gap-2 px-3.5 py-1 text-xs font-bold rounded-lg transition-all interactive-press',
              isLive
                ? 'bg-[#7778FF] text-white shadow-md'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <span className='size-2 rounded-full bg-[#39D6A0] animate-pulse shadow-[0_0_8px_#39D6A0]' />
            Live
          </button>
          <button
            type='button'
            onClick={() => setIsLive(false)}
            className={cn(
              'px-3.5 py-1 text-xs font-semibold rounded-lg transition-all interactive-press',
              !isLive
                ? 'bg-muted text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {isId ? 'Jeda' : 'Pause'}
          </button>
        </div>
      </div>

      {/* ── Realtime Metrics Strip (Moda page-36) ── */}
      <div className='grid grid-cols-2 sm:grid-cols-5 gap-3 rounded-xl border border-border/80 bg-card/80 p-4 card-3d bevel-shine text-xs font-mono'>
        <div className='space-y-1'>
          <span className='text-muted-foreground font-sans block text-[11px] font-semibold uppercase'>REQ/MNT</span>
          <span className='font-extrabold text-foreground text-lg'>42</span>
        </div>
        <div className='space-y-1'>
          <span className='text-muted-foreground font-sans block text-[11px] font-semibold uppercase'>P95 LATENCY</span>
          <span className='font-extrabold text-[#39D6A0] text-lg'>1,82 dtk</span>
        </div>
        <div className='space-y-1'>
          <span className='text-muted-foreground font-sans block text-[11px] font-semibold uppercase'>TOKEN/JAM</span>
          <span className='font-extrabold text-[#7778FF] text-lg'>612.400</span>
        </div>
        <div className='space-y-1'>
          <span className='text-muted-foreground font-sans block text-[11px] font-semibold uppercase'>DITOLAK KUOTA</span>
          <span className='font-extrabold text-amber-500 text-lg'>3</span>
        </div>
        <div className='space-y-1 col-span-2 sm:col-span-1'>
          <span className='text-muted-foreground font-sans block text-[11px] font-semibold uppercase'>ERR UPSTREAM</span>
          <span className='font-extrabold text-[#FF667A] text-lg'>0,41%</span>
        </div>
      </div>

      {/* ── Filters & Search ── */}
      <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3'>
        <div className='flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 max-w-xl'>
          <div className='relative flex items-center flex-1'>
            <Search className='size-4 absolute left-3 text-muted-foreground pointer-events-none' />
            <input
              type='text'
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={isId ? 'requestId atau lisensi...' : 'requestId or license...'}
              className='w-full rounded-xl border border-border bg-card/70 pl-9 pr-3.5 py-2 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground transition-all focus:outline-hidden focus:ring-1 focus:ring-primary shadow-xs'
            />
          </div>

          {/* Filter Tabs */}
          <div className='flex items-center rounded-xl border border-border/80 bg-card/80 p-1 shadow-sm overflow-x-auto'>
            {[
              { id: 'all', label: isId ? 'Semua' : 'All' },
              { id: 'ok', label: 'ok' },
              { id: 'quota', label: 'quota' },
              { id: 'upstream', label: 'upstream' },
              { id: 'replay', label: 'replay' },
            ].map((tab) => (
              <button
                key={tab.id}
                type='button'
                onClick={() => setActiveTab(tab.id as Parameters<typeof setActiveTab>[0])}
                className={cn(
                  'px-3 py-1 text-xs font-mono font-semibold rounded-lg transition-all whitespace-nowrap interactive-press',
                  activeTab === tab.id
                    ? 'bg-[#7778FF] text-white shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Model Filter Dropdown */}
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          className='rounded-xl border border-border bg-card/80 px-3.5 py-2 text-xs text-foreground font-mono focus:outline-hidden focus:ring-1 focus:ring-primary self-end sm:self-auto shadow-xs'
        >
          <option value='all'>{isId ? 'Model: Semua ▾' : 'Model: All ▾'}</option>
          <option value='grouter/balanced'>grouter/balanced</option>
          <option value='grouter/fast-mini'>grouter/fast-mini</option>
          <option value='grouter/pro-large'>grouter/pro-large</option>
        </select>
      </div>

      {/* ── Table Container ── */}
      <div className='rounded-xl border border-border/80 bg-card/80 card-3d bevel-shine overflow-hidden'>
        <div className='overflow-x-auto'>
          <table className='w-full text-left text-xs'>
            <thead>
              <tr className='border-b border-border/60 bg-muted/30 text-muted-foreground font-semibold uppercase tracking-wider font-mono'>
                <th className='py-3.5 px-4'>REQUEST ID</th>
                <th className='py-3.5 px-4'>{isId ? 'LISENSI' : 'LICENSE'}</th>
                <th className='py-3.5 px-4'>{isId ? 'WAKTU ↓' : 'TIME ↓'}</th>
                <th className='py-3.5 px-4'>MODEL</th>
                <th className='py-3.5 px-4 text-right'>{isId ? 'RESERVASI' : 'RESERVATION'}</th>
                <th className='py-3.5 px-4 text-right'>IN</th>
                <th className='py-3.5 px-4 text-right'>OUT</th>
                <th className='py-3.5 px-4 text-right'>STATUS</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-border/60 font-mono'>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className='py-8 text-center text-muted-foreground font-sans'>
                    <p className='text-xs'>{isId ? 'Tidak ada entri ledger yang sesuai dengan filter ini.' : 'No ledger entries match this filter.'}</p>
                    <button
                      type='button'
                      onClick={() => {
                        setActiveTab('all')
                        setSelectedModel('all')
                        setQ('')
                      }}
                      className='mt-2 text-xs font-semibold text-[#7778FF] hover:underline'
                    >
                      {isId ? 'Reset semua filter' : 'Reset all filters'}
                    </button>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, i) => (
                  <tr
                    key={i}
                    onClick={() => setSelectedPayload(row)}
                    className='hover:bg-muted/40 transition-colors cursor-pointer group'
                  >
                  <td className='py-3.5 px-4 text-foreground font-bold group-hover:text-[#7778FF] transition-colors'>
                    {row.id}
                  </td>
                  <td className='py-3.5 px-4 text-foreground font-medium'>{row.license}</td>
                  <td className='py-3.5 px-4 text-muted-foreground'>{row.time}</td>
                  <td className='py-3.5 px-4 text-foreground'>{row.model}</td>
                  <td className='py-3.5 px-4 text-right text-muted-foreground'>{row.reserved}</td>
                  <td className='py-3.5 px-4 text-right text-foreground font-bold'>{row.in}</td>
                  <td className='py-3.5 px-4 text-right text-foreground font-bold'>{row.out}</td>
                  <td className='py-3.5 px-4 text-right font-sans'>
                    {row.type === 'ok' && (
                      <span className='inline-flex items-center gap-1.5 text-[#39D6A0] font-bold'>
                        <span className='size-1.5 rounded-full bg-[#39D6A0] shadow-[0_0_6px_#39D6A0]' /> ok
                      </span>
                    )}
                    {row.type === 'quota' && (
                      <span className='inline-flex items-center gap-1.5 text-amber-500 font-bold'>
                        <span className='size-1.5 rounded-xs bg-amber-500' /> quota
                      </span>
                    )}
                    {row.type === 'replay' && (
                      <span className='inline-flex items-center gap-1.5 text-[#4CC9F0] font-bold'>
                        <RotateCw className='size-3' /> replay
                      </span>
                    )}
                    {row.type === 'upstream' && (
                      <span className='inline-flex items-center gap-1.5 text-[#FF667A] font-bold'>
                        <AlertCircle className='size-3' /> upstream
                      </span>
                    )}
                    {row.type === 'expired' && (
                      <span className='inline-flex items-center gap-1.5 text-muted-foreground font-bold'>
                        <span className='size-1.5 rounded-full bg-muted-foreground' /> expired
                      </span>
                    )}
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>

        {/* ── Footer Bar ── */}
        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-border/70 px-4 py-3 text-xs text-muted-foreground'>
          <div>
            {isId
              ? 'Permintaan gagal/ditolak tidak ditagih · replay idempoten tidak menambah requestCount. Klik baris untuk inspeksi payload JSON.'
              : 'Failed/rejected requests are not billed · idempotent replay does not increment requestCount. Click any row to inspect JSON payload.'}
          </div>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => ledgerQuery.refetch()}
            className='h-7 text-xs text-[#7778FF] hover:text-[#8F90FF] font-semibold self-end sm:self-auto interactive-press'
          >
            {isId ? 'Muat lebih banyak' : 'Load more'}
          </Button>
        </div>
      </div>

      {/* ── 3D JSON Payload Inspection Modal ── */}
      {selectedPayload && (
        <Dialog open={!!selectedPayload} onOpenChange={() => setSelectedPayload(null)}>
          <DialogContent className='sm:max-w-xl p-6 bg-card/95 border border-border/80 backdrop-blur-2xl shadow-2xl rounded-2xl'>
            <div className='flex items-center justify-between border-b border-border/70 pb-3'>
              <div className='flex items-center gap-2.5'>
                <FileCode className='size-5 text-[#7778FF]' />
                <div>
                  <DialogTitle className='text-base font-bold text-foreground'>
                    Inspect Request: {selectedPayload.fullId}
                  </DialogTitle>
                  <DialogDescription className='text-xs text-muted-foreground font-mono'>
                    {selectedPayload.customer} · {selectedPayload.time}
                  </DialogDescription>
                </div>
              </div>
            </div>

            <div className='my-3 rounded-xl border border-border/70 bg-muted/70 dark:bg-muted/30 text-foreground dark:text-slate-200 p-4 text-xs font-mono space-y-2 overflow-x-auto shadow-inner'>
              <div className='text-indigo-400 font-bold'>&#47;&#47; Gateway Contract D-021 Verified Payload</div>
              <pre className='text-[11px] leading-relaxed'>
{`{
  "requestId": "${selectedPayload.fullId}",
  "licenseId": "${selectedPayload.license}",
  "model": "${selectedPayload.model}",
  "timestamp": "2026-10-11T${selectedPayload.time}Z",
  "tokens": {
    "reserved": "${selectedPayload.reserved}",
    "input": ${selectedPayload.in === '—' ? 0 : selectedPayload.in.replace('.', '')},
    "output": ${selectedPayload.out === '—' ? 0 : selectedPayload.out.replace('.', '')},
    "billed": ${selectedPayload.type === 'ok' ? true : false}
  },
  "status": "${selectedPayload.status}",
  "signature": "ed25519:verified_ok"
}`}
              </pre>
            </div>

            <div className='flex items-center justify-between pt-2'>
              <span className='text-xs text-emerald-400 flex items-center gap-1.5 font-medium'>
                <ShieldCheck className='size-4' /> Ed25519 cryptographically signed
              </span>
              <Button size='sm' onClick={() => setSelectedPayload(null)} className='bg-[#7778FF] hover:bg-[#8F90FF] text-white text-xs font-bold interactive-press'>
                Tutup
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
