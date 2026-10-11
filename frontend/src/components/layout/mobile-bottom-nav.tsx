import { useRouterState, Link } from '@tanstack/react-router'
import { Home, KeyRound, LineChart, CreditCard } from 'lucide-react'
import { useLanguage } from '@/context/language-provider'
import { cn } from '@/lib/utils'

// Moda page-80..83: Mobile Bottom Navigation Bar for Customer
export function MobileBottomNav() {
  const routerState = useRouterState()
  const pathname = routerState.location.pathname
  const { language, t } = useLanguage()

  // Only render for customer routes, and only on mobile screens (< 768px)
  if (pathname.startsWith('/admin')) {
    return null
  }

  const navItems = [
    {
      title: language === 'id' ? 'Ringkasan' : 'Overview',
      url: '/user',
      icon: Home,
      isActive: pathname === '/user' || pathname === '/user/',
    },
    {
      title: language === 'id' ? 'Lisensi' : 'Licenses',
      url: '/user/install',
      icon: KeyRound,
      isActive: pathname.startsWith('/user/install'),
    },
    {
      title: language === 'id' ? 'Penggunaan' : 'Usage',
      url: '/user/usage',
      icon: LineChart,
      isActive: pathname.startsWith('/user/usage'),
    },
    {
      title: language === 'id' ? 'Tagihan' : 'Billing',
      url: '/user/orders',
      icon: CreditCard,
      isActive: pathname.startsWith('/user/orders') || pathname.startsWith('/user/payments'),
    },
  ]

  return (
    <nav
      className='fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t border-border/80 bg-card/95 backdrop-blur-md px-2 md:hidden'
      aria-label='Navigasi mobile'
    >
      {navItems.map((item) => {
        const Icon = item.icon
        return (
          <Link
            key={item.url}
            to={item.url}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-1 py-1 text-[11px] transition-colors',
              item.isActive
                ? 'font-bold text-[#7778FF]'
                : 'font-normal text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className={cn('size-5', item.isActive && 'text-[#7778FF]')} />
            <span>{item.title}</span>
          </Link>
        )
      })}
    </nav>
  )
}
