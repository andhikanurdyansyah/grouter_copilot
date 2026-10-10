import {
  Gauge,
  KeyRound,
  ScrollText,
  Package,
  ServerCog,
  Home,
  BookOpen,
  PieChart,
  ReceiptText,
  Wallet,
  ShieldCheck,
  Cpu,
} from 'lucide-react'
import { type SidebarData } from '../types'

// Dua produk yang sengaja dibedakan (adopsi desain ZIP enterprise-saas,
// docs/31-design-adoption-map.md):
// - Admin = OPERATIONAL CONTROL PLANE: kelompok domain Operasi / Manajemen
//   Pelanggan / Tata Kelola AI / Platform Infrastruktur — bahasa operasional.
// - Customer = SELF-SERVICE: kelompok MY COPILOT / SUBSCRIPTION / ACCOUNT —
//   tanpa istilah administratif (revoke, policy, ledger, infrastruktur).
export function buildSidebarData(isAdmin: boolean, user?: { name?: string; email?: string }): SidebarData {
  if (isAdmin) {
    return {
      user: { name: user?.name || 'Operator', email: user?.email || 'admin', avatar: '' },
      teams: [],
      navGroups: [
        {
          title: 'Operasi',
          items: [
            { title: 'Operational Overview', url: '/admin', icon: Gauge },
          ],
        },
        {
          title: 'Manajemen Pelanggan',
          items: [
            { title: 'Customers & Licenses', url: '/admin/licenses', icon: KeyRound },
            { title: 'Orders & Payments', url: '/admin/orders', icon: Wallet },
          ],
        },
        {
          title: 'Tata Kelola AI',
          items: [
            { title: 'Packages & AI Policies', url: '/admin/packages', icon: Package },
            { title: 'AI Usage Ledger', url: '/admin/ledger', icon: ScrollText },
            { title: 'Provider Usage', url: '/admin/usage', icon: Cpu },
          ],
        },
        {
          title: 'Platform Infrastruktur',
          items: [
            { title: 'Infrastructure & Health', url: '/admin/settings', icon: ServerCog },
          ],
        },
      ],
    }
  }
  return {
    user: { name: user?.name || 'Customer', email: user?.email || '', avatar: '' },
    teams: [],
    navGroups: [
      {
        title: 'My Copilot',
        items: [
          { title: 'Overview', url: '/user', icon: Home },
          { title: 'Installation & Guides', url: '/user/install', icon: BookOpen },
          { title: 'AI Usage', url: '/user/usage', icon: PieChart },
        ],
      },
      {
        title: 'Subscription',
        items: [
          { title: 'Packages & Renewals', url: '/user/orders', icon: ReceiptText },
          { title: 'Orders & Payments', url: '/user/payments', icon: Wallet },
        ],
      },
      {
        title: 'Account',
        items: [
          { title: 'Profile & Security', url: '/user/account', icon: ShieldCheck },
        ],
      },
    ],
  }
}
