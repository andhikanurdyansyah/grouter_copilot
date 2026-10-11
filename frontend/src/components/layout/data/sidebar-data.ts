import {
  LayoutGrid,
  KeyRound,
  Receipt,
  ScrollText,
  LineChart,
  Package,
  Settings,
  Home,
  Tag,
  CreditCard,
} from 'lucide-react'
import { type SidebarData } from '../types'
import { type Language, dictionary } from '@/context/language-provider'

export function buildSidebarData(
  isAdmin: boolean,
  lang: Language = 'id',
  user?: { name?: string; email?: string }
): SidebarData {
  const t = (key: string) => {
    const entry = dictionary[key]
    return entry ? entry[lang] || entry.id : key
  }

  if (isAdmin) {
    return {
      user: {
        name: user?.name || t('role_operator'),
        email: user?.email || t('role_operator_sub'),
        avatar: '',
        role: 'admin',
      },
      teams: [],
      navGroups: [
        {
          title: t('nav_operations'),
          items: [
            {
              title: t('nav_overview'),
              url: '/admin',
              icon: LayoutGrid,
            },
            {
              title: t('nav_licenses'),
              url: '/admin/licenses',
              icon: KeyRound,
              badge: '128',
              badgeVariant: 'muted',
            },
            {
              title: t('nav_orders'),
              url: '/admin/orders',
              icon: Receipt,
              badge: '4',
              badgeVariant: 'amber',
            },
            {
              title: t('nav_ledger'),
              url: '/admin/ledger',
              icon: ScrollText,
            },
            {
              title: t('nav_usage'),
              url: '/admin/usage',
              icon: LineChart,
            },
          ],
        },
        {
          title: t('nav_configuration'),
          items: [
            {
              title: t('nav_plans_policy'),
              url: '/admin/packages',
              icon: Package,
            },
            {
              title: t('nav_settings'),
              url: '/admin/settings',
              icon: Settings,
            },
          ],
        },
      ],
    }
  }

  // Customer Sidebar
  return {
    user: {
      name: user?.name || t('role_customer'),
      email: user?.email || t('role_customer_sub'),
      avatar: '',
      role: 'customer',
    },
    teams: [],
    navGroups: [
      {
        title: t('nav_workspace'),
        items: [
          {
            title: t('nav_user_overview'),
            url: '/user',
            icon: Home,
          },
          {
            title: t('nav_user_install'),
            url: '/user/install',
            icon: KeyRound,
            badge: '●',
            badgeVariant: 'dot',
          },
          {
            title: t('nav_user_usage'),
            url: '/user/usage',
            icon: LineChart,
          },
        ],
      },
      {
        title: t('nav_billing'),
        items: [
          {
            title: t('nav_user_plans'),
            url: '/user/orders',
            icon: Tag,
          },
          {
            title: t('nav_user_orders'),
            url: '/user/payments',
            icon: CreditCard,
            badge: '1',
            badgeVariant: 'amber',
          },
        ],
      },
    ],
  }
}
