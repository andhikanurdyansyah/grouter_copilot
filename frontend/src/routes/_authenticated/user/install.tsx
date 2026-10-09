import { createFileRoute } from '@tanstack/react-router'
import { CustomerInstall } from '@/features/customer/install'

export const Route = createFileRoute('/_authenticated/user/install')({
  component: CustomerInstall,
})
