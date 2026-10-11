import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMe } from '@/lib/grouter-api'
import { useLanguage } from '@/context/language-provider'
import {
  Shield,
  Building,
  KeyRound,
  LogOut,
  AlertTriangle,
  RotateCw,
  CheckCircle2,
  XCircle,
  Lock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SignOutDialog } from '@/components/sign-out-dialog'

export function CustomerAccount() {
  const { language, t } = useLanguage()
  const qc = useQueryClient()
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe })
  const [signOutOpen, setSignOutOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'profile' | 'states'>('profile')
  const [editProfileOpen, setEditProfileOpen] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [tempName, setTempName] = useState('')
  const [profileError, setProfileError] = useState('')

  // Identitas dari sesi server (/api/me) — tanpa fallback mock.
  const account = me.data?.account
  const userName = account?.name ?? '—'
  const userEmail = account?.email ?? '—'
  const licenses = me.data?.licenses ?? []
  const usageRows = me.data?.usage ?? []

  // Lisensi aktif pertama = sumber kuota/kedaluwarsa (data server, bukan angka hardcode).
  const activeLicense = licenses.find((l: { status?: string | null }) => {
    const st = String(l.status ?? 'active')
    const expired = (l as { expiresAt?: string | number | null }).expiresAt
      ? new Date((l as { expiresAt: string | number }).expiresAt).getTime() < Date.now()
      : false
    return st === 'active' && !expired
  })
  const activeUsage = activeLicense ? usageRows.find((u: { licenseId?: string }) => u.licenseId === (activeLicense as { id?: string }).id) : undefined
  const quotaLimit = (activeUsage as { quotaLimit?: number | null } | undefined)?.quotaLimit ?? null
  const usedTokens = (activeUsage as { usedTokens?: number | null } | undefined)?.usedTokens ?? 0
  const quotaPercent = quotaLimit ? Math.min(100, Math.round((usedTokens / quotaLimit) * 100)) : null
  const emailDomain = userEmail.includes('@') ? userEmail.split('@')[1] : null
  const activeExpiresAt = activeLicense ? (activeLicense as { expiresAt?: string | number | null }).expiresAt ?? null : null

  return (
    <div className='max-w-7xl mx-auto space-y-6 pb-12'>
      {/* Header */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight text-foreground'>
            {language === 'id' ? 'Akun & Sistem' : 'Account & System'}
          </h1>
          <p className='text-sm text-muted-foreground mt-1'>
            {language === 'id'
              ? 'Kelola identitas pengguna, sesi login, dan standar state antarmuka.'
              : 'Manage user identity, active sessions, and interface system states.'}
          </p>
        </div>

        {/* Tab switch with semantic accessibility */}
        <div role='tablist' aria-label={language === 'id' ? 'Pengaturan akun' : 'Account settings'} className='flex items-center rounded-lg border border-border/60 bg-secondary/30 p-1 self-start sm:self-auto'>
          <button
            id='tab-profile'
            role='tab'
            aria-selected={activeTab === 'profile'}
            aria-controls='panel-profile'
            type='button'
            onClick={() => setActiveTab('profile')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              activeTab === 'profile'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {language === 'id' ? 'Profil & Sesi' : 'Profile & Session'}
          </button>
          <button
            id='tab-states'
            role='tab'
            aria-selected={activeTab === 'states'}
            aria-controls='panel-states'
            type='button'
            onClick={() => setActiveTab('states')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              activeTab === 'states'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {language === 'id' ? 'State Sistem (Moda)' : 'System States (Moda)'}
          </button>
        </div>
      </div>

      {activeTab === 'profile' && (
        <div id='panel-profile' role='tabpanel' aria-labelledby='tab-profile' className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
          {/* Identity Card */}
          <div className='lg:col-span-2 space-y-6'>
            <div className='rounded-xl border border-border/80 bg-card/80 p-6 space-y-6 card-3d bevel-shine hover-lift-3d'>
              <div className='flex items-center justify-between gap-4'>
                <div className='flex items-center gap-4'>
                  <div className='size-14 rounded-full bg-gradient-to-br from-[#7778FF] to-[#4CC9F0] text-white font-extrabold text-lg flex items-center justify-center shadow-lg border-2 border-white/20'>
                    {(userName || '?').split(/\s+/).map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h2 className='text-lg font-extrabold text-foreground'>{userName}</h2>
                    <p className='text-xs text-muted-foreground font-mono'>{userEmail}</p>
                    <span className='inline-flex items-center gap-1.5 mt-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#7778FF]/15 text-[#7778FF] border border-[#7778FF]/30 shadow-xs'>
                      {language === 'id' ? 'Akun terverifikasi' : 'Verified account'}
                    </span>
                  </div>
                </div>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => {
                    setTempName(userName === '—' ? '' : userName)
                    setProfileError('')
                    setEditProfileOpen(true)
                  }}
                  className='h-8 text-xs font-semibold border-border bg-card hover:bg-muted interactive-press'
                >
                  {language === 'id' ? 'Ubah profil' : 'Edit profile'}
                </Button>
              </div>

              <div className='divide-y divide-border/50 text-sm'>
                <div className='py-3 flex justify-between items-center'>
                  <span className='text-muted-foreground flex items-center gap-2'>
                    <Building className='size-4 text-muted-foreground' />
                    {language === 'id' ? 'Organisasi' : 'Organization'}
                  </span>
                  <span className='font-bold text-foreground'>{emailDomain ?? '—'}</span>
                </div>
                <div className='py-3 flex justify-between items-center'>
                  <span className='text-muted-foreground flex items-center gap-2'>
                    <Shield className='size-4 text-muted-foreground' />
                    {language === 'id' ? 'Domain Terikat' : 'Bound Domains'}
                  </span>
                  <span className='font-mono text-xs text-foreground font-bold'>
                    {licenses.find((l: { status?: string | null }) => String(l.status ?? 'active') === 'active')
                      ? (licenses.find((l: { status?: string | null }) => String(l.status ?? 'active') === 'active') as { id?: string }).id
                      : '—'}
                  </span>
                </div>
                <div className='py-3 flex justify-between items-center'>
                  <span className='text-muted-foreground flex items-center gap-2'>
                    <KeyRound className='size-4 text-muted-foreground' />
                    {language === 'id' ? 'Paket Aktif' : 'Active Plan'}
                  </span>
                  <span className='font-bold text-foreground'>
                    {activeLicense
                      ? `${String((activeLicense as { planKey?: string | null }).planKey ?? '—')} · ${quotaLimit != null ? `${quotaLimit.toLocaleString('id-ID')} token` : 'tanpa batas kuota AI'}`
                      : '—'}
                  </span>
                </div>
                <div className='py-3 flex justify-between items-center'>
                  <span className='text-muted-foreground flex items-center gap-2'>
                    <Lock className='size-4 text-muted-foreground' />
                    {language === 'id' ? 'Keamanan Sesi' : 'Session Security'}
                  </span>
                  <span className='inline-flex items-center gap-1 text-xs text-emerald-500 font-bold'>
                    <CheckCircle2 className='size-3.5' /> HTTP-only Cookie (SameSite=Strict)
                  </span>
                </div>
              </div>
            </div>

            {/* Danger Zone / Log out */}
            <div className='rounded-xl border border-destructive/40 bg-destructive/[0.04] p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 card-3d'>
              <div>
                <h3 className='text-sm font-bold text-foreground'>
                  {language === 'id' ? 'Keluar dari Sesi' : 'Sign Out of Session'}
                </h3>
                <p className='text-xs text-muted-foreground mt-0.5'>
                  {language === 'id'
                    ? 'Sesi browser Anda akan dihentikan dan cookie autentikasi akan dihapus.'
                    : 'Your active browser session will end and authentication cookies will be cleared.'}
                </p>
              </div>
              <Button
                variant='outline'
                className='text-destructive border-destructive/40 hover:bg-destructive/15 hover:text-destructive font-bold interactive-press'
                onClick={() => setSignOutOpen(true)}
              >
                <LogOut className='size-4 mr-2' />
                {language === 'id' ? 'Keluar dari akun' : 'Sign out of account'}
              </Button>
            </div>
          </div>

          {/* Quick Stats sidebar */}
          <div className='space-y-6'>
            <div className='rounded-xl border border-border/80 bg-card/80 p-5 space-y-4 card-3d bevel-shine'>
              <h3 className='text-xs font-bold tracking-wider text-muted-foreground uppercase'>
                {language === 'id' ? 'RINGKASAN LISENSI' : 'LICENSE SUMMARY'}
              </h3>
              <div className='space-y-3 text-sm'>
                <div className='flex justify-between items-center'>
                  <span className='text-muted-foreground'>{language === 'id' ? 'Status' : 'Status'}</span>
                  <span className={`font-bold text-xs flex items-center gap-1.5 ${activeLicense ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                    <span className={`size-2 rounded-full ${activeLicense ? 'bg-emerald-500 shadow-[0_0_6px_#39D6A0]' : 'bg-muted-foreground/50'}`} />
                    {activeLicense ? (language === 'id' ? 'Aktif' : 'Active') : (language === 'id' ? 'Tidak ada lisensi' : 'No license')}
                  </span>
                </div>
                <div className='flex justify-between items-center'>
                  <span className='text-muted-foreground'>{language === 'id' ? 'Sisa Kuota' : 'Remaining Quota'}</span>
                  <span className='font-mono font-bold text-foreground'>
                    {quotaPercent != null
                      ? `${100 - quotaPercent}% (${(Math.max(0, (quotaLimit ?? 0) - usedTokens)).toLocaleString('id-ID')})`
                      : quotaLimit == null && activeLicense
                        ? '∞'
                        : '—'}
                  </span>
                </div>
                <div className='flex justify-between items-center'>
                  <span className='text-muted-foreground'>{language === 'id' ? 'Berlaku Hingga' : 'Valid Until'}</span>
                  <span className='text-xs font-mono font-bold text-foreground'>
                    {activeExpiresAt
                      ? new Date(activeExpiresAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
                      : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* System States Reference Showcase (Moda page-72..75 1:1) */}
      {activeTab === 'states' && (
        <div className='space-y-6'>
          <div>
            <h2 className='text-xl font-bold text-foreground'>
              {t('states_title')}
            </h2>
            <p className='text-sm text-muted-foreground mt-1'>
              {t('states_sub')}
            </p>
          </div>

          {/* Top 3 Bento Cards Row */}
          <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
            {/* Card 1: MEMUAT · SKELETON with animated shimmer sweep */}
            <div className='rounded-xl border border-border/80 bg-card/80 p-6 flex flex-col justify-between h-[360px] card-3d bevel-shine hover-lift-3d'>
              <div className='space-y-5'>
                <div className='text-[11px] font-bold tracking-wider text-muted-foreground uppercase'>
                  {t('states_loading_skeleton')}
                </div>
                <div className='space-y-3 animate-pulse'>
                  <div className='h-4 bg-muted/70 rounded-md w-full' />
                  <div className='h-10 bg-muted/50 rounded-lg w-full' />
                  <div className='grid grid-cols-3 gap-2 pt-2'>
                    <div className='h-3 bg-muted/60 rounded' />
                    <div className='h-3 bg-muted/50 rounded col-span-2' />
                    <div className='h-3 bg-muted/60 rounded' />
                    <div className='h-3 bg-muted/50 rounded col-span-2' />
                    <div className='h-3 bg-muted/60 rounded' />
                    <div className='h-3 bg-muted/50 rounded col-span-2' />
                  </div>
                </div>
              </div>
              <div className='text-xs text-muted-foreground/80 pt-4 border-t border-border/40 font-mono'>
                {t('states_shimmer_note')}
              </div>
            </div>

            {/* Card 2: KOSONG · ONBOARDING with Floating 3D Standalone Hub */}
            <div className='rounded-xl border border-border/80 bg-card/80 p-6 flex flex-col items-center justify-center text-center h-[360px] card-3d bevel-shine hover-lift-3d relative overflow-hidden'>
              <div className='text-[11px] font-bold tracking-wider text-muted-foreground uppercase self-start mb-auto'>
                {t('states_empty_onboarding')}
              </div>
              <div className='my-auto flex flex-col items-center relative z-10'>
                <img
                  src='/app/images/grouter-hub-standalone.png'
                  alt='gRouter Hub'
                  className='size-24 object-contain drop-shadow-xl mb-3'
                />
                <h3 className='text-base font-extrabold text-foreground'>
                  {t('states_no_requests')}
                </h3>
                <p className='text-xs text-muted-foreground max-w-[240px] mt-1 mb-4 leading-relaxed'>
                  {t('states_send_first_conv')}
                </p>
                <Button
                  size='sm'
                  className='bg-[#7778FF] hover:bg-[#8F90FF] text-white text-xs h-9 px-4 font-bold shadow-md hover:shadow-[0_0_15px_rgba(119,120,255,0.4)] interactive-press'
                >
                  {t('states_view_test_guide')}
                </Button>
              </div>
              <div className='h-4' />
            </div>

            {/* Card 3: ERROR · PEMULIHAN */}
            <div className='rounded-xl border border-border/70 bg-card p-6 flex flex-col justify-between h-[360px]'>
              <div className='space-y-4'>
                <div className='text-[11px] font-semibold tracking-wider text-muted-foreground uppercase'>
                  {t('states_error_recovery')}
                </div>
                {/* Alert Box */}
                <div className='rounded-lg border border-red-500/30 bg-red-500/[0.05] p-3.5 space-y-1 text-xs'>
                  <div className='flex items-center gap-2 text-red-500 font-semibold'>
                    <AlertTriangle className='size-4 shrink-0' />
                    <span>{t('states_failed_ledger')}</span>
                  </div>
                  <p className='text-muted-foreground pl-6 text-[11px] leading-relaxed'>
                    {t('states_server_502')}
                  </p>
                </div>

                {/* Actions */}
                <div className='flex items-center gap-3 pt-1'>
                  <Button
                    variant='outline'
                    size='sm'
                    className='text-xs h-8 gap-1.5 font-medium'
                  >
                    <RotateCw className='size-3.5' />
                    {t('states_try_again')}
                  </Button>
                  <a
                    href='#status'
                    className='text-xs text-[#7778FF] hover:underline font-medium'
                  >
                    {t('states_view_service_status')}
                  </a>
                </div>
              </div>

              {/* Unavailable note */}
              <div className='space-y-2 pt-4 border-t border-border/40'>
                <div className='text-[10px] font-semibold tracking-wider text-muted-foreground uppercase'>
                  {t('states_unavailable')}
                </div>
                <div className='rounded-md border border-border/50 bg-secondary/30 p-2.5 flex items-center gap-2 text-xs text-muted-foreground'>
                  <Lock className='size-3.5 shrink-0' />
                  <span>{t('states_token_rotation_unsupported')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom 3 Bento Cards Row */}
          <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
            {/* Card 4: TOAST */}
            <div className='rounded-xl border border-border/70 bg-card p-6 space-y-4'>
              <div className='text-[11px] font-semibold tracking-wider text-muted-foreground uppercase'>
                {t('states_toast_section')}
              </div>
              <div className='space-y-2.5'>
                <div className='rounded-lg border border-emerald-500/30 bg-card shadow-md p-3 flex items-center justify-between text-xs'>
                  <div className='flex items-center gap-2 text-foreground font-medium'>
                    <CheckCircle2 className='size-4 text-emerald-500' />
                    <span>{t('states_toast_saved')}</span>
                  </div>
                  <button className='text-xs text-[#7778FF] font-semibold hover:underline'>
                    {t('states_toast_undo')}
                  </button>
                </div>

                <div className='rounded-lg border border-red-500/30 bg-card shadow-md p-3 flex items-center justify-between text-xs'>
                  <div className='flex items-center gap-2 text-foreground font-medium'>
                    <XCircle className='size-4 text-red-500' />
                    <span>{t('states_toast_verify_failed')}</span>
                  </div>
                  <button className='text-xs text-[#7778FF] font-semibold hover:underline'>
                    {t('states_toast_retry')}
                  </button>
                </div>
              </div>
            </div>

            {/* Card 5: TOOLTIP GRAFIK */}
            <div className='rounded-xl border border-border/70 bg-card p-6 space-y-4'>
              <div className='text-[11px] font-semibold tracking-wider text-muted-foreground uppercase'>
                {t('states_chart_tooltip')}
              </div>
              <div className='rounded-lg border border-border/80 bg-secondary/40 p-4 space-y-2 text-xs'>
                <div className='font-semibold text-foreground'>
                  {language === 'id' ? '9 Okt 2026' : '9 Oct 2026'}
                </div>
                <div className='flex justify-between items-center'>
                  <span className='flex items-center gap-1.5 text-muted-foreground'>
                    <span className='size-2 rounded-full bg-[#7778FF]' />
                    ok
                  </span>
                  <span className='font-mono font-semibold tabular-nums text-foreground'>
                    3.050
                  </span>
                </div>
                <div className='flex justify-between items-center'>
                  <span className='flex items-center gap-1.5 text-muted-foreground'>
                    <span className='size-2 rounded-full bg-[#FF667A]' />
                    {language === 'id' ? 'ditolak' : 'rejected'}
                  </span>
                  <span className='font-mono font-semibold tabular-nums text-foreground'>
                    290
                  </span>
                </div>
              </div>
            </div>

            {/* Card 6: FOKUS KEYBOARD */}
            <div className='rounded-xl border border-border/70 bg-card p-6 space-y-4'>
              <div className='text-[11px] font-semibold tracking-wider text-muted-foreground uppercase'>
                {t('states_keyboard_focus')}
              </div>
              <div className='space-y-3 text-xs'>
                <button
                  type='button'
                  className='px-4 py-2 rounded-lg bg-card border border-border text-foreground font-medium focus:ring-2 focus:ring-[#7778FF] focus:ring-offset-2 focus:outline-none transition-all'
                >
                  Tab → fokus
                </button>
                <p className='text-muted-foreground leading-relaxed'>
                  {language === 'id'
                    ? 'Ring 2px aksen, offset 2px · kontras ≥ 3:1. Skip-link, urutan tab sesuai visual, dialog menjebak fokus dan Esc menutup.'
                    : '2px accent ring, 2px offset · contrast ≥ 3:1. Skip-link, visual tab order, dialogs trap focus and Esc closes.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile Dialog */}
      <Dialog open={editProfileOpen} onOpenChange={setEditProfileOpen}>
        <DialogContent className='sm:max-w-md border-border bg-card/95 backdrop-blur-xl shadow-2xl'>
          <DialogHeader>
            <DialogTitle className='text-base font-bold text-foreground'>
              {language === 'id' ? 'Ubah Profil Pengguna' : 'Edit User Profile'}
            </DialogTitle>
            <DialogDescription className='text-xs text-muted-foreground'>
              {language === 'id'
                ? 'Perbarui nama tampilan dan kontak organisasi Anda.'
                : 'Update your display name and organization contact email.'}
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={async (e) => {
              e.preventDefault()
              if (!tempName.trim()) return
              setProfileSaving(true)
              setProfileError('')
              try {
                // Simpan ke server (Better Auth update-user) — bukan sekadar state lokal.
                const res = await fetch('/api/auth/update-user', {
                  method: 'POST',
                  credentials: 'include',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: tempName.trim() }),
                })
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                await qc.invalidateQueries({ queryKey: ['me'] })
                setProfileSuccess(true)
                setTimeout(() => {
                  setProfileSuccess(false)
                  setEditProfileOpen(false)
                }, 900)
              } catch (err) {
                setProfileError(err instanceof Error ? err.message : 'gagal menyimpan')
              } finally {
                setProfileSaving(false)
              }
            }}
            className='space-y-4 py-2'
          >
            <div className='space-y-1.5'>
              <Label htmlFor='account-name' className='text-xs font-semibold'>
                {language === 'id' ? 'Nama Lengkap' : 'Full Name'}
              </Label>
              <Input
                id='account-name'
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                required
                className='text-xs'
                placeholder='Nama pengguna'
              />
            </div>

            <div className='space-y-1.5'>
              <Label htmlFor='account-email' className='text-xs font-semibold'>
                Email
              </Label>
              <Input
                id='account-email'
                type='email'
                value={userEmail}
                disabled
                className='text-xs opacity-70'
              />
              <p className='text-[11px] text-muted-foreground'>
                {language === 'id'
                  ? 'Email tidak dapat diubah (terikat sesi login server).'
                  : 'Email cannot be changed (bound to the server session).'}
              </p>
            </div>

            {profileError && (
              <div className='flex items-center gap-2 p-2 rounded-lg bg-destructive/15 text-destructive text-xs font-semibold'>
                <XCircle className='size-4' />
                <span>
                  {language === 'id' ? 'Gagal menyimpan: ' : 'Save failed: '}
                  {profileError}
                </span>
              </div>
            )}

            {profileSuccess && (
              <div className='flex items-center gap-2 p-2 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-semibold'>
                <CheckCircle2 className='size-4' />
                <span>{language === 'id' ? 'Profil berhasil diperbarui!' : 'Profile updated successfully!'}</span>
              </div>
            )}

            <DialogFooter className='pt-2 gap-2'>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => setEditProfileOpen(false)}
                className='text-xs'
              >
                {language === 'id' ? 'Batal' : 'Cancel'}
              </Button>
              <Button
                type='submit'
                size='sm'
                className='bg-[#7778FF] hover:bg-[#8F90FF] text-white text-xs font-bold interactive-press'
              >
                {language === 'id' ? 'Simpan' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
    </div>
  )
}
