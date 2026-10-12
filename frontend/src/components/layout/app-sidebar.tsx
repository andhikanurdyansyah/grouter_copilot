import { useState } from 'react'
import { useLocation, Link } from '@tanstack/react-router'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'
import { useLayout } from '@/context/layout-provider'
import { useLanguage } from '@/context/language-provider'
import { buildSidebarData } from './data/sidebar-data'
import { NavGroup } from './nav-group'
import { useMe } from '@/features/shared/use-me'
import {
  Search,
  ChevronsUpDown,
  HelpCircle,
  MoreVertical,
  User,
  LogOut,
  KeyRound,
  Settings,
  Check,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SignOutDialog } from '@/components/sign-out-dialog'
import { ChangePasswordDialog } from '@/components/change-password-dialog'

export function AppSidebar() {
  const { collapsible, variant } = useLayout()
  const { language, t } = useLanguage()
  const location = useLocation()
  const isAdmin = location.pathname.startsWith('/admin')
  const { data } = useMe(!isAdmin)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const [changePwOpen, setChangePwOpen] = useState(false)
  // Organisasi = domain email akun (data sesi server) — tanpa daftar organisasi mock.
  const accountEmail = data && 'account' in data ? data.account.email : null
  const orgName = accountEmail?.includes('@') ? accountEmail.split('@')[1] : null
  const orgInitials = (orgName ?? '?').slice(0, 2).toUpperCase()

  const sidebarData = buildSidebarData(
    isAdmin,
    language,
    data && 'account' in data
      ? { name: data.account.name, email: data.account.email }
      : undefined
  )

  return (
    <>
      <Sidebar
        collapsible={collapsible}
        variant={variant}
        role='complementary'
        aria-label='Navigasi utama'
        className='border-r border-border/80 bg-sidebar transition-colors'
      >
        <SidebarHeader className='p-3 pb-2 space-y-3'>
          {/* Top Brand Header with 3D Logo */}
          <Link
            to={isAdmin ? '/admin' : '/user'}
            className='flex items-center gap-2.5 px-1 py-1 group cursor-pointer text-inherit no-underline'
            aria-label='gRouter Copilot'
          >
            <div className='relative shrink-0'>
              <img
                src='/app/images/grouter-logo-64.png'
                alt='gRouter'
                className='size-8 rounded-lg object-contain shadow-md group-hover:scale-105 transition-transform duration-300'
              />
              <div className='absolute -inset-1 rounded-lg bg-[#7778FF]/20 blur-xs opacity-0 group-hover:opacity-100 transition-opacity -z-10' />
            </div>
            <div className='grid flex-1 text-left leading-tight'>
              <span className='truncate font-extrabold text-sm tracking-tight text-foreground'>
                gRouter Copilot
              </span>
              {isAdmin && (
                <span className='truncate text-[11px] text-muted-foreground font-mono'>
                  {t('operator_console')}
                </span>
              )}
            </div>
          </Link>

          {/* Admin Search Bar / Customer Team Switcher */}
          {isAdmin ? (
            <div className='relative flex items-center w-full'>
              <Search className='size-3.5 absolute left-2.5 text-muted-foreground pointer-events-none' />
              <input
                type='text'
                aria-label={t('search_placeholder')}
                placeholder={t('search_placeholder')}
                className='w-full rounded-xl border border-border/80 bg-card/70 pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground transition-all focus:outline-hidden focus:ring-1 focus:ring-primary shadow-xs'
              />
            </div>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div
                  role='button'
                  tabIndex={0}
                  aria-label='Pilih Tim / Organisasi'
                  className='flex items-center gap-2.5 rounded-xl border border-border/80 bg-card/80 p-2.5 card-3d bevel-shine hover-lift-3d cursor-pointer interactive-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
                >
                  <div className='flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#7778FF] to-[#4CC9F0] text-white font-extrabold text-xs shadow-sm'>
                    {orgInitials}
                  </div>
                  <div className='grid flex-1 text-left leading-tight'>
                    <span className='truncate font-bold text-xs text-foreground'>
                      {orgName ?? (language === 'id' ? 'Tanpa organisasi' : 'No organization')}
                    </span>
                    <span className='truncate text-[11px] text-muted-foreground font-mono'>
                      {accountEmail ?? '—'}
                    </span>
                  </div>
                  <ChevronsUpDown className='size-3.5 text-muted-foreground shrink-0' />
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='start' className='w-56 border-border bg-card/95 backdrop-blur-xl shadow-xl'>
                <DropdownMenuLabel className='text-[11px] font-mono text-muted-foreground uppercase'>
                  {language === 'id' ? 'Organisasi Terdaftar' : 'Registered Organizations'}
                </DropdownMenuLabel>
                {orgName ? (
                  <DropdownMenuItem className='flex items-center justify-between text-xs cursor-default'>
                    <span className='truncate'>{orgName}</span>
                    <Check className='size-3.5 text-[#7778FF] shrink-0' />
                  </DropdownMenuItem>
                ) : (
                  <div className='px-2 py-1.5 text-[11px] text-muted-foreground'>
                    {language === 'id' ? 'Belum terhubung ke organisasi.' : 'Not linked to an organization yet.'}
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </SidebarHeader>

        <SidebarContent className='px-2'>
          {sidebarData.navGroups.map((props) => (
            <NavGroup key={props.title} {...props} />
          ))}
        </SidebarContent>

        <SidebarFooter className='p-2 pt-1 space-y-2'>
          {/* Customer Help Link */}
          {!isAdmin && (
            <div className='px-1'>
              <a
                href='https://github.com/andhikanurdyansyah/grouter_copilot#readme'
                target='_blank'
                rel='noreferrer'
                className='flex items-center gap-2.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/40 transition-colors'
              >
                <HelpCircle className='size-4 text-muted-foreground' />
                <span>{t('nav_user_help')}</span>
              </a>
            </div>
          )}

          {/* User Card with Functional Dropdown Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div
                role='button'
                tabIndex={0}
                aria-label={language === 'id' ? 'Menu profil pengguna' : 'User profile menu'}
                className='flex items-center gap-2.5 rounded-xl border border-border/80 bg-card/70 p-2.5 shadow-2xs hover:bg-muted/40 transition-colors cursor-pointer interactive-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
              >
                <div
                  className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-foreground border ${
                    isAdmin
                      ? 'border-[#7778FF]/70 bg-[#7778FF]/10 text-[#7778FF]'
                      : 'border-[#4CC9F0]/70 bg-[#4CC9F0]/10 text-[#4CC9F0]'
                  }`}
                >
                  {isAdmin ? 'OP' : 'RS'}
                </div>
                <div className='grid flex-1 text-left leading-tight'>
                  <span className='truncate font-medium text-xs text-foreground'>
                    {sidebarData.user.name}
                  </span>
                  <span className='truncate text-[11px] text-muted-foreground'>
                    {sidebarData.user.email}
                  </span>
                </div>
                <MoreVertical className='size-3.5 text-muted-foreground shrink-0' />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' side='top' className='w-56 border-border bg-card/95 backdrop-blur-xl shadow-xl'>
              <DropdownMenuLabel className='font-normal text-xs'>
                <div className='font-bold text-foreground'>{sidebarData.user.name}</div>
                <div className='text-[11px] text-muted-foreground truncate'>{sidebarData.user.email}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {isAdmin ? (
                <DropdownMenuItem asChild className='text-xs cursor-pointer'>
                  <Link to='/admin/settings'>
                    <Settings className='size-3.5 mr-2' />
                    {t('nav_settings')}
                  </Link>
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem asChild className='text-xs cursor-pointer'>
                    <Link to='/user/account'>
                      <User className='size-3.5 mr-2' />
                      {language === 'id' ? 'Akun & Profil' : 'Account & Profile'}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className='text-xs cursor-pointer'
                    onClick={() => setChangePwOpen(true)}
                  >
                    <KeyRound className='size-3.5 mr-2' />
                    {language === 'id' ? 'Ubah password' : 'Change password'}
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem
                className='text-xs text-destructive focus:text-destructive cursor-pointer'
                onClick={() => setSignOutOpen(true)}
              >
                <LogOut className='size-3.5 mr-2' />
                {language === 'id' ? 'Keluar' : 'Sign out'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      {/* Global SignOut Dialog */}
      <SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
      <ChangePasswordDialog open={changePwOpen} onOpenChange={setChangePwOpen} />
    </>
  )
}
