import { useQuery } from '@tanstack/react-query'
import { fetchHealth, fetchAdminSettings } from '@/lib/grouter-api'
import { PageHeader } from '@/components/shared/page-header'
import { StatusBadge } from '@/components/shared/status-badge'
import { TableSkeleton, ErrorState } from '@/components/shared/data-states'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Link } from '@tanstack/react-router'
import { RefreshCw, ShieldCheck, ExternalLink, ArrowRight } from 'lucide-react'

// Infrastructure control surface: ringkasan konfigurasi read-only yang akurat
// (backend hanya mengekspos baca), dikelompokkan per domain, dengan penjelasan
// dekat setiap nilai — bukan disclaimer tersebar. Nilai sensitif tidak pernah
// dikirim server ke browser; baris "kredensial" hanya menampilkan status.
function Row({ label, value, hint, mono }: { label: string; value: React.ReactNode; hint?: string; mono?: boolean }) {
  return (
    // Konsisten: label kiri + nilai KANAN satu baris (bukan kadang stacked).
    <div className='flex items-center justify-between gap-x-6 border-b border-border/60 py-2.5 last:border-0 last:pb-0'>
      <div className='min-w-0'>
        <p className='text-sm'>{label}</p>
        {hint && <p className='mt-0.5 text-xs text-muted-foreground'>{hint}</p>}
      </div>
      <div className={'shrink-0 text-right text-sm text-foreground/90 ' + (mono ? 'font-mono text-xs' : '')}>{value}</div>
    </div>
  )
}

function SectionCard({ title, badge, action, children, className }: {
  title: string
  badge?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={'py-0 ' + (className ?? '')}>
      <CardHeader className='flex-row items-center justify-between space-y-0 border-b border-border/60 py-3.5'>
        <div className='flex items-center gap-2.5'>
          <CardTitle className='text-sm font-medium'>{title}</CardTitle>
          {badge}
        </div>
        {action}
      </CardHeader>
      <CardContent className='px-4 py-1'>{children}</CardContent>
    </Card>
  )
}

// Affordance detail untuk nilai yang digrupkan (mis. "Origin terpercaya: 4"):
// tampilkan daftar isi bila data tersedia di response settings.
function DetailList({ items, label }: { items?: string[]; label: string }) {
  if (!items || items.length === 0) return null
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type='button'
          aria-label={label}
          className='ml-1 rounded-sm text-xs text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        >
          lihat
        </button>
      </PopoverTrigger>
      <PopoverContent align='end' className='w-80 p-0'>
        <ul className='max-h-56 overflow-auto py-1'>
          {items.map((item) => (
            <li key={item} className='border-b border-border/60 px-3 py-1.5 font-mono text-xs last:border-0'>
              {item}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

export function AdminSettings() {
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, refetchInterval: 60_000 })
  const settings = useQuery({ queryKey: ['admin-settings'], queryFn: fetchAdminSettings })

  const reload = () => {
    health.refetch()
    settings.refetch()
  }

  if (settings.isPending) {
    return (
      <div className='space-y-5'>
        <PageHeader title='Infrastruktur & Health' description='Status layanan dan ringkasan konfigurasi gateway.' />
        <TableSkeleton rows={5} cols={4} />
      </div>
    )
  }
  if (settings.isError) {
    return (
      <div className='space-y-5'>
        <PageHeader title='Infrastruktur & Health' description='Status layanan dan ringkasan konfigurasi gateway.' />
        <ErrorState
          status={(settings.error as { response?: { status?: number } })?.response?.status}
          message={(settings.error as Error).message}
          onRetry={() => settings.refetch()}
        />
      </div>
    )
  }

  const s = (settings.data as { settings?: Record<string, unknown> }).settings ?? {}
  const provider = s.provider as { baseUrl?: string; timeoutMs?: number; model?: string; gateway?: { defaultReservationTokens?: number; maxReservationTokens?: number; maxMessageBytes?: number } } | undefined
  const limits = s.limits as { maxContextBytes?: number; maxRows?: number; maxTokens?: number } | undefined
  const license = s.license as { audience?: string; defaultExpiresInDays?: number; defaultFeatures?: string[] } | undefined
  const usage = s.usage as { checkUsageUrl?: string; cacheTtlMs?: number } | undefined
  const payment = s.payment as { provider?: string; mode?: string; baseUrl?: string; klikqrisBaseUrl?: string; apiKey?: string; merchantId?: string; pollIntervalMs?: number; pollTimeoutMs?: number } | undefined
  const auth = s.auth as { minPasswordLength?: number; trustedOrigins?: string[]; activityTrackingIntervalMs?: number } | undefined
  const providers = (s.supportedAiProviders as string[]) ?? []

  const healthOk = !health.isError
  const credState = (v?: string) => v ? <StatusBadge tone='success'>terpasang</StatusBadge> : <StatusBadge tone='warning'>belum diatur</StatusBadge>

  return (
    <div className='mx-auto flex max-w-6xl flex-col gap-5'>
      <PageHeader
        title='Infrastruktur & Health'
        description='Semua kartu di halaman ini read-only — nilai konfigurasi berasal dari environment server dan hanya berubah lewat env/restart. Entitlement AI per-paket dikelola terpisah di Paket & Kebijakan AI.'
      >
        <Button
          variant='outline'
          size='sm'
          onClick={reload}
          disabled={health.isFetching || settings.isFetching}
        >
          <RefreshCw className={health.isFetching || settings.isFetching ? 'size-3.5 animate-spin' : 'size-3.5'} />
          Muat ulang
        </Button>
      </PageHeader>

      <div className='grid items-start gap-4 lg:grid-cols-3'>
        {/* HEALTH — service card dgn konteks nyata (polling 60 dtk dipertahankan) */}
        <Card className='py-0'>
          <CardContent className='flex flex-col gap-4 p-5'>
            <div>
              <p className='text-sm font-medium'>Service health</p>
              <div className='mt-1.5 flex items-center gap-2' role='status'>
                {healthOk ? (
                  <span className='inline-flex items-center gap-1.5 text-lg font-medium text-emerald-700 dark:text-emerald-400'>
                    <span className='relative flex size-2'>
                      <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60' />
                      <span className='relative inline-flex size-2 rounded-full bg-emerald-500' />
                    </span>
                    Sehat
                  </span>
                ) : (
                  <span className='inline-flex items-center gap-1.5 text-lg font-medium text-red-600 dark:text-red-400'>
                    <span className='size-2 rounded-full bg-red-500' /> Tak terjangkau
                  </span>
                )}
              </div>
              <p className='mt-1 text-xs text-muted-foreground'>
                /api/health · diperiksa {health.dataUpdatedAt ? new Date(health.dataUpdatedAt).toLocaleTimeString('id-ID') : '—'} · polling 60 dtk
              </p>
            </div>
            <div className='rounded-lg border bg-muted/50 px-3 py-2.5 font-mono text-xs text-muted-foreground'>
              {health.isError ? 'Gagal menghubungi /api/health' : 'GET /api/health → 200 OK'}
            </div>
          </CardContent>
        </Card>

        {/* GATEWAY PROVIDER — konfigurasi global (read-only) */}
        <SectionCard
          title='Gateway provider'
          className='lg:col-span-2'
          badge={<StatusBadge tone='info'>read-only</StatusBadge>}
          action={
            <Button asChild variant='ghost' size='sm' className='text-primary'>
              <Link to='/admin/packages'>Kebijakan AI per-paket <ArrowRight className='size-3.5' /></Link>
            </Button>
          }
        >
          <div className='grid gap-x-10 sm:grid-cols-2'>
            <div>
              <Row label='Provider' value={providers.join(', ') || '—'} mono hint='Satu-satunya provider yang didukung gateway.' />
              <Row label='Model global' value={provider?.model || '—'} mono hint='Fallback bila paket tidak menetapkan model.' />
              <Row label='Base URL' value={provider?.baseUrl || '—'} mono hint='Endpoint upstream chat completions.' />
            </div>
            <div>
              <Row label='Timeout request' value={provider?.timeoutMs ? (provider.timeoutMs / 1000) + ' dtk' : '—'} mono />
              <Row label='Reservasi token' value={`${provider?.gateway?.defaultReservationTokens?.toLocaleString('id-ID') ?? '—'} / maks ${provider?.gateway?.maxReservationTokens?.toLocaleString('id-ID') ?? '—'}`} mono hint='Default & batas reservasi per request AI.' />
              <Row label='Batas konteks' value={`${(limits?.maxContextBytes ?? 0).toLocaleString('id-ID')} B · ${(limits?.maxTokens ?? 0).toLocaleString('id-ID')} tok`} mono hint='Ukuran pesan & token maksimum per request.' />
            </div>
          </div>
        </SectionCard>
      </div>

      <div className='grid items-start gap-4 lg:grid-cols-3'>
        {/* PAYMENT — kredensial hanya status, tidak pernah nilainya */}
        <SectionCard
          title='Payment gateway'
          badge={<StatusBadge tone='info'>read-only</StatusBadge>}
          action={payment?.mode ? <StatusBadge tone={payment.mode === 'production' ? 'warning' : 'neutral'}>{payment.mode}</StatusBadge> : undefined}
        >
          <div>
            <Row label='Provider' value={payment?.provider || '—'} mono />
            <Row label='API key' value={credState(payment?.apiKey)} hint='Disimpan server; tidak pernah dikirim ke browser.' />
            <Row label='Merchant ID' value={credState(payment?.merchantId)} hint='Disimpan server; tidak pernah dikirim ke browser.' />
            <Row label='Polling' value={payment?.pollIntervalMs ? Math.round(payment.pollIntervalMs / 1000) + ' dtk' : '—'} mono />
          </div>
        </SectionCard>

        {/* LICENSE DEFAULTS */}
        <SectionCard
          title='Default lisensi'
          badge={<StatusBadge tone='info'>read-only</StatusBadge>}
          action={
            <Button asChild variant='ghost' size='sm' className='text-primary'>
              <Link to='/admin/licenses'>Kelola lisensi <ArrowRight className='size-3.5' /></Link>
            </Button>
          }
        >
          <div>
            <Row label='Audience' value={license?.audience || '—'} mono />
            <Row label='Masa berlaku default' value={license?.defaultExpiresInDays ? license.defaultExpiresInDays + ' hari' : '—'} mono />
            <Row
              label='Fitur default'
              value={
                license?.defaultFeatures?.length ? (
                  <>
                    {license.defaultFeatures.length}
                    <DetailList items={license.defaultFeatures} label='Lihat daftar fitur default' />
                  </>
                ) : (
                  '—'
                )
              }
            />
          </div>
        </SectionCard>

        {/* AUTH & SECURITY */}
        <SectionCard title='Autentikasi & sesi' badge={<StatusBadge tone='info'>read-only</StatusBadge>}>
          <div>
            <Row label='Panjang sandi minimum' value={auth?.minPasswordLength ?? '—'} mono />
            <Row label='Interval aktivitas' value={auth?.activityTrackingIntervalMs ? Math.round(auth.activityTrackingIntervalMs / 60000) + ' mnt' : '—'} mono />
            <Row
              label='Origin terpercaya'
              value={
                <>
                  {auth?.trustedOrigins?.length ?? 0}
                  <DetailList items={auth?.trustedOrigins} label='Lihat daftar origin terpercaya' />
                </>
              }
              mono
              hint='Daftar origin diizinkan untuk callback auth.'
            />
          </div>
        </SectionCard>
      </div>

      {/* USAGE UPSTREAM — infrastruktur, bukan kuota customer */}
      <Card className='py-0'>
        <CardContent className='flex flex-wrap items-center justify-between gap-3 px-4 py-3.5'>
          <div className='flex items-center gap-3'>
            <ShieldCheck className='size-4 text-muted-foreground' aria-hidden />
            <div>
              <p className='text-sm'>Usage upstream</p>
              <p className='text-xs text-muted-foreground'>
                Dimensi infrastruktur — dipisah total dari kuota customer. Cache {usage?.cacheTtlMs ? Math.round(usage.cacheTtlMs / 1000) + ' dtk' : '—'}.
              </p>
            </div>
          </div>
          <div className='flex items-center gap-3'>
            <code className='hidden font-mono text-xs text-muted-foreground md:inline'>{usage?.checkUsageUrl}</code>
            <Button asChild variant='outline' size='sm'>
              <Link to='/admin/usage'>Buka usage <ExternalLink className='size-3.5' /></Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
