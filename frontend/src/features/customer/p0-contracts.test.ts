import { describe, expect, it } from 'vitest'
import signUpRouteSource from '../../routes/sign-up.tsx?raw'
import licenseDetailSource from '../admin/license-detail.tsx?raw'
import adminOrdersSource from '../admin/orders.tsx?raw'
import paymentsSource from './payments.tsx?raw'

describe('FE-P0 fake-success regression contracts (2026-10-18)', () => {
  it('D-01: /sign-up redirects to the real wired route, never the showcase', () => {
    expect(signUpRouteSource).not.toContain('AuthComponent')
    expect(signUpRouteSource).toContain('/login/sign-up')
  })

  it('D-02: payment QR never falls back to a shared static asset', () => {
    expect(paymentsSource).not.toContain('qris-code.png')
    expect(paymentsSource).toContain('QR belum tersedia')
  })

  it('D-03: every settle call uses the full order id (row + drawer)', () => {
    expect(adminOrdersSource).toContain('handleVerify(row.fullId)')
    expect(adminOrdersSource).toContain('handleVerify(selectedOrder.fullId)')
    // the drawer must not flip local status to paid before the server confirms
    expect(adminOrdersSource).not.toContain("status: 'paid', statusLabel")
  })

  it('D-04: revoke confirm calls the real API mutation, not just close', () => {
    expect(licenseDetailSource).toContain('revokeLicense')
    expect(licenseDetailSource).toContain('revokeMut.mutate()')
    expect(licenseDetailSource).not.toContain(
      "onClick={() => setRevokeModalOpen(false)}>\n              {isId ? 'Ya, cabut sekarang'"
    )
  })

  it('D-05: renew never shows success the server has not confirmed', () => {
    expect(licenseDetailSource).not.toContain('Lisensi berhasil diperpanjang!')
    expect(licenseDetailSource).not.toContain('License renewed successfully!')
    expect(licenseDetailSource).not.toContain('renewError')
    expect(licenseDetailSource).toContain('renewUnavailable')
  })
})
