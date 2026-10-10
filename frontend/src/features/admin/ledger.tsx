import { useMemo, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { fetchLedger, fmtDate } from '@/lib/grouter-api'
import { PageHeader } from '@/components/shared/page-header'
import { StatusBadge } from '@/components/shared/status-badge'
import { TableSkeleton, EmptyState, ErrorState } from '@/components/shared/data-states'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { X } from 'lucide-react'

const PAGE = 50

type Filters = { customer: string; status: string; model: string; licenseId: string }
const EMPTY_FILTERS: Filters = { customer: '', status: '', model: '', licenseId: '' }

// Label manusiawi untuk errorClassification dari server (gateway.js).
// Fallback: teks asli ditampilkan muted, tidak difabrikasi.
const ERROR_LABELS: Record<string, string> = {
  ai_disabled: 'AI nonaktif',
  model_not_allowed: 'Model di luar paket',
  quota_exhausted: 'Kuota habis',
  not_configured: 'AI belum dikonfigurasi',
  upstream_not_configured: 'Provider belum dikonfigurasi',
  upstream_rejected_request: 'Permintaan ditolak provider',
  upstream_timeout: 'Provider timeout',
  upstream_unavailable: 'Provider tak terjangkau',
  upstream_error: 'Gangguan provider',
}

function errorLabel(
  classification: string | null | undefined,
  status: string | undefined,
): { text: string; known: boolean } {
  if (!classification) return { text: status || 'ditolak', known: false }
  const label = ERROR_LABELS[classification]
  if (label) return { text: label, known: true }
  return { text: classification, known: false }
}

// Timestamp: entri hari ini hanya jam; entri lain tanggal singkat + jam
function fmtLedgerTime(createdAt: number | undefined): string {
  if (!createdAt) return '—'
  const d = new Date(createdAt)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) {
    return d.toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const FILTER_META: { key: keyof Filters; label: string }[] = [
  { key: 'customer', label: 'Customer' },
  { key: 'status', label: 'Status' },
  { key: 'model', label: 'Model' },
  { key: 'licenseId', label: 'License ID' },
]

export function AdminLedger() {
  // draft = nilai di kontrol form; applied = filter yang benar-benar dikirim ke server
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS)
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS)
  const [page, setPage] = useState(0)

  const ledger = useQuery({
    queryKey: ['admin-ledger', applied, page],
    queryFn: () => fetchLedger({ ...applied, limit: PAGE, offset: page * PAGE }),
    placeholderData: keepPreviousData,
  })

  const total = ledger.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE))
  const rows = (ledger.data?.records ?? []) as Record<string, unknown>[]

  const activeFilters = useMemo(
    () => FILTER_META.filter(({ key }) => applied[key] !== ''),
    [applied],
  )

  const applyFilters = () => {
    setApplied({ ...draft })
    setPage(0)
  }
  const resetFilters = () => {
    setDraft(EMPTY_FILTERS)
    setApplied(EMPTY_FILTERS)
    setPage(0)
  }
  const clearOne = (key: keyof Filters) => {
    const next = { ...applied, [key]: '' }
    setApplied(next)
    setDraft(next)
    setPage(0)
  }

  // Quick filter dari sel tabel: langsung set draft + applied
  const quickFilter = (key: keyof Filters, value: string) => {
    const next = { ...applied, [key]: value }
    setDraft(next)
    setApplied(next)
    setPage(0)
  }

  const from = total === 0 ? 0 : page * PAGE + 1
  const to = Math.min(total, (page + 1) * PAGE)

  return (
    <div className='space-y-5'>
      <PageHeader
        title='AI Ledger'
        description='Pemakaian AI customer — dihitung & diverifikasi server per request (kuota lifetime per lisensi).'
      />

      {/* Filter bar: draft diisi, "Terapkan" mengirim ke server */}
      <div className='flex flex-wrap items-center gap-2'>
        <Input
          value={draft.customer}
          onChange={(e) => setDraft({ ...draft, customer: e.target.value })}
          placeholder='Customer'
          className='w-44'
          aria-label='Filter customer'
        />
        <Select
          value={draft.status || 'all'}
          onValueChange={(v) => setDraft({ ...draft, status: v === 'all' ? '' : v })}
        >
          <SelectTrigger className='w-36' aria-label='Filter status'>
            <SelectValue placeholder='Semua status' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>Semua status</SelectItem>
            <SelectItem value='success'>Sukses</SelectItem>
            <SelectItem value='rejected'>Ditolak</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={draft.model}
          onChange={(e) => setDraft({ ...draft, model: e.target.value })}
          placeholder='Model'
          className='w-44'
          aria-label='Filter model'
        />
        <Input
          value={draft.licenseId}
          onChange={(e) => setDraft({ ...draft, licenseId: e.target.value })}
          placeholder='License ID'
          className='w-52 font-mono text-xs'
          aria-label='Filter license ID'
        />
        <Button size='sm' onClick={applyFilters}>Terapkan</Button>
        <Button
          size='sm'
          variant='ghost'
          onClick={resetFilters}
          disabled={activeFilters.length === 0 && draft === EMPTY_FILTERS}
        >
          Reset
        </Button>
      </div>

      {/* Chip filter aktif — klik × untuk menghapus satu filter */}
      {activeFilters.length > 0 && (
        <div className='flex flex-wrap items-center gap-2' role='status' aria-label='Filter aktif'>
          <span className='text-xs text-muted-foreground'>Filter aktif:</span>
          {activeFilters.map(({ key, label }) => (
            <span
              key={key}
              className='inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs text-primary'
            >
              {label}: <span className='font-medium'>{applied[key]}</span>
              <button
                type='button'
                aria-label={`Hapus filter ${label}`}
                className='rounded-sm hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
                onClick={() => clearOne(key)}
              >
                <X className='size-3' aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}

      {ledger.isPending ? (
        <TableSkeleton rows={8} cols={6} />
      ) : ledger.isError ? (
        <ErrorState
          status={(ledger.error as { response?: { status?: number } })?.response?.status}
          message={(ledger.error as Error).message}
          onRetry={() => ledger.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState title='Tidak ada entri ledger' description='Belum ada request AI yang tercatat untuk filter ini.' />
      ) : (
        <Card className='py-0'>
          <CardContent className='px-0'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu</TableHead>
                  <TableHead className='hidden md:table-cell'>Customer</TableHead>
                  <TableHead className='hidden lg:table-cell'>Model</TableHead>
                  <TableHead className='text-right'>Token</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className='hidden xl:table-cell'>License</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e, i) => {
                  const ev = e as {
                    createdAt?: number
                    customer?: string
                    model?: string | null
                    totalTokens?: number | null
                    promptTokens?: number | null
                    completionTokens?: number | null
                    status?: string
                    errorClassification?: string | null
                    licenseId?: string
                  }
                  // API ledger memakai status 'ok' untuk sukses (bukan 'success').
                  const ok = ev.status === 'ok' || ev.status === 'success'
                  const errInfo = ok ? null : errorLabel(ev.errorClassification, ev.status)
                  const hasSplit =
                    typeof ev.promptTokens === 'number' || typeof ev.completionTokens === 'number'
                  return (
                    <TableRow key={i}>
                      <TableCell className='whitespace-nowrap text-sm' title={fmtDate(ev.createdAt ? new Date(ev.createdAt).toISOString() : undefined)}>
                        {fmtLedgerTime(ev.createdAt)}
                      </TableCell>
                      <TableCell className='hidden md:table-cell'>
                        {ev.customer ? (
                          <button
                            type='button'
                            title='Filter ke customer ini'
                            aria-label={`Filter ke customer ${ev.customer}`}
                            className='font-mono text-xs underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm'
                            onClick={() => quickFilter('customer', String(ev.customer))}
                          >
                            {ev.customer}
                          </button>
                        ) : (
                          <span className='text-muted-foreground text-sm'>—</span>
                        )}
                      </TableCell>
                      <TableCell className='hidden lg:table-cell font-mono text-xs'>{ev.model || <span className='text-muted-foreground'>—</span>}</TableCell>
                      <TableCell className='text-right tabular-nums'>
                        {typeof ev.totalTokens === 'number' ? (
                          <>
                            {ev.totalTokens.toLocaleString('id-ID')}
                            {hasSplit && (
                              <span className='block text-xs text-muted-foreground'>
                                in {(ev.promptTokens ?? 0).toLocaleString('id-ID')} · out {(ev.completionTokens ?? 0).toLocaleString('id-ID')}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className='text-muted-foreground'>—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {ok ? (
                          <StatusBadge tone='success'>sukses</StatusBadge>
                        ) : errInfo?.known ? (
                          <StatusBadge tone='danger'>{errInfo.text}</StatusBadge>
                        ) : (
                          <StatusBadge tone='danger'>
                            <span className='text-muted-foreground'>{errInfo?.text}</span>
                          </StatusBadge>
                        )}
                      </TableCell>
                      <TableCell className='hidden xl:table-cell'>
                        {ev.licenseId ? (
                          <button
                            type='button'
                            title='Filter ke lisensi ini'
                            aria-label={`Filter ke lisensi ${ev.licenseId}`}
                            className='font-mono text-xs text-muted-foreground underline-offset-2 hover:underline hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm'
                            onClick={() => quickFilter('licenseId', String(ev.licenseId))}
                          >
                            {ev.licenseId}
                          </button>
                        ) : (
                          <span className='text-muted-foreground text-xs'>—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className='flex items-center justify-between'>
        <p className='text-sm text-muted-foreground' aria-live='polite' role='status'>
          Menampilkan {from.toLocaleString('id-ID')}–{to.toLocaleString('id-ID')} dari{' '}
          {total.toLocaleString('id-ID')} entri — halaman {page + 1}/{pages}
        </p>
        <div className='flex gap-2'>
          <Button
            variant='outline'
            size='sm'
            disabled={page === 0}
            aria-label='Halaman sebelumnya'
            onClick={() => setPage(page - 1)}
          >
            ← Sebelumnya
          </Button>
          <Button
            variant='outline'
            size='sm'
            disabled={page + 1 >= pages}
            aria-label='Halaman berikutnya'
            onClick={() => setPage(page + 1)}
          >
            Berikutnya →
          </Button>
        </div>
      </div>
    </div>
  )
}
