import { createFileRoute } from '@tanstack/react-router'
import { AdminLicenseDetail } from '@/features/admin/license-detail'

// Deep-linkable license detail: /admin/licenses/$licenseId
// Data dimuat dari /api/admin/licenses (list) — find by id.
export const Route = createFileRoute('/_authenticated/admin/licenses_/$licenseId')({
  component: AdminLicenseDetail,
})
