import { createFileRoute } from '@tanstack/react-router'
import { CustomerAccount } from '@/features/customer/account'

export const Route = createFileRoute('/_authenticated/user/account')({
  component: CustomerAccount,
})
