import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { FlaskConical } from 'lucide-react'
import { useLanguage } from '@/context/language-provider'
import { cn } from '@/lib/utils'

export function AdminSettings() {
  const { language, t } = useLanguage()
  const isId = language === 'id'

  // Kesehatan layanan REAL: /api/health + latensi round-trip terukur (bukan angka fabrikasi).
  const healthQ = useQuery({
    queryKey: ['admin-health'],
    queryFn: async () => {
      const t0 = performance.now()
      const res = await fetch('/api/health', { credentials: 'include' })
      const ms = Math.round(performance.now() - t0)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as { status?: string; checks?: Record<string, boolean> }
      return { ...json, latencyMs: ms }
    },
    refetchInterval: 60_000,
  })
  const healthChecks = healthQ.data?.checks ?? {}

  const [activeTab, setActiveTab] = useState<'umum' | 'keamanan' | 'pembayaran' | 'kesehatan'>('umum')

  const tabs = [
    { id: 'umum', label: isId ? 'Umum' : 'General' },
    { id: 'keamanan', label: isId ? 'Keamanan & akses' : 'Security & access' },
    { id: 'pembayaran', label: isId ? 'Pembayaran' : 'Payments' },
    { id: 'kesehatan', label: isId ? 'Kesehatan layanan' : 'Service health' },
  ]

  return (
    <div className='space-y-6 animate-fade-in'>
      {/* ── Top Header Row ── */}
      <div>
        <h1 className='text-2xl font-bold tracking-tight text-foreground'>
          {isId ? 'Pengaturan' : 'Settings'}
        </h1>
        <p className='text-xs sm:text-sm text-muted-foreground mt-0.5'>
          {isId
            ? 'Konfigurasi server lisensi, gateway, dan keamanan. Nilai rahasia tidak pernah ditampilkan.'
            : 'License server, gateway, and security configuration. Secrets are never displayed.'}
        </p>
      </div>

      {/* ── Vertical Tabs & Content Grid ── */}
      <div className='grid grid-cols-1 md:grid-cols-12 gap-6'>
        {/* Left Vertical Tabs (Col 3) with semantic tablist */}
        <div
          role='tablist'
          aria-label={isId ? 'Kategori pengaturan' : 'Settings categories'}
          aria-orientation='vertical'
          className='md:col-span-3 space-y-1'
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role='tab'
              id={`tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id as Parameters<typeof setActiveTab>[0])}
              className={cn(
                'w-full text-left px-3.5 py-2.5 rounded-lg text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                activeTab === tab.id
                  ? 'bg-muted text-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right Content Pane (Col 9) */}
        <div className='md:col-span-9 space-y-5'>
          {/* TAB 1: UMUM */}
          {activeTab === 'umum' && (
            <div id='panel-umum' role='tabpanel' aria-labelledby='tab-umum' className='space-y-5 animate-fade-in'>
              <div className='rounded-xl border border-border/80 bg-card/80 p-5 card-3d bevel-shine space-y-4'>
                <div>
                  <h2 className='text-sm sm:text-base font-semibold text-foreground'>
                    {isId ? 'Server lisensi' : 'License server'}
                  </h2>
                  <p className='text-xs text-muted-foreground'>
                    {isId
                      ? 'Endpoint dan kunci verifikasi yang dipakai CLI dan plugin.'
                      : 'Endpoints and verification keys used by the CLI and plugin.'}
                  </p>
                </div>

                <div className='divide-y divide-border/60 text-xs'>
                  <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-3'>
                    <div>
                      <div className='font-medium text-foreground'>License server URL</div>
                      <div className='text-muted-foreground text-[11px] font-mono'>Default CLI --license-server</div>
                    </div>
                    <div className='font-mono text-foreground font-medium'>
                      https://copilot.grouter.id
                    </div>
                  </div>

                  <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-3'>
                    <div>
                      <div className='font-medium text-foreground'>Gateway endpoint</div>
                      <div className='text-muted-foreground text-[11px]'>D-021 · {isId ? 'satu kredensial layanan' : 'single service credential'}</div>
                    </div>
                    <div className='font-mono text-foreground font-medium'>
                      /api/copilot/chat
                    </div>
                  </div>

                  <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-3'>
                    <div>
                      <div className='font-medium text-foreground'>{isId ? 'Kunci verifikasi publik' : 'Public verification key'}</div>
                      <div className='text-muted-foreground text-[11px]'>{isId ? 'Non-rahasia' : 'Non-secret'}</div>
                    </div>
                    <div className='font-mono text-foreground font-medium'>
                      ed25519:MCow...Q9s=
                    </div>
                  </div>

                  <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-3'>
                    <div>
                      <div className='font-medium text-foreground'>{isId ? 'Kredensial gRouter' : 'gRouter credentials'}</div>
                      <div className='text-muted-foreground text-[11px]'>{isId ? 'Disimpan di env server, tidak dapat dilihat' : 'Stored in server env, hidden'}</div>
                    </div>
                    <div className='flex items-center gap-1.5 text-[#39D6A0] font-medium'>
                      <span className='size-1.5 rounded-full bg-[#39D6A0]' />
                      <span>{isId ? 'Terkonfigurasi' : 'Configured'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: KEAMANAN & AKSES */}
          {activeTab === 'keamanan' && (
            <div id='panel-keamanan' role='tabpanel' aria-labelledby='tab-keamanan' className='space-y-5 animate-fade-in'>
              <div className='rounded-xl border border-border/80 bg-card/80 p-5 card-3d bevel-shine space-y-4'>
                <div>
                  <h2 className='text-sm sm:text-base font-semibold text-foreground'>
                    {isId ? 'Keamanan & akses' : 'Security & access'}
                  </h2>
                  <p className='text-xs text-muted-foreground'>
                    {isId
                      ? 'Batas laju dan perlindungan sesi admin.'
                      : 'Rate limits and admin session protection.'}
                  </p>
                </div>

                <div className='divide-y divide-border/60 text-xs'>
                  <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-3'>
                    <div>
                      <div className='font-medium text-foreground'>Rate limit sign-in / sign-up</div>
                      <div className='text-muted-foreground text-[11px]'>Proteksi brute force autentikasi</div>
                    </div>
                    <div className='font-mono text-foreground font-medium'>
                      20 / 10 dtk per IP
                    </div>
                  </div>

                  <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-3'>
                    <div>
                      <div className='font-medium text-foreground'>{isId ? 'Fail-closed di produksi' : 'Fail-closed in production'}</div>
                      <div className='text-muted-foreground text-[11px]'>{isId ? 'Dikendalikan NODE_ENV · hanya baca di UI' : 'Controlled by NODE_ENV · read-only in UI'}</div>
                    </div>
                    <div className='flex items-center gap-1.5 text-[#39D6A0] font-medium'>
                      <span className='size-1.5 rounded-full bg-[#39D6A0]' />
                      <span>{isId ? 'Aktif' : 'Active'}</span>
                    </div>
                  </div>

                  <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-3'>
                    <div>
                      <div className='font-medium text-foreground'>Token admin</div>
                      <div className='text-muted-foreground text-[11px]'>{isId ? 'Rotasi via env server · Bearer ADMIN_TOKEN' : 'Rotate via server env · Bearer ADMIN_TOKEN'}</div>
                    </div>
                    <div>
                      <Button
                        variant='outline'
                        size='sm'
                        className='h-7 gap-1 border-border bg-card text-xs text-foreground interactive-press'
                        onClick={() => window.open('https://github.com/andhikanurdyansyah/grouter_copilot/blob/main/docs/15-decision-log.md', '_blank')}
                      >
                        {t('btn_view_guide')}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PEMBAYARAN */}
          {activeTab === 'pembayaran' && (
            <div id='panel-pembayaran' role='tabpanel' aria-labelledby='tab-pembayaran' className='space-y-5 animate-fade-in'>
              <div className='rounded-xl border border-border/80 bg-card/80 p-5 card-3d bevel-shine space-y-4'>
                <div>
                  <h2 className='text-sm sm:text-base font-semibold text-foreground'>
                    {isId ? 'Integrasi KlikQRIS' : 'KlikQRIS Integration'}
                  </h2>
                  <p className='text-xs text-muted-foreground'>
                    {isId
                      ? 'Konfigurasi gerbang pembayaran QRIS dinamis.'
                      : 'Dynamic QRIS payment gateway configuration.'}
                  </p>
                </div>

                <div className='divide-y divide-border/60 text-xs'>
                  <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-3'>
                    <div>
                      <div className='font-medium text-foreground'>Merchant ID</div>
                      <div className='text-muted-foreground text-[11px]'>ID Penyedia Pembayaran</div>
                    </div>
                    <div className='font-mono text-foreground font-medium'>
                      M-GRX-SANDBOX-091
                    </div>
                  </div>

                  <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-3'>
                    <div>
                      <div className='font-medium text-foreground'>Webhook Callback URL</div>
                      <div className='text-muted-foreground text-[11px]'>Endpoint verifikasi pembayaran untrusted</div>
                    </div>
                    <div className='font-mono text-foreground font-medium'>
                      https://copilot.grouter.id/api/webhook/klikqris
                    </div>
                  </div>

                  <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-3'>
                    <div>
                      <div className='font-medium text-foreground'>Verifikasi Settle Upstream</div>
                      <div className='text-muted-foreground text-[11px]'>D-020 · Re-verifikasi wajib sebelum penerbitan lisensi</div>
                    </div>
                    <div className='flex items-center gap-1.5 text-[#39D6A0] font-medium'>
                      <span className='size-1.5 rounded-full bg-[#39D6A0]' />
                      <span>{isId ? 'Wajib & Aktif' : 'Enforced & Active'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sandbox Mode Callout */}
              <div className='flex items-center gap-3 rounded-xl border border-border bg-card/70 p-4 shadow-2xs text-xs'>
                <FlaskConical className='size-4 text-amber-500 shrink-0' />
                <div>
                  <span className='font-semibold text-foreground'>
                    {isId ? 'Mode pembayaran: sandbox' : 'Payment mode: sandbox'}
                  </span>
                  <p className='text-muted-foreground mt-0.5'>
                    {isId
                      ? 'QRIS belum disertifikasi produksi. Order tidak menagih dana nyata.'
                      : 'QRIS is not yet certified for production. Orders do not charge real funds.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: KESEHATAN LAYANAN */}
          {activeTab === 'kesehatan' && (
            <div id='panel-kesehatan' role='tabpanel' aria-labelledby='tab-kesehatan' className='space-y-5 animate-fade-in'>
              <div className='rounded-xl border border-border/80 bg-card/80 p-5 card-3d bevel-shine space-y-4'>
                <div>
                  <h2 className='text-sm sm:text-base font-semibold text-foreground'>
                    {isId ? 'Kesehatan Layanan Internal' : 'Internal Service Health'}
                  </h2>
                  <p className='text-xs text-muted-foreground'>
                    {isId
                      ? 'Status konektivitas dan latensi komponen inti backend.'
                      : 'Connectivity status and round-trip latency of backend core services.'}
                  </p>
                </div>

                <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs'>
                  {[
                    { name: 'License Token Signer', sub: 'Ed25519 Engine', key: 'licenseService' },
                    { name: 'Payment Gateway', sub: 'KlikQRIS Config', key: 'paymentConfigured' },
                    { name: 'AI Provider', sub: 'gRouter Supplier', key: 'providerConfigured' },
                  ].map((svc) => {
                    const ok = healthChecks[svc.key] === true
                    return (
                      <div key={svc.key} className='p-3.5 rounded-xl border border-border/70 bg-card flex items-center justify-between'>
                        <div className='space-y-0.5'>
                          <div className='font-bold text-foreground'>{svc.name}</div>
                          <div className='text-muted-foreground text-[11px] font-mono'>{svc.sub}</div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-md font-mono font-bold ${
                            ok ? 'bg-emerald-500/15 text-emerald-400' : 'bg-destructive/15 text-destructive'
                          }`}
                        >
                          {healthQ.isLoading ? '…' : ok ? `${healthQ.data?.latencyMs ?? '—'}ms · OK` : 'DOWN'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
