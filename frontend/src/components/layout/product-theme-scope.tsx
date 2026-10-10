import { useEffect } from 'react'
import { useMatchRoute } from '@tanstack/react-router'

/**
 * Theme scope per produk (adopsi desain ZIP enterprise-saas):
 * - Admin  = dark control plane (slate-950 + teal) — tema .dark di-scoped
 *   dengan men-set class di <html> saat rute /admin aktif.
 * - Customer = light self-service (default terang).
 *
 * Komponen ini TIDAK me-render Outlet — hanya efek samping class <html>.
 * (Me-render Outlet di sini menduplikasi seluruh halaman di luar layout.)
 */
export function ProductThemeScope() {
  const matchRoute = useMatchRoute()
  const isAdmin = !!matchRoute({ to: '/admin', fuzzy: true })

  useEffect(() => {
    const root = document.documentElement
    if (isAdmin) {
      root.classList.add('dark')
      root.style.colorScheme = 'dark'
    } else {
      root.classList.remove('dark')
      root.style.colorScheme = 'light'
    }
    return () => {
      // Pulihkan default light saat keluar dari area admin
      root.classList.remove('dark')
      root.style.colorScheme = 'light'
    }
  }, [isAdmin])

  return null
}
