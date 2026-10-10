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
// Bahasa: satu locale (Indonesia) — label nav = judul halaman (h1) yang dituju.
export function buildSidebarData(isAdmin: boolean, user?: { name?: string; email?: string }): SidebarData {
  if (isAdmin) {
    return {
      user: { name: user?.name || 'Operator', email: user?.email || 'admin', avatar: '' },
      teams: [],
      navGroups: [
        {
          title: 'Operasi',
          items: [
            { title: 'Operasional', url: '/admin', icon: Gauge },
          ],
        },
        {
          title: 'Manajemen Pelanggan',
          items: [
            { title: 'Lisensi', url: '/admin/licenses', icon: KeyRound },
            { title: 'Orders & Pembayaran', url: '/admin/orders', icon: Wallet },
          ],
        },
        {
          title: 'Tata Kelola AI',
          items: [
            { title: 'Paket & Kebijakan AI', url: '/admin/packages', icon: Package },
            { title: 'AI Ledger', url: '/admin/ledger', icon: ScrollText },
            { title: 'Usage Provider', url: '/admin/usage', icon: Cpu },
          ],
        },
        {
          title: 'Platform Infrastruktur',
          items: [
            { title: 'Infrastruktur & Health', url: '/admin/settings', icon: ServerCog },
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
        title: 'Copilot Saya',
        items: [
          { title: 'Status Saya', url: '/user', icon: Home },
          { title: 'Instalasi & Panduan', url: '/user/install', icon: BookOpen },
          { title: 'Pemakaian AI', url: '/user/usage', icon: PieChart },
        ],
      },
      {
        title: 'Langganan',
        items: [
          { title: 'Paket & Perpanjangan', url: '/user/orders', icon: ReceiptText },
          { title: 'Orders & Pembayaran', url: '/user/payments', icon: Wallet },
        ],
      },
      {
        title: 'Akun',
        items: [
          { title: 'Profil & Keamanan', url: '/user/account', icon: ShieldCheck },
        ],
      },
    ],
  }
}
