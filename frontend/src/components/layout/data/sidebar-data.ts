import {
  Gauge,
  KeyRound,
  ShoppingCart,
  ScrollText,
  Package,
  Activity,
  ServerCog,
  Home,
  BookOpen,
  PieChart,
  ReceiptText,
  UserRound,
} from 'lucide-react'
import { type SidebarData } from '../types'

// Dua produk yang sengaja dibedakan (blueprint D-024):
// - Admin = control plane: nav berdasar OBJEK KERJA, dikelompokkan per domain.
// - Customer = self-service: nav berdasar PERTANYAAN pelanggan, datar 5 item,
//   tanpa istilah administratif (revoke, policy, ledger, infrastruktur).
export function buildSidebarData(isAdmin: boolean, user?: { name?: string; email?: string }): SidebarData {
  if (isAdmin) {
    return {
      user: { name: user?.name || 'Operator', email: user?.email || 'admin', avatar: '' },
      teams: [],
      navGroups: [
        {
          title: 'Antrean',
          items: [
            { title: 'Operasional', url: '/admin', icon: Gauge },
          ],
        },
        {
          title: 'Objek Kerja',
          items: [
            { title: 'Lisensi', url: '/admin/licenses', icon: KeyRound },
            { title: 'Orders & Reconciliasi', url: '/admin/orders', icon: ShoppingCart },
            { title: 'AI Ledger', url: '/admin/ledger', icon: ScrollText },
          ],
        },
        {
          title: 'Konfigurasi',
          items: [
            { title: 'Paket & Kebijakan AI', url: '/admin/packages', icon: Package },
            { title: 'Usage Provider', url: '/admin/usage', icon: Activity },
            { title: 'Pengaturan & Health', url: '/admin/settings', icon: ServerCog },
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
        title: 'Produk',
        items: [
          { title: 'Status Saya', url: '/user', icon: Home },
          { title: 'Instalasi & Panduan', url: '/user/install', icon: BookOpen },
          { title: 'Pemakaian AI', url: '/user/usage', icon: PieChart },
          { title: 'Paket & Perpanjangan', url: '/user/orders', icon: ReceiptText },
          { title: 'Akun', url: '/user/account', icon: UserRound },
        ],
      },
    ],
  }
}
