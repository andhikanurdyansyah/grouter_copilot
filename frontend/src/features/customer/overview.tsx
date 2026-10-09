import { useQuery } from '@tanstack/react-query'
import { fetchMe } from '@/lib/grouter-api'
import { PageHeader } from '@/components/shared/page-header'
import { StatusBadge } from '@/components/shared/status-badge'
import { TableSkeleton, ErrorState } from '@/components/shared/data-states'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Link } from '@tanstack/react-router'
import { CheckCircle2, Circle, ArrowRight, ShieldOff, Sparkles } from 'lucide-react'

function statusOf(l: { status?: string; expiresAt?: string }): string {
  if (l.status) return String(l.status)
  if (l.expiresAt && new Date(l.expiresAt).getTime() < Date.now()) return 'expired'
  return 'active'
}

// "Status Saya": customer langsung tahu apakah lisensinya hidup, sisa kuota,
// dan langkah berikutnya — bukan grid metrik admin-style.
export function CustomerOverview() {
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe })

  if (me.isPending) {
    return (
      <div className='space-y-5'>
        <PageHeader title='Status Saya' description='Ringkasan lisensi, kuota AI, dan langkah berikutnya.' />
        <TableSkeleton rows={3} cols={3} />
      </div>
    )
  }
  if (me.isError) {
    return (
      <div className='space-y-5'>
        <PageHeader title='Status Saya' description='Ringkasan lisensi, kuota AI, dan langkah berikutnya.' />
        <ErrorState
          status={(me.error as { response?: { status?: number } })?.response?.status}
          message={(me.error as Error).message}
          onRetry={() => me.refetch()}
        />
      </div>
    )
  }

  const { account, licenses, usage } = me.data!
  const active = licenses.find((l) => statusOf(l) === 'active')
  const anyLicense = licenses[0]
  const usageRow = usage.find((u) => u.licenseId === (active ?? anyLicense)?.id)
  const aiOff = usageRow?.aiEnabled === false
  const limit = usageRow?.quotaLimit ?? null
  const used = usageRow?.usedTokens ?? 0
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const exhausted = limit !== null && used >= limit
  const near = limit !== null && !exhausted && pct >= 90

  // Onboarding: beli → aktif → pasang
  const step1 = licenses.length > 0
  const step2 = !!active
  const step3 = !!active // pasang = ada lisensi aktif (verifikasi heartbeat menyusul di Pemakaian)

  return (
    <div className='space-y-6'>
      <PageHeader
        title={`Status Saya`}
        description={anyLicense
          ? `Halo ${account.name} — begini kondisi lisensi dan kuota AI Anda.`
          : `Halo ${account.name} — Anda belum punya paket aktif. Mulai dengan memilih paket.`}
      />

      {/* STATUS LISENSI + KUOTA */}
      {!anyLicense ? (
        <Card className='overflow-hidden'>
          <CardContent className='p-0'>
            <div className='flex flex-col items-center gap-1.5 px-6 pb-6 pt-10 text-center'>
              <div className='flex size-12 items-center justify-center rounded-2xl bg-primary/10'>
                <Sparkles className='size-6 text-primary' aria-hidden />
              </div>
              <p className='mt-2 text-lg font-semibold'>Aktifkan Copilot dalam 3 langkah</p>
              <p className='max-w-md text-sm text-muted-foreground'>
                Pilih paket → pembayaran QRIS terverifikasi → lisensi aktif otomatis dan langsung bisa dipasang.
              </p>
              <Button asChild className='mt-3'>
                <Link to='/user/orders'>Pilih paket</Link>
              </Button>
            </div>
            <div className='grid gap-0 border-t sm:grid-cols-3'>
              {[
                { n: '1', t: 'Pilih paket', d: 'Bandingkan kuota & harga' },
                { n: '2', t: 'Bayar via QRIS', d: 'Terverifikasi server otomatis' },
                { n: '3', t: 'Pasang & pakai', d: 'Panduan instalasi lengkap' },
              ].map((s) => (
                <div key={s.n} className='flex items-start gap-3 border-t p-4 sm:border-t-0 sm:border-l first:border-l-0 first:border-t-0'>
                  <span className='flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary'>{s.n}</span>
                  <div>
                    <p className='text-sm font-medium'>{s.t}</p>
                    <p className='text-xs text-muted-foreground'>{s.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className='space-y-5 p-6'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <div>
                <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>Lisensi</p>
                <div className='mt-1 flex flex-wrap items-center gap-2'>
                  <code className='font-mono text-sm'>{(active ?? anyLicense).id}</code>
                  <StatusBadge tone={active ? 'success' : statusOf(anyLicense) === 'expired' ? 'warning' : 'danger'}>
                    {active ? 'AKTIF' : statusOf(anyLicense) === 'expired' ? 'KEDALUWARSA' : 'DICABUT'}
                  </StatusBadge>
                </div>
                <p className='mt-1 text-sm text-muted-foreground'>
                  Berlaku s.d. {(active ?? anyLicense).expiresAt ? new Date((active ?? anyLicense).expiresAt!).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}
                </p>
              </div>
              <Button asChild variant='outline'>
                <Link to='/user/install'>Pasang Copilot</Link>
              </Button>
            </div>

            {aiOff ? (
              <div className='flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4' role='status'>
                <ShieldOff className='mt-0.5 size-5 text-amber-600' aria-hidden />
                <div className='flex-1'>
                  <p className='text-sm font-medium'>Paket Anda tidak menyertakan fitur AI</p>
                  <p className='text-sm text-muted-foreground'>Perpanjang ke paket dengan AI untuk mengaktifkan fitur tersebut.</p>
                </div>
                <Button asChild size='sm'><Link to='/user/orders'>Lihat paket</Link></Button>
              </div>
            ) : (
              <div>
                <div className='flex items-center justify-between text-sm'>
                  <span className='font-medium'>Kuota AI</span>
                  <span className='tabular-nums text-muted-foreground'>
                    {used.toLocaleString('id-ID')} {limit !== null && limit !== undefined ? `/ ${limit.toLocaleString('id-ID')} token` : '(unlimited)'} · lifetime
                  </span>
                </div>
                {limit !== null && limit !== undefined ? (
                  <>
                    <div className='mt-2 h-2.5 overflow-hidden rounded-full bg-muted' role='progressbar' aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label='Pemakaian kuota AI'>
                      <div
                        className={'h-full rounded-full transition-colors ' + (exhausted ? 'bg-red-600' : near ? 'bg-amber-500' : 'bg-emerald-600')}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className='mt-2 flex flex-wrap items-center justify-between gap-2'>
                      <p className={'text-sm ' + (exhausted ? 'font-medium text-red-600 dark:text-red-400' : near ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                        {exhausted ? 'Kuota habis — pekerjaan AI akan ditolak sampai diperpanjang.' : near ? `Hampir habis — sisa ${(limit - used).toLocaleString('id-ID')} token.` : `Tersisa ${(limit - used).toLocaleString('id-ID')} token.`}
                      </p>
                      {(exhausted || near) && (
                        <Button asChild size='sm'>
                          <Link to='/user/orders'>Perpanjang paket</Link>
                        </Button>
                      )}
                    </div>
                  </>
                ) : (
                  <p className='mt-1 text-sm text-muted-foreground'>Paket unlimited — tidak ada batas token.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ONBOARDING JOURNEY */}
      {anyLicense && (
        <Card>
          <CardContent className='p-5'>
            <h2 className='text-sm font-semibold'>Langkah sampai berjalan</h2>
            <div className='mt-3 grid gap-2 sm:grid-cols-3'>
              <JourneyStep done={step1} label='Beli paket' hint='Pembayaran via QRIS' />
              <JourneyStep done={step2} label='Lisensi aktif' hint='Terbit otomatis' />
              <JourneyStep done={step3} label='Pasang Copilot' hint='3 langkah panduan' to={step1 && step2 ? '/user/install' : undefined} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function JourneyStep({ done, label, hint, to }: { done: boolean; label: string; hint: string; to?: string }) {
  const inner = (
    <div className={'flex items-center gap-3 rounded-lg border p-3 ' + (to ? 'transition-colors hover:bg-muted/50' : '')}>
      {done ? <CheckCircle2 className='size-5 shrink-0 text-emerald-600' aria-hidden /> : to ? <Circle className='size-5 shrink-0 text-primary' aria-hidden /> : <Circle className='size-5 shrink-0 text-muted-foreground/50' aria-hidden />}
      <div className='min-w-0'>
        <p className='text-sm font-medium'>{label}</p>
        <p className='text-xs text-muted-foreground'>{hint}</p>
      </div>
      {to && <ArrowRight className='ml-auto size-4 shrink-0 text-muted-foreground' aria-hidden />}
    </div>
  )
  return to ? <Link to={to}>{inner}</Link> : inner
}
