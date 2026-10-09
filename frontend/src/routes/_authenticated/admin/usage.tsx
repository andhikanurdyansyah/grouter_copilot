import { createFileRoute } from '@tanstack/react-router'
import { AdminUsage } from '@/features/admin/usage'

export const Route = createFileRoute('/_authenticated/admin/usage')({
  component: AdminUsage,
})
