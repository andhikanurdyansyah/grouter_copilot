import { useQuery } from '@tanstack/react-query'
import { useParams, Link } from '@tanstack/react-router'
import { fetchAdminLicenses, fetchLedger, fmtDate } from '@/lib/grouter-api'
import { StatusBadge, licenseTone } from '@/components/shared/status-badge'
import { TableSkeleton, ErrorState } from '@/components/shared/data-states'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Copy, Check, ArrowLeft, KeyRound, Package, CalendarClock, Cpu, ReceiptText } from 'lucide-react'
import { useState } from 'react'

// Adopsi AdminLicenseDetail (ZIP) → produksi: data nyata dari /api/admin/*,
// revoke lewat komponen induk (tidak diduplikasi di sini — aksi revoke
// tersedia di halaman list; detail fokus inspeksi + navigasi).
export function AdminLicenseDetail() {
  const { licenseId } = useParams({ from: '/_authenticated/admin/licenses_/$licenseId' })
  const [copied, setCopied] = useState(false)

  const licenses = useQuery({ queryKey: ['admin-licenses'], queryFn: fetchAdminLicenses })
  const ledger = useQuery({
    queryKey: ['admin-ledger', 'license', licenseId],
    queryFn: () => fetchLedger({ licenseId, limit: 10 }),
  })

  if (licenses.isPending) {
    return (
      <div className='space-y-5'>
        <TableSkeleton rows={4} cols={4} />
      </div>
    )
  }
  if (licenses.isError) {
    return (
      <ErrorState
        status={(licenses.error as { response?: { status?: number } })?.response?.status}
        message={(licenses.error as Error).message}
        onRetry={() => licenses.refetch()}
      />
    )
  }

  const license = (licenses.data?.licenses ?? []).find((l) => l.id === licenseId) as
    | { id: string; customer?: string | null; planKey?: string | null; status?: string; expiresAt?: string; createdAt?: string; quota?: number | null }
    | undefined

  if (!license) {
    return (
      <div className='space-y-5'>
        <Button asChild variant='outline' size='sm'>
          <Link to='/admin/licenses'><ArrowLeft className='size-3.5' /> Kembali</Link>
        </Button>
        <ErrorState message={`Lisensi ${licenseId} tidak ditemukan di server.`} />
      </div>
    )
  }

  const usage = (ledger.data?.records ?? []) as { totalTokens?: number | null; status?: string }[]
  const usedTokens = usage.reduce((a, r) => a + (typeof r.totalTokens === 'number' ? r.totalTokens : 0), 0)
  const quota = typeof license.quota === 'number' ? license.quota : null
  const pct = quota ? Math.min(100, Math.round((usedTokens / quota) * 100)) : null

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(license.id)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard bisa ditolak — abaikan */ }
  }

  return (
    <div className='space-y-5'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex items-center gap-3'>
          <Button asChild variant='outline' size='icon' className='size-8' aria-label='Kembali ke daftar lisensi'>
            <Link to='/admin/licenses'><ArrowLeft className='size-4' /></Link>
          </Button>
          <div>
            <div className='flex items-center gap-2'>
              <h1 className='font-mono text-lg font-semibold tracking-tight'>{license.id}</h1>
              <StatusBadge tone={licenseTone(String(license.status ?? ''))}>
                {license.status === 'active' ? 'AKTIF' : license.status === 'expired' ? 'KEDALUWARSA' : license.status === 'revoked' ? 'DICABUT' : String(license.status ?? '—').toUpperCase()}
              </StatusBadge>
            </div>
            <p className='text-[13px] text-muted-foreground'>
              Dimiliki oleh <span className='font-medium text-foreground'>{license.customer || 'tanpa nama'}</span>
            </p>
          </div>
        </div>
        <Button variant='outline' size='sm' onClick={copyId} aria-label='Salin License ID'>
          {copied ? <Check className='size-3.5 text-emerald-600' /> : <Copy className='size-3.5' />}
          {copied ? 'Tersalin' : 'Salin ID'}
        </Button>
      </div>

      <div className='grid gap-4 md:grid-cols-3'>
        <Card className='py-0'>
          <CardContent className='p-5'>
            <div className='flex items-center gap-2 text-sm font-medium text-muted-foreground'>
              <KeyRound className='size-4' aria-hidden /> Identitas
            </div>
            <dl className='mt-3 space-y-2 text-sm'>
              <div className='flex items-center justify-between gap-2'>
                <dt className='text-muted-foreground'>Package</dt>
                <dd className='font-mono text-xs'>{license.planKey || '—'}</dd>
              </div>
              <div className='flex items-center justify-between gap-2'>
                <dt className='text-muted-foreground'>Dibuat</dt>
                <dd className='tabular-nums'>{fmtDate(license.createdAt ?? null)}</dd>
              </div>
              <div className='flex items-center justify-between gap-2'>
                <dt className='text-muted-foreground'>Kedaluwarsa</dt>
                <dd className='tabular-nums'>{fmtDate(license.expiresAt ?? null)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card className='py-0'>
          <CardContent className='p-5'>
            <div className='flex items-center gap-2 text-sm font-medium text-muted-foreground'>
              <Cpu className='size-4' aria-hidden /> Entitlement AI
            </div>
            {quota !== null ? (
              <>
                <div className='mt-3 flex items-baseline justify-between'>
                  <span className='text-2xl font-bold tabular-nums'>{usedTokens.toLocaleString('id-ID')}</span>
                  <span className='text-xs text-muted-foreground tabular-nums'>/ {quota.toLocaleString('id-ID')} token · lifetime</span>
                </div>
                <div className='mt-2 h-2 overflow-hidden rounded-full bg-muted' role='progressbar' aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label='Pemakaian kuota'>
                  <div className={'h-full rounded-full ' + ((pct ?? 0) >= 90 ? 'bg-red-600' : (pct ?? 0) >= 70 ? 'bg-amber-500' : 'bg-emerald-600')} style={{ width: `${pct ?? 0}%` }} />
                </div>
              </>
            ) : (
              <p className='mt-3 text-sm text-muted-foreground'>Kuota mengikuti paket (bisa unlimited) — lihat Paket &amp; Kebijakan AI.</p>
            )}
            <div className='mt-3 flex items-center justify-between text-xs text-muted-foreground'>
              <span>{usage.length} request tercatat</span>
              <Link to='/admin/ledger' search={{ licenseId }} className='text-primary hover:underline'>Lihat di ledger →</Link>
            </div>
          </CardContent>
        </Card>

        <Card className='py-0'>
          <CardContent className='p-5'>
            <div className='flex items-center gap-2 text-sm font-medium text-muted-foreground'>
              <Package className='size-4' aria-hidden /> Aksi cepat
            </div>
            <div className='mt-3 flex flex-col gap-2'>
              <Button asChild variant='outline' size='sm' className='justify-start'>
                <Link to='/admin/packages'><Package className='size-3.5' /> Kelola paket & kebijakan</Link>
              </Button>
              <Button asChild variant='outline' size='sm' className='justify-start'>
                <Link to='/admin/orders'><ReceiptText className='size-3.5' /> Orders & payments</Link>
              </Button>
              <Button asChild variant='outline' size='sm' className='justify-start'>
                <Link to='/admin/licenses'><CalendarClock className='size-3.5' /> Semua lisensi</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className='py-0'>
        <CardContent className='px-0 pb-0'>
          <div className='px-5 py-4'>
            <h2 className='text-[15px] font-semibold'>Aktivitas AI lisensi ini</h2>
            <p className='text-xs text-muted-foreground'>10 rekaman terakhir dari AI Ledger (server-side).</p>
          </div>
          {ledger.isPending ? (
            <div className='px-5 pb-5'><TableSkeleton rows={3} cols={4} /></div>
          ) : usage.length === 0 ? (
            <p className='px-5 pb-6 text-sm text-muted-foreground'>Belum ada request AI tercatat untuk lisensi ini.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className='text-right'>Token</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usage.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className='text-xs tabular-nums'>{fmtDate(String((r as { createdAt?: number }).createdAt ?? ''))}</TableCell>
                    <TableCell className='font-mono text-xs'>{String((r as { model?: string }).model ?? '—')}</TableCell>
                    <TableCell className='text-right tabular-nums'>{typeof r.totalTokens === 'number' ? r.totalTokens.toLocaleString('id-ID') : '—'}</TableCell>
                    <TableCell>
                      <StatusBadge tone={r.status === 'success' ? 'success' : 'danger'}>{r.status === 'success' ? 'sukses' : String(r.status)}</StatusBadge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className='text-xs text-muted-foreground'>
        Order dikelola di halaman <Link to='/admin/orders' className='text-primary hover:underline'>Orders &amp; Payments</Link> — rekonsiliasi &amp; settle dari sana.
      </p>
    </div>
  )
}
