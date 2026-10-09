import { useLayout } from '@/context/layout-provider'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'
import { buildSidebarData } from './data/sidebar-data'
import { NavGroup } from './nav-group'
import { NavUser } from './nav-user'
import { useMe } from '@/features/shared/use-me'

export function AppSidebar() {
  const { collapsible, variant } = useLayout()
  const isAdmin = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')
  const { data } = useMe(!isAdmin)
  const sidebarData = buildSidebarData(
    isAdmin,
    data && 'account' in data
      ? { name: data.account.name, email: data.account.email }
      : undefined,
  )

  return (
    <Sidebar collapsible={collapsible} variant={variant} role='complementary' aria-label='Navigasi utama'>
      <SidebarHeader>
        <div className='flex items-center gap-2 px-2 py-1.5'>
          <div className='flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-sm'>
            gR
          </div>
          <div className='grid flex-1 text-left leading-tight'>
            <span className='truncate font-semibold text-sm'>
              {isAdmin ? 'Copilot Admin' : 'Copilot'}
            </span>
            <span className='truncate text-xs text-muted-foreground'>
              gRouter Copilot
            </span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {sidebarData.navGroups.map((props) => (
          <NavGroup key={props.title} {...props} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={sidebarData.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
