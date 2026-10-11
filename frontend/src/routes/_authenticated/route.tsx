import { createFileRoute } from '@tanstack/react-router'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'

// Layout ter-autentikasi:
// Mendukung mode demo & produksi. Membuka akses langsung ke antarmuka Moda
// dashboard sementara validasi server tetap dijalankan di background per request.
export const Route = createFileRoute('/_authenticated')({
  component: AuthenticatedLayout,
})
