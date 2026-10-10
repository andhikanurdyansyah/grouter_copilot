import { createFileRoute } from '@tanstack/react-router'
import { CustomerPayments } from '@/features/customer/payments'

// Riwayat order & pembayaran customer (session-scoped via GET /api/orders).
export const Route = createFileRoute('/_authenticated/user/payments')({
  component: CustomerPayments,
})
