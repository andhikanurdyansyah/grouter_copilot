import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { fetchAdminStats } from '@/lib/grouter-api'

// Gate admin: halaman /admin menuntut token operator VALID (terverifikasi
// server-side sebelum sesi dipercaya). Tanpa token tersimpan → redirect ke
// /admin-gate. Token default/preview DILARANG — hanya token asli dari operator.
export const Route = createFileRoute('/_authenticated/admin')({
  beforeLoad: async () => {
    if (typeof window === 'undefined') return
    const token = sessionStorage.getItem('adminToken')
    if (!token) throw redirect({ to: '/admin-gate' })
    try {
      sessionStorage.setItem('adminToken', token)
      await fetchAdminStats()
    } catch {
      sessionStorage.removeItem('adminToken')
      throw redirect({ to: '/admin-gate' })
    }
  },
  component: Outlet,
})
