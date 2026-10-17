import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouterState } from '@tanstack/react-router'
import {
  Sun,
  Moon,
  Bell,
  HelpCircle,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  Inbox,
} from 'lucide-react'
import {
  fetchAdminNotifications,
  fetchMyNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
  markMyNotificationRead,
  markAllMyNotificationsRead,
  type AppNotification,
} from '@/lib/grouter-api'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-provider'
import { useTheme } from '@/context/theme-provider'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useMe } from '@/features/shared/use-me'

export function ModaHeader() {
  const routerState = useRouterState()
  const pathname = routerState.location.pathname
  const { resolvedTheme, setTheme } = useTheme()
  const { language, setLanguage, t } = useLanguage()
  const [notifOpen, setNotifOpen] = useState(false)
  const bellRef = useRef<HTMLButtonElement>(null)

  const isAdmin = pathname.startsWith('/admin')
  // Admin console tidak punya sesi customer (/api/me = 401) — JANGAN fetch /api/me
  // di area admin: useMe me-redirect ke /login pada 401 (memutus halaman admin).
  useMe(!isAdmin)

  // Dynamic Breadcrumb resolver matching Moda 1:1
  const getBreadcrumb = () => {
    if (pathname.startsWith('/admin')) {
      const prefix = 'Admin'
      if (pathname.includes('/licenses') && pathname.split('/').length > 3) {
        return `${prefix} / ${t('nav_licenses')} / Detail`
      }
      if (pathname.includes('/licenses'))
        return `${prefix} / ${t('nav_licenses')}`
      if (pathname.includes('/orders')) return `${prefix} / ${t('nav_orders')}`
      if (pathname.includes('/packages'))
        return `${prefix} / ${t('nav_plans_policy')}`
      if (pathname.includes('/ledger')) return `${prefix} / ${t('nav_ledger')}`
      if (pathname.includes('/usage')) return `${prefix} / ${t('nav_usage')}`
      if (pathname.includes('/settings'))
        return `${prefix} / ${t('nav_settings')}`
      return `${prefix} / ${t('nav_overview')}`
    } else {
      const prefix = language === 'id' ? 'Workspace' : 'Workspace'
      const billingPrefix = language === 'id' ? 'Tagihan' : 'Billing'
      const accountPrefix = language === 'id' ? 'Akun' : 'Account'

      if (pathname.includes('/install'))
        return `${prefix} / ${t('nav_user_install')}`
      if (pathname.includes('/licenses'))
        return `${prefix} / ${t('nav_user_install')}`
      if (pathname.includes('/usage'))
        return `${prefix} / ${t('nav_user_usage')}`
      if (pathname.includes('/orders'))
        return `${billingPrefix} / ${t('nav_user_plans')}`
      if (pathname.includes('/payments'))
        return `${billingPrefix} / ${t('nav_user_orders')}`
      if (pathname.includes('/account'))
        return `${accountPrefix} / ${language === 'id' ? 'Profil & keamanan' : 'Profile & security'}`
      return `${prefix} / ${t('nav_overview')}`
    }
  }

  // Notifikasi dari event store NYATA — durable, per-akun, idempotent.
  // Customer: /api/me/notifications (hanya di luar area admin — area admin
  // TIDAK punya sesi customer dan tidak boleh memanggil /api/me).
  // Admin: /api/admin/notifications (hanya di area admin).
  const queryClient = useQueryClient()
  const customerNotifQ = useQuery({
    queryKey: ['me-notifications'],
    queryFn: () => fetchMyNotifications(20),
    enabled: !isAdmin,
    refetchInterval: 60_000,
  })
  const adminNotifQ = useQuery({
    queryKey: ['admin-notifications'],
    queryFn: () => fetchAdminNotifications(20),
    enabled: isAdmin,
    refetchInterval: 60_000,
  })
  const notifQ = isAdmin ? adminNotifQ : customerNotifQ
  const markAllRead = useMutation({
    mutationFn: isAdmin
      ? markAllAdminNotificationsRead
      : markAllMyNotificationsRead,
    onSuccess: () => notifQ.refetch(),
  })
  const markNotificationRead = useMutation({
    mutationFn: (id: string) =>
      isAdmin ? markAdminNotificationRead(id) : markMyNotificationRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: isAdmin ? ['admin-notifications'] : ['me-notifications'],
      })
    },
  })
  const notificationHref = (n: AppNotification): string | null => {
    if (!n.linkKind || !n.linkId) return null
    if (n.linkKind === 'order')
      return isAdmin ? '/admin/orders' : '/user/payments'
    if (n.linkKind === 'license')
      return isAdmin ? '/admin/licenses' : '/user/licenses'
    return null
  }
  const handleNotificationClick = async (n: {
    id: string
    href: string | null
  }) => {
    if (markNotificationRead.isPending) return
    try {
      await markNotificationRead.mutateAsync(n.id)
    } catch {
      // Read-state failure must not trap the operator on this page.
    }
    if (n.href) window.location.assign(n.href)
  }
  const relativeTime = (
    value: number | string | null | undefined,
    nowMs: number
  ): string => {
    if (value === null || value === undefined || value === '') return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    const rtf = new Intl.RelativeTimeFormat(
      language === 'id' ? 'id-ID' : 'en-US',
      { numeric: 'auto' }
    )
    const diffMs = date.getTime() - nowMs
    const absSeconds = Math.abs(diffMs) / 1000
    if (absSeconds < 60) return rtf.format(Math.round(diffMs / 1000), 'second')
    if (absSeconds < 3600)
      return rtf.format(Math.round(diffMs / 60_000), 'minute')
    if (absSeconds < 86_400)
      return rtf.format(Math.round(diffMs / 3_600_000), 'hour')
    if (absSeconds < 604_800)
      return rtf.format(Math.round(diffMs / 86_400_000), 'day')
    return date.toLocaleString(language === 'id' ? 'id-ID' : 'en-US', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  const [notifNowMs] = useState(() => Date.now())
  const notifications = (notifQ.data?.notifications ?? []).map((n) => ({
    id: n.id,
    title: language === 'id' ? n.title : n.titleEn,
    desc: language === 'id' ? n.body : n.bodyEn,
    type: n.type,
    readAt: n.readAt,
    time: relativeTime(n.createdAt, notifNowMs),
    icon: n.type.startsWith('license')
      ? ShieldCheck
      : n.type === 'order.pending'
        ? AlertTriangle
        : CheckCircle2,
    color:
      n.type === 'order.pending'
        ? 'text-amber-500'
        : n.type === 'license.revoked'
          ? 'text-[#FF667A]'
          : 'text-[#7778FF]',
    isUnread: n.readAt == null,
    href: notificationHref(n),
  }))
  // Badge integrity: unread comes from the server `unread` field — never
  // from the limited items array (fetch caps at 20). `total` is likewise
  // accepted from the server when present.
  const serverUnread = notifQ.data?.unread
  const unreadNotifications = notifications.filter((n) => n.isUnread)
  const unreadCount =
    typeof serverUnread === 'number' ? serverUnread : unreadNotifications.length
  const hasUnread = unreadCount > 0
  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount)

  return (
    <header className='bevel-shine sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-border/80 bg-background/85 px-4 backdrop-blur-xl transition-colors md:px-6'>
      {/* Left: Sidebar trigger + Breadcrumb */}
      <div className='flex items-center gap-3'>
        <SidebarTrigger
          aria-label={
            language === 'id'
              ? 'Buka atau tutup navigasi'
              : 'Toggle navigation sidebar'
          }
          className='interactive-press size-8 rounded-lg border border-border bg-card/60 p-1.5 text-muted-foreground hover:text-foreground md:hidden'
        />
        <nav
          aria-label='Breadcrumb'
          className='flex items-center text-xs font-medium tracking-tight text-muted-foreground sm:text-sm'
        >
          {getBreadcrumb()}
        </nav>
      </div>

      {/* Right Controls: Theme pill, Language pill, Demo badge, Bell, Help */}
      <div className='flex items-center gap-2 sm:gap-2.5'>
        {/* Theme Segmented Switcher [ 🌙 | ☀️ ] */}
        <div
          className='flex items-center rounded-xl border border-border/80 bg-card/80 p-0.5 shadow-xs'
          role='radiogroup'
          aria-label={language === 'id' ? 'Pilih Tema' : 'Select Theme'}
        >
          <button
            type='button'
            onClick={() => setTheme('dark')}
            className={cn(
              'interactive-press flex size-7 items-center justify-center rounded-lg transition-all',
              resolvedTheme === 'dark'
                ? 'bg-[#7778FF] text-white shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
            title={language === 'id' ? 'Mode Gelap' : 'Dark Mode'}
            aria-label={language === 'id' ? 'Mode Gelap' : 'Dark Mode'}
            aria-checked={resolvedTheme === 'dark'}
            role='radio'
          >
            <Moon className='size-3.5' />
          </button>
          <button
            type='button'
            onClick={() => setTheme('light')}
            className={cn(
              'interactive-press flex size-7 items-center justify-center rounded-lg transition-all',
              resolvedTheme === 'light'
                ? 'bg-[#7778FF] text-white shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
            title={language === 'id' ? 'Mode Terang' : 'Light Mode'}
            aria-label={language === 'id' ? 'Mode Terang' : 'Light Mode'}
            aria-checked={resolvedTheme === 'light'}
            role='radio'
          >
            <Sun className='size-3.5' />
          </button>
        </div>

        {/* Language Segmented Switcher [ ID | EN ] */}
        <div
          className='flex items-center rounded-xl border border-border/80 bg-card/80 p-0.5 shadow-xs'
          role='radiogroup'
          aria-label={language === 'id' ? 'Pilih Bahasa' : 'Select Language'}
        >
          <button
            type='button'
            onClick={() => setLanguage('id')}
            className={cn(
              'interactive-press rounded-lg px-2.5 py-1 text-xs font-bold tracking-wide transition-all',
              language === 'id'
                ? 'bg-[#7778FF] text-white shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
            aria-label='Bahasa Indonesia'
            aria-checked={language === 'id'}
            role='radio'
          >
            ID
          </button>
          <button
            type='button'
            onClick={() => setLanguage('en')}
            className={cn(
              'interactive-press rounded-lg px-2.5 py-1 text-xs font-bold tracking-wide transition-all',
              language === 'en'
                ? 'bg-[#7778FF] text-white shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
            aria-label='English'
            aria-checked={language === 'en'}
            role='radio'
          >
            EN
          </button>
        </div>

        {/* Notification Bell with 3D Dropdown Menu */}
        <DropdownMenu
          open={notifOpen}
          onOpenChange={(open) => {
            setNotifOpen(open)
            if (!open) bellRef.current?.focus()
          }}
        >
          <DropdownMenuTrigger asChild>
            <button
              type='button'
              ref={bellRef}
              className='interactive-press relative flex size-8 items-center justify-center rounded-xl border border-border/80 bg-card/80 text-muted-foreground shadow-xs transition-all hover:bg-muted/60 hover:text-foreground'
              title={language === 'id' ? 'Pemberitahuan' : 'Notifications'}
              aria-label={
                hasUnread
                  ? language === 'id'
                    ? `${badgeLabel} notifikasi belum dibaca`
                    : `${badgeLabel} unread notifications`
                  : language === 'id'
                    ? 'Pemberitahuan'
                    : 'Notifications'
              }
              aria-haspopup='menu'
              aria-expanded={notifOpen}
            >
              <Bell className='size-4' />
              {/* Unread COUNT badge (numeric, both audiences; capped at 99+) */}
              {hasUnread && (
                <span
                  className='absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white'
                  aria-hidden='true'
                >
                  {badgeLabel}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align='end'
            className='card-3d w-[calc(100vw-2rem)] max-w-80 rounded-2xl border border-border/80 bg-card/95 p-0 shadow-2xl backdrop-blur-2xl'
            onCloseAutoFocus={(e) => {
              e.preventDefault()
              bellRef.current?.focus()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setNotifOpen(false)
                bellRef.current?.focus()
              }
            }}
          >
            <div className='flex items-center justify-between border-b border-border/70 p-3.5'>
              <span className='text-xs font-bold text-foreground'>
                {language === 'id' ? 'Pemberitahuan' : 'Notifications'}
              </span>
              {hasUnread && (
                <button
                  type='button'
                  onClick={() => markAllRead.mutate()}
                  disabled={markAllRead.isPending}
                  className='text-[10px] font-semibold text-[#7778FF] hover:underline'
                >
                  {language === 'id' ? 'Tandai semua dibaca' : 'Mark all read'}
                </button>
              )}
            </div>
            <div className='max-h-72 divide-y divide-border/50 overflow-y-auto text-xs'>
              {notifQ.isPending ? (
                <div className='space-y-1.5 p-6 text-center' role='status'>
                  <RefreshCw className='mx-auto size-5 animate-spin text-muted-foreground/60' />
                  <p className='text-[11px] text-muted-foreground'>
                    {language === 'id'
                      ? 'Memuat pemberitahuan…'
                      : 'Loading notifications…'}
                  </p>
                </div>
              ) : notifQ.isError ? (
                <div className='space-y-2 p-6 text-center' role='alert'>
                  <AlertTriangle className='mx-auto size-5 text-destructive/70' />
                  <p className='text-[11px] text-muted-foreground'>
                    {isAdmin
                      ? language === 'id'
                        ? 'Gagal memuat pemberitahuan admin.'
                        : 'Failed to load admin notifications.'
                      : language === 'id'
                        ? 'Gagal memuat pemberitahuan.'
                        : 'Failed to load notifications.'}
                  </p>
                  <button
                    type='button'
                    onClick={() => void notifQ.refetch()}
                    className='text-[11px] font-semibold text-[#7778FF] hover:underline focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none'
                  >
                    {language === 'id' ? 'Coba lagi' : 'Retry'}
                  </button>
                </div>
              ) : notifications.length === 0 ? (
                <div className='space-y-1.5 p-6 text-center'>
                  <Inbox className='mx-auto size-5 text-muted-foreground/60' />
                  <p className='text-[11px] text-muted-foreground'>
                    {isAdmin
                      ? language === 'id'
                        ? 'Belum ada pemberitahuan admin.'
                        : 'No admin notifications yet.'
                      : language === 'id'
                        ? 'Belum ada pemberitahuan.'
                        : 'No notifications yet.'}
                  </p>
                </div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    type='button'
                    onClick={() => void handleNotificationClick(n)}
                    disabled={markNotificationRead.isPending}
                    aria-label={
                      language === 'id'
                        ? `${n.title}${n.isUnread ? ' (belum dibaca)' : ''}`
                        : `${n.title}${n.isUnread ? ' (unread)' : ''}`
                    }
                    className={cn(
                      'flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
                      n.isUnread && 'bg-[#7778FF]/[0.04]'
                    )}
                  >
                    <div
                      className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted/60',
                        n.color
                      )}
                    >
                      <n.icon className='size-3.5' />
                    </div>
                    <div className='min-w-0 flex-1 space-y-0.5'>
                      <div className='truncate text-xs font-bold text-foreground'>
                        {n.title}
                      </div>
                      <div className='line-clamp-2 text-[11px] text-muted-foreground'>
                        {n.desc}
                      </div>
                      <div className='pt-0.5 font-mono text-[10px] text-muted-foreground/75'>
                        {n.time}
                      </div>
                    </div>
                    {n.isUnread && (
                      <span className='mt-1.5 size-1.5 shrink-0 rounded-full bg-[#7778FF]' />
                    )}
                  </button>
                ))
              )}
            </div>
            <div className='border-t border-border/70 bg-muted/20 p-2.5 text-center'>
              <a
                href='/user/payments'
                className='block text-[11px] font-semibold text-[#7778FF] hover:underline'
              >
                {language === 'id'
                  ? 'Lihat paket & tagihan'
                  : 'View plans & billing'}
              </a>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Help / Docs */}
        <button
          type='button'
          className='interactive-press flex size-8 items-center justify-center rounded-xl border border-border/80 bg-card/80 text-muted-foreground shadow-xs transition-all hover:bg-muted/60 hover:text-foreground'
          title={
            language === 'id' ? 'Bantuan & Dokumentasi' : 'Help & Documentation'
          }
          aria-label={
            language === 'id' ? 'Bantuan & Dokumentasi' : 'Help & Documentation'
          }
          onClick={() => {
            window.open(
              'https://github.com/andhikanurdyansyah/grouter_copilot#readme',
              '_blank'
            )
          }}
        >
          <HelpCircle className='size-4' />
        </button>
      </div>
    </header>
  )
}
