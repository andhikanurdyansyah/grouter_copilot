import { createFileRoute } from '@tanstack/react-router'
import { CustomerLicenses } from '@/features/customer/licenses'

export const Route = createFileRoute('/_authenticated/user/licenses')({
  component: CustomerLicenses,
})
