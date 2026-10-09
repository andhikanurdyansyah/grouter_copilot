import { createFileRoute } from '@tanstack/react-router'
import { AdminLedger } from '@/features/admin/ledger'

export const Route = createFileRoute('/_authenticated/admin/ledger')({
  component: AdminLedger,
})
