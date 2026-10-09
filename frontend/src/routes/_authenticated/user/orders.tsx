import { createFileRoute } from '@tanstack/react-router'
import { CustomerOrders } from '@/features/customer/orders'

export const Route = createFileRoute('/_authenticated/user/orders')({
  component: CustomerOrders,
})
