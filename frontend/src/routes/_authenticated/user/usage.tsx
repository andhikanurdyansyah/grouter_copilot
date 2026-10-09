import { createFileRoute } from '@tanstack/react-router'
import { CustomerUsage } from '@/features/customer/usage'

export const Route = createFileRoute('/_authenticated/user/usage')({
  component: CustomerUsage,
})
