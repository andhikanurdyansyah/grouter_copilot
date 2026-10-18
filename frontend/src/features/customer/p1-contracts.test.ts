import { describe, expect, it } from 'vitest'
import ordersSrc from '../admin/orders.tsx?raw'
import licensesSrc from '../admin/licenses.tsx?raw'
import licenseDetailSrc from '../admin/license-detail.tsx?raw'
import overviewSrc from '../customer/overview.tsx?raw'
import sidebarDataSrc from '../../components/layout/data/sidebar-data.ts?raw'
import appSidebarSrc from '../../components/layout/app-sidebar.tsx?raw'

// P1 fake-success / fabricated-data contracts, defect register
// docs/evidence/2026-10-18-defect-register.md (D-06..D-12, D-19).
// Source-string contracts in the repo's existing style: they lock that the
// fabricated/fabrication-prone strings are gone and honest wiring is present.
// They are NOT behavioral/mounted proof.

describe('D-06 admin order drawer must not fabricate a customer domain', () => {
  it('drawer has no domain derived from the customer name', () => {
    expect(ordersSrc).not.toContain(".replace(/\\s+/g, '')}.id")
    expect(ordersSrc).not.toContain(">Domain</span>")
  })
})

describe('D-07 admin license domain field must not carry planKey', () => {
  it('licenses list row no longer maps planKey into a domain field', () => {
    expect(licensesSrc).not.toContain('domain: (l.planKey ??')
    expect(licensesSrc).not.toContain('{row.domain}')
    expect(licensesSrc).not.toContain('{selectedLicense?.domain}')
  })

  it('license detail no longer maps planKey into a domain field', () => {
    expect(licenseDetailSrc).not.toContain('domain: licRecord?.planKey')
    expect(licenseDetailSrc).not.toContain('{licenseData.domain}')
  })
})

describe('D-12 license detail header reflects the real license status', () => {
  it('header badge derives from the record, not a hardcoded Aktif', () => {
    expect(licenseDetailSrc).toContain('normalizeLicenseStatus')
    expect(licenseDetailSrc).not.toContain("{isId ? 'Aktif' : 'Active'}")
  })

  it('a nonexistent license gets an honest not-found state', () => {
    expect(licenseDetailSrc).toContain('licenses.isFetched')
    expect(licenseDetailSrc).toContain('notFound')
  })
})

describe('D-08 overview payment banner only renders for a real order', () => {
  it('banner branches on the presence of latestOrder, not just isPaid', () => {
    expect(overviewSrc).toContain('latestOrder != null && (isPaid')
    expect(overviewSrc).not.toMatch(/\n\s*\{isPaid \? \(\n\s*<div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3\.5 rounded-xl border border-emerald/)
  })
})

describe('D-09 / D-19 overview chart and KPI are data-bound', () => {
  it('chart stroke/area paths derive from usageHistory points', () => {
    expect(overviewSrc).toContain('chartLine')
    expect(overviewSrc).not.toContain('M 20 145 C 65 120, 110 135, 155 100')
  })

  it('KPI label no longer claims a 14h/14d window for all-time totals', () => {
    expect(overviewSrc).not.toContain("isId ? 'Permintaan · 14h'")
    expect(overviewSrc).toContain("isId ? 'Permintaan (riwayat)'")
  })
})

describe('D-11 sidebar badges derive from real admin stats', () => {
  it('badge literals are gone from the sidebar data builder', () => {
    expect(sidebarDataSrc).not.toContain("badge: '128'")
    expect(sidebarDataSrc).not.toContain("badge: '4'")
    expect(sidebarDataSrc).not.toContain("badge: '1'")
    expect(sidebarDataSrc).toContain('adminCounts')
  })

  it('app sidebar gates the stats query to the admin surface', () => {
    expect(appSidebarSrc).toContain('fetchAdminStats')
    expect(appSidebarSrc).toContain('enabled: isAdmin')
  })
})
