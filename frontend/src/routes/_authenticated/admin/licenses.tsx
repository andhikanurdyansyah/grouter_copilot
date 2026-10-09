import { createFileRoute } from '@tanstack/react-router'
import { AdminLicenses } from '@/features/admin/licenses'

export const Route = createFileRoute('/_authenticated/admin/licenses')({
  component: AdminLicenses,
})
