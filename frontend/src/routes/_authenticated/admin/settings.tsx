import { createFileRoute } from '@tanstack/react-router'
import { AdminSettings } from '@/features/admin/settings'

export const Route = createFileRoute('/_authenticated/admin/settings')({
  component: AdminSettings,
})
