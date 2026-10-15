import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { TopNav } from '@/components/layout/top-nav'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { Analytics } from './components/analytics'
import { Overview } from './components/overview'
import { RecentSales } from './components/recent-sales'
import { useLanguage } from '@/context/language-provider'
import { useQuery } from '@tanstack/react-query'
import { fetchLedger } from '@/lib/grouter-api'

export function Dashboard() {
  const { language } = useLanguage()
  const isId = language === 'id'
  const ledger = useQuery({ queryKey: ['dashboard-summary-ledger'], queryFn: () => fetchLedger({ limit: 200 }) })
  const recentCount = ledger.data?.records?.length ?? 0
  const totalTokens = ((ledger.data?.records ?? []) as Array<{ totalTokens?: number | null; inputTokens?: number | null; outputTokens?: number | null }>).reduce((sum, record) => sum + (record.totalTokens ?? (record.inputTokens ?? 0) + (record.outputTokens ?? 0)), 0)
  const summaryCards = [
    { title: isId ? 'Token diproses' : 'Tokens processed', value: totalTokens.toLocaleString('id-ID') },
    { title: isId ? 'Aktivitas ledger' : 'Ledger records', value: recentCount.toLocaleString('id-ID') },
    { title: isId ? 'Permintaan berhasil' : 'Successful requests', value: ((ledger.data?.records ?? []) as Array<{ status?: string }>).filter((r) => r.status === 'ok').length.toLocaleString('id-ID') },
  ]
  return (
    <>
      {/* ===== Top Heading ===== */}
      <Header>
        <TopNav links={topNav} className='me-auto' />
        <Search />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>

      {/* ===== Main ===== */}
      <Main>
        <div className='mb-2 flex items-center justify-between space-y-2'>
          <h1 className='text-2xl font-bold tracking-tight'>{isId ? 'Ringkasan' : 'Dashboard'}</h1>
          <div className='flex items-center space-x-2'>
            <Button>Download</Button>
          </div>
        </div>
        <Tabs
          orientation='vertical'
          defaultValue='overview'
          className='space-y-4'
        >
          <div className='w-full overflow-x-auto pb-2'>
            <TabsList>
              <TabsTrigger value='overview'>Overview</TabsTrigger>
              <TabsTrigger value='analytics'>Analytics</TabsTrigger>
              <TabsTrigger value='reports' disabled>
                Reports
              </TabsTrigger>
              <TabsTrigger value='notifications' disabled>
                Notifications
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value='overview' className='space-y-4'>
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
              {summaryCards.map((card) => (
                <Card key={card.title}>
                  <CardHeader className='pb-2'><CardTitle className='text-sm font-medium'>{card.title}</CardTitle></CardHeader>
                  <CardContent><div className='text-2xl font-bold font-mono tabular-nums'>{ledger.isLoading ? '…' : card.value}</div></CardContent>
                </Card>
              ))}
            </div>
            <div className='grid grid-cols-1 gap-4 lg:grid-cols-7'>
              <Card className='col-span-1 lg:col-span-4'>
                <CardHeader>
                  <CardTitle>Overview</CardTitle>
                </CardHeader>
                <CardContent className='ps-2'>
                  <Overview />
                </CardContent>
              </Card>
              <Card className='col-span-1 lg:col-span-3'>
                <CardHeader>
                  <CardTitle>{isId ? 'Aktivitas ledger' : 'Ledger activity'}</CardTitle>
                  <CardDescription>
                    {isId ? 'Aktivitas penggunaan terbaru dari ledger nyata.' : `Latest usage activity from the real ledger (${recentCount} records).`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <RecentSales />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          <TabsContent value='analytics' className='space-y-4'>
            <Analytics />
          </TabsContent>
        </Tabs>
      </Main>
    </>
  )
}

const topNav = [
  {
    title: 'Overview',
    href: 'dashboard/overview',
    isActive: true,
    disabled: false,
  },
  {
    title: 'Customers',
    href: 'dashboard/customers',
    isActive: false,
    disabled: true,
  },
  {
    title: 'Products',
    href: 'dashboard/products',
    isActive: false,
    disabled: true,
  },
  {
    title: 'Settings',
    href: 'dashboard/settings',
    isActive: false,
    disabled: true,
  },
]
