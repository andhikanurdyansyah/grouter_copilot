export type LicenseStatus = 'active' | 'expired' | 'revoked' | 'unknown'

export type LicenseStatusCount = {
  all: number
  active: number
  expired: number
  revoked: number
  unknown: number
}

export type LicenseStatusFields = {
  status?: string | null
  revokedAt?: string | number | null
  expiresAt?: string | number | null
}

function parseTimestamp(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null
  const timestamp = typeof value === 'number' ? value : new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

/** Derive a truthful display status from the API's timestamp fields.
 * Revocation wins over expiry when both fields are valid. Malformed timestamps fail closed. */
export function normalizeLicenseStatus(license: LicenseStatusFields, nowMs = Date.now()): LicenseStatus {
  const rawStatus = license.status == null ? null : String(license.status).toLowerCase()
  const revokedAt = parseTimestamp(license.revokedAt)
  const expiresAt = parseTimestamp(license.expiresAt)
  const hasRevokedTimestamp = license.revokedAt != null && license.revokedAt !== ''
  const hasExpiresTimestamp = license.expiresAt != null && license.expiresAt !== ''

  if ((hasRevokedTimestamp && revokedAt == null) || (hasExpiresTimestamp && expiresAt == null)) return 'unknown'
  if (revokedAt != null || rawStatus === 'revoked') return 'revoked'
  if (expiresAt != null && expiresAt <= nowMs) return 'expired'
  if (rawStatus === 'expired') return 'expired'
  if (rawStatus == null || rawStatus === '' || rawStatus === 'active') return 'active'
  return 'unknown'
}

export function countLicenseStatuses(licenses: ReadonlyArray<LicenseStatus>): LicenseStatusCount {
  return licenses.reduce<LicenseStatusCount>(
    (counts, status) => {
      counts.all += 1
      counts[status] += 1
      return counts
    },
    { all: 0, active: 0, expired: 0, revoked: 0, unknown: 0 },
  )
}
