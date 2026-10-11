import { useState } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { Sun, Moon, Bell, HelpCircle, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react'
import { useTheme } from '@/context/theme-provider'
import { useLanguage } from '@/context/language-provider'
import { SidebarTrigger } from '@/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export function ModaHeader() {
  const routerState = useRouterState()
  const pathname = routerState.location.pathname
  const { resolvedTheme, setTheme } = useTheme()
  const { language, setLanguage, t } = useLanguage()

  // Dynamic Breadcrumb resolver matching Moda 1:1
  const getBreadcrumb = () => {
    if (pathname.startsWith('/admin')) {
      const prefix = 'Admin'
      if (pathname.includes('/licenses') && pathname.split('/').length > 3) {
        return `${prefix} / ${t('nav_licenses')} / Detail`
      }
      if (pathname.includes('/licenses')) return `${prefix} / ${t('nav_licenses')}`
      if (pathname.includes('/orders')) return `${prefix} / ${t('nav_orders')}`
      if (pathname.includes('/packages')) return `${prefix} / ${t('nav_plans_policy')}`
      if (pathname.includes('/ledger')) return `${prefix} / ${t('nav_ledger')}`
      if (pathname.includes('/usage')) return `${prefix} / ${t('nav_usage')}`
      if (pathname.includes('/settings')) return `${prefix} / ${t('nav_settings')}`
      return `${prefix} / ${t('nav_overview')}`
    } else {
      const prefix = language === 'id' ? 'Workspace' : 'Workspace'
      const billingPrefix = language === 'id' ? 'Tagihan' : 'Billing'
      const accountPrefix = language === 'id' ? 'Akun' : 'Account'

      if (pathname.includes('/install')) return `${prefix} / ${t('nav_user_install')}`
      if (pathname.includes('/usage')) return `${prefix} / ${t('nav_user_usage')}`
      if (pathname.includes('/orders')) return `${billingPrefix} / ${t('nav_user_plans')}`
      if (pathname.includes('/payments')) return `${billingPrefix} / ${t('nav_user_orders')}`
      if (pathname.includes('/account')) return `${accountPrefix} / Profil & keamanan`
      return `${prefix} / ${t('nav_overview')}`
    }
  }

  const notifications = [
    {
      title: language === 'id' ? 'Pembayaran QRIS Dikonfirmasi' : 'QRIS Payment Confirmed',
      desc: 'Pro · 30 hari · ord_9QX2...T4',
      time: '12m lalu',
      icon: CheckCircle2,
      color: 'text-emerald-500',
    },
    {
      title: language === 'id' ? 'Peringatan Kuota 80%' : 'Quota 80% Warning',
      desc: 'PT Maju Digital · 1.600.000 / 2.000.000',
      time: '1j lalu',
      icon: AlertTriangle,
      color: 'text-amber-500',
    },
    {
      title: language === 'id' ? 'Lisensi Diterbitkan' : 'License Issued',
      desc: 'GRC-7F2A...91D · Ed25519',
      time: '3j lalu',
      icon: ShieldCheck,
      color: 'text-[#7778FF]',
    },
  ]

  const [unreadNotifications] = useState(notifications)
  const [hasUnread, setHasUnread] = useState(true)

  return (
    <header className='sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-border/80 bg-background/85 px-4 md:px-6 backdrop-blur-xl bevel-shine transition-colors'>
      {/* Left: Sidebar trigger + Breadcrumb */}
      <div className='flex items-center gap-3'>
        <SidebarTrigger
          aria-label={language === 'id' ? 'Buka atau tutup navigasi' : 'Toggle navigation sidebar'}
          className='size-8 rounded-lg border border-border bg-card/60 p-1.5 text-muted-foreground hover:text-foreground md:hidden interactive-press'
        />
        <nav aria-label='Breadcrumb' className='flex items-center text-xs sm:text-sm font-medium text-muted-foreground tracking-tight'>
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
              'flex size-7 items-center justify-center rounded-lg transition-all interactive-press',
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
              'flex size-7 items-center justify-center rounded-lg transition-all interactive-press',
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
              'px-2.5 py-1 text-xs font-bold rounded-lg transition-all tracking-wide interactive-press',
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
              'px-2.5 py-1 text-xs font-bold rounded-lg transition-all tracking-wide interactive-press',
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

        {/* Data Demo badge with pulsing radar indicator */}
        <div className='hidden sm:flex items-center gap-2 rounded-xl border border-border/80 bg-card/70 px-3 py-1 text-xs font-semibold text-muted-foreground shadow-2xs'>
          <span className='relative flex size-2'>
            <span className='animate-radar-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75' />
            <span className='relative inline-flex rounded-full size-2 bg-emerald-500' />
          </span>
          <span>{t('demo_data')}</span>
        </div>

        {/* Notification Bell with 3D Dropdown Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type='button'
              className='relative flex size-8 items-center justify-center rounded-xl border border-border/80 bg-card/80 text-muted-foreground transition-all hover:text-foreground hover:bg-muted/60 interactive-press shadow-xs'
              title={language === 'id' ? 'Pemberitahuan' : 'Notifications'}
              aria-label={language === 'id' ? `Pemberitahuan (${hasUnread ? unreadNotifications.length : 0} baru)` : `Notifications (${hasUnread ? unreadNotifications.length : 0} new)`}
            >
              <Bell className='size-4' />
              {/* Unread indicator */}
              {hasUnread && (
                <span className='absolute top-1.5 right-1.5 flex size-2'>
                  <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75' />
                  <span className='relative inline-flex rounded-full size-2 bg-amber-500' />
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-80 p-0 border border-border/80 bg-card/95 backdrop-blur-2xl shadow-2xl rounded-2xl card-3d'>
            <div className='p-3.5 border-b border-border/70 flex items-center justify-between'>
              <span className='font-bold text-xs text-foreground'>
                {language === 'id' ? 'Pemberitahuan' : 'Notifications'}
              </span>
              <span className='text-[10px] text-muted-foreground font-mono'>
                {hasUnread ? `${unreadNotifications.length} ${language === 'id' ? 'baru' : 'new'}` : (language === 'id' ? 'Semua dibaca' : 'All read')}
              </span>
            </div>
            <div className='divide-y divide-border/50 max-h-72 overflow-y-auto text-xs'>
              {unreadNotifications.map((n, i) => {
                const Icon = n.icon
                return (
                  <div key={i} className='p-3 hover:bg-muted/40 transition-colors flex items-start gap-3 cursor-pointer'>
                    <div className={cn('size-7 rounded-lg bg-muted/60 flex items-center justify-center shrink-0', n.color)}>
                      <Icon className='size-3.5' />
                    </div>
                    <div className='space-y-0.5 flex-1 min-w-0'>
                      <div className='font-bold text-foreground text-xs truncate'>{n.title}</div>
                      <div className='text-muted-foreground text-[11px] truncate'>{n.desc}</div>
                      <div className='text-[10px] text-muted-foreground/75 font-mono pt-0.5'>{n.time}</div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className='p-2.5 border-t border-border/70 text-center bg-muted/20'>
              <button
                type='button'
                onClick={() => setHasUnread(false)}
                className='text-[11px] text-[#7778FF] font-semibold hover:underline cursor-pointer bg-transparent border-0'
              >
                {language === 'id' ? 'Tandai semua dibaca' : 'Mark all as read'}
              </button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Help / Docs */}
        <button
          type='button'
          className='flex size-8 items-center justify-center rounded-xl border border-border/80 bg-card/80 text-muted-foreground transition-all hover:text-foreground hover:bg-muted/60 interactive-press shadow-xs'
          title={language === 'id' ? 'Bantuan & Dokumentasi' : 'Help & Documentation'}
          aria-label={language === 'id' ? 'Bantuan & Dokumentasi' : 'Help & Documentation'}
          onClick={() => {
            window.open('https://github.com/andhikanurdyansyah/grouter_copilot#readme', '_blank')
          }}
        >
          <HelpCircle className='size-4' />
        </button>
      </div>
    </header>
  )
}
