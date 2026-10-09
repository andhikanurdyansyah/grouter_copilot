import { createFileRoute } from '@tanstack/react-router'
import { CustomerOverview } from '@/features/customer/overview'

export const Route = createFileRoute('/_authenticated/user/')({
  component: CustomerOverview,
})
