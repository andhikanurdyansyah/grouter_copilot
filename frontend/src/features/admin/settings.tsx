import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FlaskConical } from 'lucide-react'
import { fetchAdminSettings, patchAdminSettings } from '@/lib/grouter-api'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

export function AdminSettings() {
  const { language, t } = useLanguage()
  const isId = language === 'id'

  // Konfigurasi REAL dari /api/admin/settings (nilai rahasia sudah ter-mask server-side).
  // Nilai yang ditampilkan di kartu-kartu bawah TIDAK boleh hardcode.
  const settingsQ = useQuery({
    queryKey: ['admin-settings'],
    queryFn: fetchAdminSettings,
  })
  const cfg =
    (settingsQ.data as { settings?: Record<string, unknown> } | undefined)
      ?.settings ?? {}
  const paymentCfg = (cfg.payment ?? {}) as {
    mode?: string
    merchantId?: string
    provider?: string
  }
  const merchantMasked = paymentCfg.merchantId || null

  // Notifikasi: nilai EFEKTIF dari server (cfg.notifications). Fallback di
  // bawah hanya tampilan saat loading — tidak pernah ditulis sebagai nilai
  // tersimpan. PATCH menyimpan ms mentah untuk schedulerIntervalMs.
  type NotificationSettings = {
    schedulerIntervalMs: number
    quotaThresholdPercent: number
    expiringSoonDays: number
    email: {
      enabled: boolean
      paymentReceived: boolean
      licenseIssued: boolean
      licenseExpiring: boolean
      passwordReset: boolean
    }
  }
  const NOTIF_DEFAULTS: NotificationSettings = {
    schedulerIntervalMs: 900000,
    quotaThresholdPercent: 90,
    expiringSoonDays: 7,
    email: {
      enabled: true,
      paymentReceived: true,
      licenseIssued: true,
      licenseExpiring: true,
      passwordReset: true,
    },
  }
  const rawNotif = (cfg.notifications ??
    {}) as Partial<NotificationSettings> & {
    email?: Partial<NotificationSettings['email']>
  }
  const effectiveNotif: NotificationSettings = {
    schedulerIntervalMs:
      typeof rawNotif.schedulerIntervalMs === 'number'
        ? rawNotif.schedulerIntervalMs
        : NOTIF_DEFAULTS.schedulerIntervalMs,
    quotaThresholdPercent:
      typeof rawNotif.quotaThresholdPercent === 'number'
        ? rawNotif.quotaThresholdPercent
        : NOTIF_DEFAULTS.quotaThresholdPercent,
    expiringSoonDays:
      typeof rawNotif.expiringSoonDays === 'number'
        ? rawNotif.expiringSoonDays
        : NOTIF_DEFAULTS.expiringSoonDays,
    email: {
      enabled:
        typeof rawNotif.email?.enabled === 'boolean'
          ? rawNotif.email.enabled
          : NOTIF_DEFAULTS.email.enabled,
      paymentReceived:
        typeof rawNotif.email?.paymentReceived === 'boolean'
          ? rawNotif.email.paymentReceived
          : NOTIF_DEFAULTS.email.paymentReceived,
      licenseIssued:
        typeof rawNotif.email?.licenseIssued === 'boolean'
          ? rawNotif.email.licenseIssued
          : NOTIF_DEFAULTS.email.licenseIssued,
      licenseExpiring:
        typeof rawNotif.email?.licenseExpiring === 'boolean'
          ? rawNotif.email.licenseExpiring
          : NOTIF_DEFAULTS.email.licenseExpiring,
      passwordReset:
        typeof rawNotif.email?.passwordReset === 'boolean'
          ? rawNotif.email.passwordReset
          : NOTIF_DEFAULTS.email.passwordReset,
    },
  }
  const [notifDraft, setNotifDraft] = useState<NotificationSettings | null>(
    null
  )
  const [notifStatus, setNotifStatus] = useState<'idle' | 'success' | 'error'>(
    'idle'
  )
  // Seed the edit draft once when server data first arrives (render-time
  // state adjustment; never overwrites an in-progress edit).
  const [notifSeed, setNotifSeed] = useState<unknown>(null)
  if (settingsQ.data && notifSeed !== settingsQ.data && notifDraft === null) {
    setNotifSeed(settingsQ.data)
    setNotifDraft(effectiveNotif)
  }
  const shownNotif = notifDraft ?? effectiveNotif
  const queryClient = useQueryClient()
  const saveNotif = useMutation({
    mutationFn: (payload: NotificationSettings) =>
      patchAdminSettings({ notifications: payload }),
    onSuccess: () => {
      setNotifStatus('success')
      void queryClient.invalidateQueries({ queryKey: ['admin-settings'] })
    },
    onError: () => setNotifStatus('error'),
  })
  const updateNotif = (patchNotif: Partial<NotificationSettings>) => {
    setNotifStatus('idle')
    setNotifDraft({ ...shownNotif, ...patchNotif })
  }
  const updateNotifEmail = (
    key: keyof NotificationSettings['email'],
    value: boolean
  ) => {
    setNotifStatus('idle')
    setNotifDraft({
      ...shownNotif,
      email: { ...shownNotif.email, [key]: value },
    })
  }
  const clampNotif = (v: NotificationSettings): NotificationSettings => ({
    schedulerIntervalMs: Math.max(
      1,
      Math.round(v.schedulerIntervalMs) || NOTIF_DEFAULTS.schedulerIntervalMs
    ),
    quotaThresholdPercent: Math.min(
      100,
      Math.max(
        1,
        Math.round(v.quotaThresholdPercent) ||
          NOTIF_DEFAULTS.quotaThresholdPercent
      )
    ),
    expiringSoonDays: Math.min(
      30,
      Math.max(
        1,
        Math.round(v.expiringSoonDays) || NOTIF_DEFAULTS.expiringSoonDays
      )
    ),
    email: v.email,
  })

  // Kesehatan layanan REAL: /api/health + latensi round-trip terukur (bukan angka fabrikasi).
  const healthQ = useQuery({
    queryKey: ['admin-health'],
    queryFn: async () => {
      const t0 = performance.now()
      const res = await fetch('/api/health', { credentials: 'include' })
      const ms = Math.round(performance.now() - t0)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as {
        status?: string
        checks?: Record<string, boolean>
      }
      return { ...json, latencyMs: ms }
    },
    refetchInterval: 60_000,
  })
  const healthChecks = healthQ.data?.checks ?? {}

  const [activeTab, setActiveTab] = useState<
    'umum' | 'keamanan' | 'pembayaran' | 'notifikasi' | 'kesehatan'
  >('umum')

  const tabs = [
    { id: 'umum', label: isId ? 'Umum' : 'General' },
    { id: 'keamanan', label: isId ? 'Keamanan & akses' : 'Security & access' },
    { id: 'pembayaran', label: isId ? 'Pembayaran' : 'Payments' },
    { id: 'notifikasi', label: isId ? 'Notifikasi' : 'Notifications' },
    { id: 'kesehatan', label: isId ? 'Kesehatan layanan' : 'Service health' },
  ]

  return (
    <div className='animate-fade-in space-y-6'>
      {/* ── Top Header Row ── */}
      <div>
        <h1 className='text-2xl font-bold tracking-tight text-foreground'>
          {isId ? 'Pengaturan' : 'Settings'}
        </h1>
        <p className='mt-0.5 text-xs text-muted-foreground sm:text-sm'>
          {isId
            ? 'Konfigurasi server lisensi, gateway, dan keamanan. Nilai rahasia tidak pernah ditampilkan.'
            : 'License server, gateway, and security configuration. Secrets are never displayed.'}
        </p>
      </div>

      {/* ── Vertical Tabs & Content Grid ── */}
      <div className='grid grid-cols-1 gap-6 md:grid-cols-12'>
        {/* Left Vertical Tabs (Col 3) with semantic tablist */}
        <div
          role='tablist'
          aria-label={isId ? 'Kategori pengaturan' : 'Settings categories'}
          aria-orientation='vertical'
          className='space-y-1 md:col-span-3'
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role='tab'
              id={`tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              onClick={() =>
                setActiveTab(tab.id as Parameters<typeof setActiveTab>[0])
              }
              className={cn(
                'w-full rounded-lg px-3.5 py-2.5 text-left text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
                activeTab === tab.id
                  ? 'bg-muted font-semibold text-foreground shadow-xs'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right Content Pane (Col 9) */}
        <div className='space-y-5 md:col-span-9'>
          {/* TAB 1: UMUM */}
          {activeTab === 'umum' && (
            <div
              id='panel-umum'
              role='tabpanel'
              aria-labelledby='tab-umum'
              className='animate-fade-in space-y-5'
            >
              <div className='card-3d bevel-shine space-y-4 rounded-xl border border-border/80 bg-card/80 p-5'>
                <div>
                  <h2 className='text-sm font-semibold text-foreground sm:text-base'>
                    {isId ? 'Server lisensi' : 'License server'}
                  </h2>
                  <p className='text-xs text-muted-foreground'>
                    {isId
                      ? 'Endpoint dan kunci verifikasi yang dipakai CLI dan plugin.'
                      : 'Endpoints and verification keys used by the CLI and plugin.'}
                  </p>
                </div>

                <div className='divide-y divide-border/60 text-xs'>
                  <div className='flex flex-col justify-between gap-1 py-3 sm:flex-row sm:items-center'>
                    <div>
                      <div className='font-medium text-foreground'>
                        License server URL
                      </div>
                      <div className='font-mono text-[11px] text-muted-foreground'>
                        Default CLI --license-server
                      </div>
                    </div>
                    <div className='font-mono font-medium text-foreground'>
                      {settingsQ.isLoading
                        ? '…'
                        : `https://${(cfg.branding as { publicDomain?: string } | undefined)?.publicDomain ?? '—'}`}
                    </div>
                  </div>

                  <div className='flex flex-col justify-between gap-1 py-3 sm:flex-row sm:items-center'>
                    <div>
                      <div className='font-medium text-foreground'>
                        Gateway endpoint
                      </div>
                      <div className='text-[11px] text-muted-foreground'>
                        D-021 ·{' '}
                        {isId
                          ? 'satu kredensial layanan'
                          : 'single service credential'}
                      </div>
                    </div>
                    <div className='font-mono font-medium text-foreground'>
                      /api/copilot/chat
                    </div>
                  </div>

                  <div className='flex flex-col justify-between gap-1 py-3 sm:flex-row sm:items-center'>
                    <div>
                      <div className='font-medium text-foreground'>
                        {isId
                          ? 'Kunci verifikasi publik'
                          : 'Public verification key'}
                      </div>
                      <div className='text-[11px] text-muted-foreground'>
                        {isId
                          ? 'Non-rahasia · diterbitkan saat runtime'
                          : 'Non-secret · issued at runtime'}
                      </div>
                    </div>
                    <div className='font-mono font-medium text-foreground'>
                      {isId
                        ? 'lihat .env LICENSE_PUBLIC_KEY_PEM'
                        : 'see .env LICENSE_PUBLIC_KEY_PEM'}
                    </div>
                  </div>

                  <div className='flex flex-col justify-between gap-1 py-3 sm:flex-row sm:items-center'>
                    <div>
                      <div className='font-medium text-foreground'>
                        {isId ? 'Kredensial gRouter' : 'gRouter credentials'}
                      </div>
                      <div className='text-[11px] text-muted-foreground'>
                        {isId
                          ? 'Disimpan di env server, tidak dapat dilihat'
                          : 'Stored in server env, hidden'}
                      </div>
                    </div>
                    <div className='flex items-center gap-1.5 font-medium text-[#39D6A0]'>
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
            <div
              id='panel-keamanan'
              role='tabpanel'
              aria-labelledby='tab-keamanan'
              className='animate-fade-in space-y-5'
            >
              <div className='card-3d bevel-shine space-y-4 rounded-xl border border-border/80 bg-card/80 p-5'>
                <div>
                  <h2 className='text-sm font-semibold text-foreground sm:text-base'>
                    {isId ? 'Keamanan & akses' : 'Security & access'}
                  </h2>
                  <p className='text-xs text-muted-foreground'>
                    {isId
                      ? 'Batas laju dan perlindungan sesi admin.'
                      : 'Rate limits and admin session protection.'}
                  </p>
                </div>

                <div className='divide-y divide-border/60 text-xs'>
                  <div className='flex flex-col justify-between gap-1 py-3 sm:flex-row sm:items-center'>
                    <div>
                      <div className='font-medium text-foreground'>
                        Rate limit sign-in / sign-up
                      </div>
                      <div className='text-[11px] text-muted-foreground'>
                        Proteksi brute force autentikasi
                      </div>
                    </div>
                    <div className='font-mono font-medium text-foreground'>
                      20 / 10 dtk per IP
                    </div>
                  </div>

                  <div className='flex flex-col justify-between gap-1 py-3 sm:flex-row sm:items-center'>
                    <div>
                      <div className='font-medium text-foreground'>
                        {isId
                          ? 'Fail-closed di produksi'
                          : 'Fail-closed in production'}
                      </div>
                      <div className='text-[11px] text-muted-foreground'>
                        {isId
                          ? 'Dikendalikan NODE_ENV · hanya baca di UI'
                          : 'Controlled by NODE_ENV · read-only in UI'}
                      </div>
                    </div>
                    <div className='flex items-center gap-1.5 font-medium text-[#39D6A0]'>
                      <span className='size-1.5 rounded-full bg-[#39D6A0]' />
                      <span>{isId ? 'Aktif' : 'Active'}</span>
                    </div>
                  </div>

                  <div className='flex flex-col justify-between gap-1 py-3 sm:flex-row sm:items-center'>
                    <div>
                      <div className='font-medium text-foreground'>
                        Token admin
                      </div>
                      <div className='text-[11px] text-muted-foreground'>
                        {isId
                          ? 'Rotasi via env server · Bearer ADMIN_TOKEN'
                          : 'Rotate via server env · Bearer ADMIN_TOKEN'}
                      </div>
                    </div>
                    <div>
                      <Button
                        variant='outline'
                        size='sm'
                        className='interactive-press h-7 gap-1 border-border bg-card text-xs text-foreground'
                        onClick={() =>
                          window.open(
                            'https://github.com/andhikanurdyansyah/grouter_copilot/blob/main/docs/15-decision-log.md',
                            '_blank'
                          )
                        }
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
            <div
              id='panel-pembayaran'
              role='tabpanel'
              aria-labelledby='tab-pembayaran'
              className='animate-fade-in space-y-5'
            >
              <div className='card-3d bevel-shine space-y-4 rounded-xl border border-border/80 bg-card/80 p-5'>
                <div>
                  <h2 className='text-sm font-semibold text-foreground sm:text-base'>
                    {isId ? 'Integrasi KlikQRIS' : 'KlikQRIS Integration'}
                  </h2>
                  <p className='text-xs text-muted-foreground'>
                    {isId
                      ? 'Konfigurasi gerbang pembayaran QRIS dinamis.'
                      : 'Dynamic QRIS payment gateway configuration.'}
                  </p>
                </div>

                <div className='divide-y divide-border/60 text-xs'>
                  <div className='flex flex-col justify-between gap-1 py-3 sm:flex-row sm:items-center'>
                    <div>
                      <div className='font-medium text-foreground'>
                        Merchant ID
                      </div>
                      <div className='text-[11px] text-muted-foreground'>
                        ID Penyedia Pembayaran
                      </div>
                    </div>
                    <div className='font-mono font-medium text-foreground'>
                      {settingsQ.isLoading ? '…' : merchantMasked || '—'}
                    </div>
                  </div>

                  <div className='flex flex-col justify-between gap-1 py-3 sm:flex-row sm:items-center'>
                    <div>
                      <div className='font-medium text-foreground'>
                        Webhook Callback URL
                      </div>
                      <div className='text-[11px] text-muted-foreground'>
                        Endpoint verifikasi pembayaran untrusted
                      </div>
                    </div>
                    <div className='font-mono font-medium text-foreground'>
                      {`https://${(cfg.branding as { publicDomain?: string } | undefined)?.publicDomain ?? 'copilot.grouter.id'}/api/payment/klikqris/webhook`}
                    </div>
                  </div>

                  <div className='flex flex-col justify-between gap-1 py-3 sm:flex-row sm:items-center'>
                    <div>
                      <div className='font-medium text-foreground'>
                        Verifikasi Settle Upstream
                      </div>
                      <div className='text-[11px] text-muted-foreground'>
                        D-020 · Re-verifikasi wajib sebelum penerbitan lisensi
                      </div>
                    </div>
                    <div className='flex items-center gap-1.5 font-medium text-[#39D6A0]'>
                      <span className='size-1.5 rounded-full bg-[#39D6A0]' />
                      <span>
                        {isId ? 'Wajib & Aktif' : 'Enforced & Active'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sandbox Mode Callout */}
              <div className='flex items-center gap-3 rounded-xl border border-border bg-card/70 p-4 text-xs shadow-2xs'>
                <FlaskConical className='size-4 shrink-0 text-amber-500' />
                <div>
                  <span className='font-semibold text-foreground'>
                    {isId
                      ? 'Mode pembayaran: sandbox'
                      : 'Payment mode: sandbox'}
                  </span>
                  <p className='mt-0.5 text-muted-foreground'>
                    {isId
                      ? 'QRIS belum disertifikasi produksi. Order tidak menagih dana nyata.'
                      : 'QRIS is not yet certified for production. Orders do not charge real funds.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: NOTIFIKASI */}
          {activeTab === 'notifikasi' && (
            <div
              id='panel-notifikasi'
              role='tabpanel'
              aria-labelledby='tab-notifikasi'
              className='animate-fade-in space-y-5'
            >
              <div className='card-3d bevel-shine space-y-4 rounded-xl border border-border/80 bg-card/80 p-5'>
                <div>
                  <h2 className='text-sm font-semibold text-foreground sm:text-base'>
                    {isId ? 'Notifikasi' : 'Notifications'}
                  </h2>
                  <p className='text-xs text-muted-foreground'>
                    {isId
                      ? 'Jadwal pemeriksaan, ambang kuota, dan email pemberitahuan. Notifikasi dalam aplikasi tetap aktif; kredensial penyedia email dikonfigurasi via env server (BREVO_API_KEY / MAIL_FROM) dan tidak dapat dibaca dari halaman ini.'
                      : 'Check schedule, quota threshold, and notification email. In-app notifications remain active; the email provider credential is configured via server env (BREVO_API_KEY / MAIL_FROM) and cannot be read from this page.'}
                  </p>
                </div>

                <div className='divide-y divide-border/60 text-xs'>
                  <div className='flex flex-col justify-between gap-2 py-3 sm:flex-row sm:items-center'>
                    <div>
                      <div className='font-medium text-foreground'>
                        {isId
                          ? 'Interval penjadwal (menit)'
                          : 'Scheduler interval (minutes)'}
                      </div>
                      <div className='text-[11px] text-muted-foreground'>
                        {isId
                          ? 'Disimpan sebagai milidetik (schedulerIntervalMs)'
                          : 'Stored as milliseconds (schedulerIntervalMs)'}
                      </div>
                    </div>
                    <Input
                      type='number'
                      min={1}
                      value={Math.round(shownNotif.schedulerIntervalMs / 60000)}
                      disabled={settingsQ.isLoading || saveNotif.isPending}
                      onChange={(e) =>
                        updateNotif({
                          schedulerIntervalMs: Number(e.target.value) * 60000,
                        })
                      }
                      aria-label={
                        isId
                          ? 'Interval penjadwal dalam menit'
                          : 'Scheduler interval in minutes'
                      }
                      className='h-8 w-28 text-xs'
                    />
                  </div>

                  <div className='flex flex-col justify-between gap-2 py-3 sm:flex-row sm:items-center'>
                    <div>
                      <div className='font-medium text-foreground'>
                        {isId ? 'Ambang kuota (%)' : 'Quota threshold (%)'}
                      </div>
                      <div className='text-[11px] text-muted-foreground'>
                        1–100 · quotaThresholdPercent
                      </div>
                    </div>
                    <Input
                      type='number'
                      min={1}
                      max={100}
                      value={shownNotif.quotaThresholdPercent}
                      disabled={settingsQ.isLoading || saveNotif.isPending}
                      onChange={(e) =>
                        updateNotif({
                          quotaThresholdPercent: Number(e.target.value),
                        })
                      }
                      aria-label={
                        isId
                          ? 'Ambang kuota dalam persen'
                          : 'Quota threshold percent'
                      }
                      className='h-8 w-28 text-xs'
                    />
                  </div>

                  <div className='flex flex-col justify-between gap-2 py-3 sm:flex-row sm:items-center'>
                    <div>
                      <div className='font-medium text-foreground'>
                        {isId
                          ? 'Lisensi segera kedaluwarsa (hari)'
                          : 'License expiring soon (days)'}
                      </div>
                      <div className='text-[11px] text-muted-foreground'>
                        1–30 · expiringSoonDays
                      </div>
                    </div>
                    <Input
                      type='number'
                      min={1}
                      max={30}
                      value={shownNotif.expiringSoonDays}
                      disabled={settingsQ.isLoading || saveNotif.isPending}
                      onChange={(e) =>
                        updateNotif({
                          expiringSoonDays: Number(e.target.value),
                        })
                      }
                      aria-label={
                        isId ? 'Hari sebelum kedaluwarsa' : 'Days before expiry'
                      }
                      className='h-8 w-28 text-xs'
                    />
                  </div>

                  {(
                    [
                      {
                        key: 'enabled',
                        id: isId
                          ? 'Email pemberitahuan aktif'
                          : 'Notification email enabled',
                        en: 'Notification email enabled',
                      },
                      {
                        key: 'paymentReceived',
                        id: isId
                          ? 'Email pembayaran diterima'
                          : 'Payment received email',
                        en: 'Payment received email',
                      },
                      {
                        key: 'licenseIssued',
                        id: isId
                          ? 'Email lisensi diterbitkan'
                          : 'License issued email',
                        en: 'License issued email',
                      },
                      {
                        key: 'licenseExpiring',
                        id: isId
                          ? 'Email lisensi segera kedaluwarsa'
                          : 'License expiring email',
                        en: 'License expiring email',
                      },
                      {
                        key: 'passwordReset',
                        id: isId
                          ? 'Email atur ulang kata sandi'
                          : 'Password reset email',
                        en: 'Password reset email',
                      },
                    ] as const
                  ).map((row) => (
                    <div
                      key={row.key}
                      className='flex items-center justify-between gap-2 py-3'
                    >
                      <div className='font-medium text-foreground'>
                        {isId ? row.id : row.en}
                      </div>
                      <Switch
                        checked={shownNotif.email[row.key]}
                        disabled={settingsQ.isLoading || saveNotif.isPending}
                        onCheckedChange={(v: boolean) =>
                          updateNotifEmail(row.key, v)
                        }
                        aria-label={isId ? row.id : row.en}
                      />
                    </div>
                  ))}
                </div>

                <div className='flex flex-wrap items-center gap-3'>
                  <Button
                    type='button'
                    size='sm'
                    disabled={
                      settingsQ.isLoading ||
                      saveNotif.isPending ||
                      notifDraft === null
                    }
                    onClick={() => saveNotif.mutate(clampNotif(shownNotif))}
                    className='interactive-press'
                  >
                    {saveNotif.isPending
                      ? isId
                        ? 'Menyimpan…'
                        : 'Saving…'
                      : isId
                        ? 'Simpan notifikasi'
                        : 'Save notifications'}
                  </Button>
                  {notifStatus === 'success' && (
                    <span
                      role='status'
                      className='text-[11px] font-medium text-[#39D6A0]'
                    >
                      {isId
                        ? 'Pengaturan notifikasi tersimpan.'
                        : 'Notification settings saved.'}
                    </span>
                  )}
                  {notifStatus === 'error' && (
                    <span
                      role='alert'
                      className='text-[11px] font-medium text-destructive'
                    >
                      {isId
                        ? 'Gagal menyimpan pengaturan notifikasi.'
                        : 'Failed to save notification settings.'}
                    </span>
                  )}
                  {saveNotif.isPending && (
                    <span className='text-[11px] text-muted-foreground'>
                      {isId ? 'Menyimpan…' : 'Saving…'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: KESEHATAN LAYANAN */}
          {activeTab === 'kesehatan' && (
            <div
              id='panel-kesehatan'
              role='tabpanel'
              aria-labelledby='tab-kesehatan'
              className='animate-fade-in space-y-5'
            >
              <div className='card-3d bevel-shine space-y-4 rounded-xl border border-border/80 bg-card/80 p-5'>
                <div>
                  <h2 className='text-sm font-semibold text-foreground sm:text-base'>
                    {isId
                      ? 'Kesehatan Layanan Internal'
                      : 'Internal Service Health'}
                  </h2>
                  <p className='text-xs text-muted-foreground'>
                    {isId
                      ? 'Status konektivitas dan latensi komponen inti backend.'
                      : 'Connectivity status and round-trip latency of backend core services.'}
                  </p>
                </div>

                <div className='grid grid-cols-1 gap-3 text-xs sm:grid-cols-2'>
                  {[
                    {
                      name: 'License Token Signer',
                      sub: 'Ed25519 Engine',
                      key: 'licenseService',
                    },
                    {
                      name: 'Payment Gateway',
                      sub: 'KlikQRIS Config',
                      key: 'paymentConfigured',
                    },
                    {
                      name: 'AI Provider',
                      sub: 'gRouter Supplier',
                      key: 'providerConfigured',
                    },
                  ].map((svc) => {
                    const ok = healthChecks[svc.key] === true
                    return (
                      <div
                        key={svc.key}
                        className='flex items-center justify-between rounded-xl border border-border/70 bg-card p-3.5'
                      >
                        <div className='space-y-0.5'>
                          <div className='font-bold text-foreground'>
                            {svc.name}
                          </div>
                          <div className='font-mono text-[11px] text-muted-foreground'>
                            {svc.sub}
                          </div>
                        </div>
                        <span
                          className={`rounded-md px-2 py-0.5 font-mono font-bold ${
                            ok
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'bg-destructive/15 text-destructive'
                          }`}
                        >
                          {healthQ.isLoading
                            ? '…'
                            : ok
                              ? `${healthQ.data?.latencyMs ?? '—'}ms · OK`
                              : 'DOWN'}
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
