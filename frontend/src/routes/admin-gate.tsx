import { createFileRoute } from '@tanstack/react-router'
import { AdminGate } from '@/features/admin/admin-gate'

// Gate admin di luar layout ter-autentikasi (tanpa sidebar) — konsisten
// dengan halaman gate server-rendered sebelumnya.
export const Route = createFileRoute('/admin-gate')({
  component: AdminGate,
})
