import {
  LayoutDashboard,
  KeyRound,
  Activity,
  ReceiptText,
  ScrollText,
  Package,
  ServerCog,
  ShieldCheck,
  ShoppingCart,
} from 'lucide-react'
import { type SidebarData } from '../types'

// Dua workspace dalam satu app: /user/* (customer) & /admin/* (operator).
// Role dipilih runtime: jika pathname /admin → navGroups admin.
export function buildSidebarData(isAdmin: boolean, user?: { name?: string; email?: string }): SidebarData {
  if (isAdmin) {
    return {
      user: { name: user?.name || 'Operator', email: user?.email || 'admin', avatar: '' },
      teams: [],
      navGroups: [
        {
          title: 'Operasional',
          items: [
            { title: 'Ringkasan', url: '/admin', icon: LayoutDashboard },
            { title: 'Lisensi', url: '/admin/licenses', icon: KeyRound },
            { title: 'Usage & Kuota', url: '/admin/usage', icon: Activity },
          ],
        },
        {
          title: 'Komersial',
          items: [
            { title: 'Paket & AI Policy', url: '/admin/packages', icon: Package },
            { title: 'Orders & Bayar', url: '/admin/orders', icon: ShoppingCart },
            { title: 'AI Ledger', url: '/admin/ledger', icon: ScrollText },
          ],
        },
        {
          title: 'Infrastruktur',
          items: [
            { title: 'Pengaturan', url: '/admin/settings', icon: ServerCog },
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
        title: 'Workspace',
        items: [
          { title: 'Ringkasan', url: '/user', icon: LayoutDashboard },
          { title: 'Lisensi & Install', url: '/user/licenses', icon: KeyRound },
          { title: 'Pemakaian AI', url: '/user/usage', icon: Activity },
        ],
      },
      {
        title: 'Pembelian',
        items: [
          { title: 'Paket & Order', url: '/user/orders', icon: ReceiptText },
        ],
      },
      {
        title: 'Akun',
        items: [
          { title: 'Halaman produk', url: '/landing', icon: ShieldCheck },
        ],
      },
    ],
  }
}
