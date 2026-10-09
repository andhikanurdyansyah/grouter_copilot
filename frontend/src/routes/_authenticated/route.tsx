import { createFileRoute, redirect } from '@tanstack/react-router'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'

// Layout ter-autentikasi: customer divalidasi via /api/me (cookie better-auth);
// admin via token sessionStorage. Validasi sebenarnya server-side per request.
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async () => {
    if (typeof window === 'undefined') return
    const path = window.location.pathname
    if (path.startsWith('/admin')) return // admin gate di /admin route
    // Customer: cek sesi sekali di entry (fetch /api/me) — 401 → /login
    try {
      const res = await fetch('/api/me', { credentials: 'include' })
      if (res.status === 401) {
        throw redirect({ to: '/', replace: true, href: '/login' })
      }
    } catch (e) {
      if ((e as { to?: string })?.to === '/') {
        window.location.href = '/login'
      }
      throw e
    }
  },
  component: AuthenticatedLayout,
})
