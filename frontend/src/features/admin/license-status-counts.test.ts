import { describe, expect, it } from 'vitest'
import { countLicenseStatuses, normalizeLicenseStatus } from './license-status-counts'

describe('license status counts', () => {
  it('normalizes API timestamps with revoked taking precedence over expired', () => {
    const now = Date.parse('2026-01-15T00:00:00Z')
    expect(normalizeLicenseStatus({ revokedAt: '2026-01-10T00:00:00Z', expiresAt: '2026-01-01T00:00:00Z' }, now)).toBe('revoked')
    expect(normalizeLicenseStatus({ expiresAt: '2026-01-01T00:00:00Z' }, now)).toBe('expired')
    expect(normalizeLicenseStatus({ expiresAt: 0 }, 1)).toBe('expired')
    expect(normalizeLicenseStatus({ expiresAt: 1 }, 0)).toBe('active')
    expect(normalizeLicenseStatus({ status: 'active' }, now)).toBe('active')
    expect(normalizeLicenseStatus({ status: 'bogus' }, now)).toBe('unknown')
  })

  it('fails closed for malformed timestamp fields instead of reporting active or revoked', () => {
    const now = Date.parse('2026-01-15T00:00:00Z')
    expect(normalizeLicenseStatus({ expiresAt: 'not-a-timestamp' }, now)).toBe('unknown')
    expect(normalizeLicenseStatus({ revokedAt: 'not-a-timestamp' }, now)).toBe('unknown')
    expect(normalizeLicenseStatus({ expiresAt: Number.NaN }, now)).toBe('unknown')
    expect(normalizeLicenseStatus({ expiresAt: 'not-a-timestamp', revokedAt: '2026-01-10T00:00:00Z' }, now)).toBe('unknown')
    expect(normalizeLicenseStatus({ expiresAt: '2026-02-01T00:00:00Z', revokedAt: 'not-a-timestamp' }, now)).toBe('unknown')
  })

  it('counts unknown statuses without changing active, expired, or revoked counts', () => {
    expect(countLicenseStatuses(['active', 'expired', 'revoked', 'unknown', 'revoked'])).toEqual({ all: 5, active: 1, expired: 1, revoked: 2, unknown: 1 })
  })
})
