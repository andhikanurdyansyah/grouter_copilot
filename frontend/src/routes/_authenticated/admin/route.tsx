import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/admin')({
  beforeLoad: () => {
    // Authorization tetap server-side per request (Bearer token di setiap API).
    // Gate ini hanya pengalaman UX: tanpa token, tampilkan form token.
    if (typeof window !== 'undefined' && !sessionStorage.getItem('adminToken')) {
      throw redirect({ to: '/admin-gate', replace: true })
    }
  },
  component: Outlet,
})
