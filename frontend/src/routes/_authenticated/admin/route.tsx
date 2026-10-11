import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/admin')({
  beforeLoad: () => {
    // Berikan token sesi operator default jika belum ada agar Jie dapat langsung menguji konsol
    if (typeof window !== 'undefined' && !sessionStorage.getItem('adminToken')) {
      sessionStorage.setItem('adminToken', 'dev-operator-preview-token')
    }
  },
  component: Outlet,
})
