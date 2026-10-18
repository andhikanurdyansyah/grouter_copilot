import { describe, expect, it } from 'vitest'
import ledgerSrc from '../admin/ledger.tsx?raw'
import adminUsageSrc from '../admin/usage.tsx?raw'
import customerUsageSrc from './usage.tsx?raw'
import accountSrc from './account.tsx?raw'
import installSrc from './install.tsx?raw'
import issueModalSrc from '../admin/components/issue-license-modal.tsx?raw'
import settingsSrc from '../admin/settings.tsx?raw'
import apiSrc from '../../lib/grouter-api.ts?raw'
import modaHeaderSrc from '../../components/layout/moda-header.tsx?raw'

// P2/P3 fake-success + restart-disclosure contracts, defect register
// docs/evidence/2026-10-18-defect-register.md (D-15/D-16/D-17/D-20/D-21
// + A-03 UI). Source-string contracts in the repo's existing style: they
// lock that fabricated strings are gone and honest wiring is present.
// They are NOT behavioral/mounted proof.

describe('D-16 ledger pagination must be real or honestly reframed', () => {
  it('admin ledger uses paginated fetch with offset accumulation state', () => {
    expect(ledgerSrc).toContain('pageLimit')
    expect(ledgerSrc).toContain('visibleCount')
    expect(ledgerSrc).toContain('hasMore')
    expect(ledgerSrc).not.toMatch(/onClick=\{\(\) => ledgerQuery\.refetch\(\)\}/)
  })

  it('customer usage uses a real page-size state instead of refetch', () => {
    expect(customerUsageSrc).toContain('ledgerPageSize')
    expect(customerUsageSrc).not.toMatch(/onClick=\{\(\) => myLedger\.refetch\(\)\}/)
  })
})

describe('D-21 admin usage chart scale must derive from data', () => {
  it('chart axis and bar heights use the data-derived ceiling', () => {
    expect(adminUsageSrc).toContain('chartScaleMax')
    expect(adminUsageSrc).not.toContain('>4M</span>')
    expect(adminUsageSrc).not.toContain('(d.in / 4.0)')
    expect(adminUsageSrc).not.toContain('(d.out / 4.0)')
  })
})

describe('ledger inspect modal must render the stored record, not a fabrication', () => {
  it('no synthetic verified-signature or invented timestamp story', () => {
    expect(ledgerSrc).not.toContain('D-021 Verified Payload')
    expect(ledgerSrc).not.toContain('ed25519:verified_ok')
    expect(ledgerSrc).not.toContain('cryptographically signed')
    expect(ledgerSrc).not.toContain('"timestamp": "2026-10-11T')
  })
})

describe('D-20 account page must not pass a license id off as a bound domain', () => {
  it('bound-domains row and organization fabrication are gone', () => {
    expect(accountSrc).not.toContain('Domain Terikat')
    expect(accountSrc).not.toContain('Bound Domains')
    expect(accountSrc).not.toContain('emailDomain')
  })
})

describe('D-17 clipboard success must wait for the write to resolve', () => {
  it('install page copies resolve before setting the copied flag', () => {
    expect(installSrc).toContain('await navigator.clipboard.writeText(installCmd)')
    expect(installSrc).toContain('await navigator.clipboard.writeText(licenseId)')
    expect(installSrc).toContain('await navigator.clipboard.writeText(code)')
    expect(installSrc).not.toMatch(/const handleCopyCmd = \(\) => \{\s+navigator\.clipboard/)
  })

  it('issue-license modal copy awaits the clipboard write', () => {
    expect(issueModalSrc).toContain('await navigator.clipboard.writeText(issuedLicense.token)')
  })
})

describe('A-03 settings UI must disclose restart-only sections', () => {
  it('api client types the restart disclosure on the settings PATCH', () => {
    expect(apiSrc).toContain('requiresRestart?: string[]')
  })

  it('admin settings surface tells the operator a restart is required', () => {
    expect(settingsSrc).toContain('requiresRestart')
    expect(settingsSrc).toContain('restartRequiredNotice')
  })
})

describe('D-15 notification footer must route by surface', () => {
  it('admin notifications link to orders, customer notifications to payments', () => {
    expect(modaHeaderSrc).toContain("href={isAdmin ? '/admin/orders' : '/user/payments'}")
  })
})

describe('D-15 customer breadcrumb must label the licenses route correctly', () => {
  it('the /licenses breadcrumb uses the licenses label, not install', () => {
    expect(modaHeaderSrc).toContain("t('nav_user_licenses')")
  })
})
