import { createFileRoute } from '@tanstack/react-router'
import { AdminPackages } from '@/features/admin/packages'

export const Route = createFileRoute('/_authenticated/admin/packages')({
  component: AdminPackages,
})
