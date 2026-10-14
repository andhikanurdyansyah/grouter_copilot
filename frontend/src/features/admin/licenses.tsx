import { useState, useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchAdminLicenses, revokeLicense, fetchLedger, fetchPlans } from '@/lib/grouter-api'
import { Button } from '@/components/ui/button'
import {
  Plus,
  Search,
  Download,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react'
import { useLanguage } from '@/context/language-provider'
import { IssueLicenseModal } from './components/issue-license-modal'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export function AdminLicenses() {
  const { language, t } = useLanguage()
  const isId = language === 'id'
  const qc = useQueryClient()

  const [q, setQ] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'expired' | 'revoked'>('all')
  const [selectedPlan, setSelectedPlan] = useState<string>('all')
  const [sort, setSort] = useState<'expires' | 'created' | 'usage'>('expires')
  const [issueModalOpen, setIssueModalOpen] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<null | (typeof realLicenses)[number]>(null)
  const [selectedLicense, setSelectedLicense] = useState<null | (typeof realLicenses)[number]>(null)

  const lic = useQuery({ queryKey: ['admin-licenses'], queryFn: fetchAdminLicenses })

  // Plan catalogue (real keys) so the plan filter matches actual planKey values
  // instead of hardcoded starter/pro/enterprise.
  const plansQuery = useQuery({ queryKey: ['plans'], queryFn: fetchPlans })

  // Data REAL: lisensi dari /api/admin/licenses + kuota dari ledger gateway.
  const ledgerTotals = useQuery({
    queryKey: ['admin-ledger-totals'],
    queryFn: () => fetchLedger({ limit: 200 }),
  })
  const usedByLicense = new Map<string, number>()
  for (const r of ((ledgerTotals.data?.records ?? []) as Array<{ licenseId: string; totalTokens: number | null }>)) {
    usedByLicense.set(r.licenseId, (usedByLicense.get(r.licenseId) ?? 0) + (r.totalTokens ?? 0))
  }

  const shortId = (id: string) => (id.length > 15 ? id.slice(0, 9) + '...' + id.slice(-4) : id)

  const [nowMs] = useState(() => Date.now())
  const realLicenses = useMemo(() => {
    const raw = lic.data?.licenses ?? []
    return raw.map((l) => {
      const quota = (l.quota ?? null) as { limit?: number | null; usedTokens?: number | null } | null
      const limit = quota?.limit ?? null
      const used = usedByLicense.get(l.id) ?? quota?.usedTokens ?? 0
      const percent = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0
      const expired = l.expiresAt ? new Date(l.expiresAt).getTime() < nowMs : false
      const status = String(l.status ?? (expired ? 'expired' : 'active'))
      const statusLabel = isId
        ? (status === 'active' ? 'Aktif' : status === 'expired' ? 'Kedaluwarsa' : 'Dicabut')
        : (status === 'active' ? 'Active' : status === 'expired' ? 'Expired' : 'Revoked')
      return {
        id: shortId(l.id),
        fullId: l.id,
        customer: l.customer ?? '—',
        domain: (l.planKey ?? '—') as string,
        plan: (l.planKey ?? '—') as string,
        usedQuota: used ? used.toLocaleString('id-ID') : '0',
        totalQuota: limit ? limit.toLocaleString('id-ID') : '—',
        percent,
        expiresAt: l.expiresAt ? new Date(l.expiresAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
        status,
        statusLabel,
        // sort keys (raw)
        expiresMs: l.expiresAt ? new Date(l.expiresAt).getTime() : Number.POSITIVE_INFINITY,
        createdMs: l.createdAt ? new Date(l.createdAt).getTime() : 0,
        usedRaw: used,
        skills: Array.isArray((l as unknown as { skills?: string[] }).skills) ? (l as unknown as { skills: string[] }).skills : [],
      }
    })
  }, [lic.data, ledgerTotals.data, isId, nowMs])

  const revokeMut = useMutation({
    mutationFn: (id: string) => revokeLicense(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-licenses'] })
      setRevokeTarget(null)
    },
  })

  const filteredLicenses = useMemo(() => {
    const rows = realLicenses.filter((item) => {
      if (activeTab === 'active' && item.status !== 'active') return false
      if (activeTab === 'expired' && item.status !== 'expired') return false
      if (activeTab === 'revoked' && item.status !== 'revoked') return false

      if (selectedPlan !== 'all' && item.plan.toLowerCase() !== selectedPlan) return false

      if (q) {
        const query = q.toLowerCase()
        return (
          item.id.toLowerCase().includes(query) ||
          item.customer.toLowerCase().includes(query) ||
          item.domain.toLowerCase().includes(query)
        )
      }
      return true
    })
    const sorted = [...rows]
    if (sort === 'expires') sorted.sort((a, b) => a.expiresMs - b.expiresMs)
    else if (sort === 'created') sorted.sort((a, b) => b.createdMs - a.createdMs)
    else if (sort === 'usage') sorted.sort((a, b) => b.usedRaw - a.usedRaw)
    return sorted
  }, [realLicenses, activeTab, selectedPlan, q, sort])

  return (
    <div className='space-y-6 animate-fade-in'>
      {/* ── Heading Row ── */}
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight text-foreground'>
            {isId ? 'Lisensi' : 'Licenses'}
          </h1>
          <p className='text-xs sm:text-sm text-muted-foreground mt-0.5'>
            {isId
              ? 'Terbitkan, pantau kuota, dan cabut lisensi. Token hanya ditampilkan sekali saat terbit.'
              : 'Issue, monitor quota, and revoke licenses. Tokens are only shown once upon issuance.'}
          </p>
        </div>

        <div className='flex items-center gap-3'>
          <Button
            variant='outline'
            size='sm'
            className='h-9 gap-1.5 border-border bg-card/60 hover:bg-muted text-xs sm:text-sm font-medium'
            onClick={() => {
              const csv = 'id,customer,plan,status\n' + filteredLicenses.map(l => `${l.id},${l.customer},${l.plan},${l.status}`).join('\n')
              const blob = new Blob([csv], { type: 'text/csv' })
              const a = document.createElement('a')
              a.href = URL.createObjectURL(blob)
              a.download = 'licenses.csv'
              a.click()
            }}
          >
            <Download className='size-3.5' /> {t('btn_export_csv')}
          </Button>

          <Button
            onClick={() => setIssueModalOpen(true)}
            className='h-9 gap-1.5 bg-[#7778FF] hover:bg-[#8F90FF] text-white font-medium text-xs sm:text-sm rounded-lg shadow-sm'
          >
            <Plus className='size-3.5' /> {t('btn_issue_license')}
          </Button>
        </div>
      </div>

      {/* ── Filters & Search Row ── */}
      <div className='flex flex-col lg:flex-row lg:items-center justify-between gap-3'>
        <div className='flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 max-w-2xl'>
          {/* Search Input */}
          <div className='relative flex items-center flex-1'>
            <Search className='size-4 absolute left-3 text-muted-foreground pointer-events-none' />
            <input
              type='text'
              aria-label={isId ? 'Cari lisensi' : 'Search licenses'}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={isId ? 'Cari ID, domain, atau email...' : 'Search ID, domain, or email...'}
              className='w-full rounded-lg border border-border bg-card/60 pl-9 pr-3.5 py-2 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground transition-all focus:outline-hidden focus:ring-1 focus:ring-primary shadow-2xs'
            />
          </div>

          {/* Status Tabs Pills */}
          <div className='flex items-center rounded-lg border border-border bg-card/70 p-0.5 shadow-2xs overflow-x-auto'>
            {[
              { id: 'all', label: isId ? 'Semua · 128' : 'All · 128' },
              { id: 'active', label: isId ? 'Aktif · 112' : 'Active · 112' },
              { id: 'expired', label: isId ? 'Kedaluwarsa · 9' : 'Expired · 9' },
              { id: 'revoked', label: isId ? 'Dicabut · 7' : 'Revoked · 7' },
            ].map((tab) => (
              <button
                key={tab.id}
                type='button'
                onClick={() => setActiveTab(tab.id as Parameters<typeof setActiveTab>[0])}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap',
                  activeTab === tab.id
                    ? 'bg-muted text-foreground font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Dropdowns on Right */}
        <div className='flex items-center gap-2.5'>
          <select
            aria-label={isId ? 'Filter paket' : 'Filter by plan'}
            value={selectedPlan}
            onChange={(e) => setSelectedPlan(e.target.value)}
            className='rounded-lg border border-border bg-card/60 px-3 py-1.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary'
          >
            <option value='all'>{isId ? 'Paket: Semua ▾' : 'Plan: All ▾'}</option>
            {(plansQuery.data?.plans ?? []).map((p) => (
              <option key={p.key} value={p.key.toLowerCase()}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            aria-label={isId ? 'Urutkan lisensi' : 'Sort licenses'}
            value={sort}
            onChange={(e) => setSort(e.target.value as 'expires' | 'created' | 'usage')}
            className='rounded-lg border border-border bg-card/60 px-3 py-1.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary'
          >
            <option value='expires'>{isId ? 'Urut: Berakhir ↑' : 'Sort: Expires ↑'}</option>
            <option value='created'>{isId ? 'Urut: Dibuat ↓' : 'Sort: Created ↓'}</option>
            <option value='usage'>{isId ? 'Urut: Pemakaian ↓' : 'Sort: Usage ↓'}</option>
          </select>
        </div>
      </div>

      {/* ── Table Container ── */}
      <div className='rounded-xl border border-border/80 bg-card/80 card-3d bevel-shine overflow-hidden'>
        <div className='overflow-x-auto'>
          <table className='w-full text-left text-xs'>
            <thead>
              <tr className='border-b border-border/60 bg-muted/30 text-muted-foreground'>
                <th className='py-3.5 px-4 font-semibold uppercase tracking-wider'>{isId ? 'ID LISENSI' : 'LICENSE ID'}</th>
                <th className='py-3.5 px-4 font-semibold uppercase tracking-wider'>{isId ? 'PELANGGAN' : 'CUSTOMER'}</th>
                <th className='py-3.5 px-4 font-semibold uppercase tracking-wider'>{isId ? 'PAKET' : 'PLAN'}</th>
                <th className='py-3.5 px-4 font-semibold uppercase tracking-wider min-w-[200px]'>{isId ? 'KUOTA TOKEN' : 'TOKEN QUOTA'}</th>
                <th className='py-3.5 px-4 font-semibold uppercase tracking-wider'>{isId ? 'BERAKHIR ↑' : 'EXPIRES ↑'}</th>
                <th className='py-3.5 px-4 font-semibold uppercase tracking-wider'>{isId ? 'STATUS' : 'STATUS'}</th>
                <th className='py-3.5 px-4 text-right'></th>
              </tr>
            </thead>
            <tbody className='divide-y divide-border/60'>
              {filteredLicenses.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setSelectedLicense(row)}
                  className='hover:bg-muted/40 transition-colors group cursor-pointer'
                >
                  {/* ID */}
                  <td className='py-3.5 px-4 font-mono font-bold text-foreground'>
                    <button
                      type='button'
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedLicense(row)
                      }}
                      className='hover:underline hover:text-[#7778FF] flex items-center gap-1.5 font-mono text-left'
                    >
                      <span>{row.id}</span>
                    </button>
                  </td>

                  {/* Customer */}
                  <td className='py-3.5 px-4'>
                    <div className='font-bold text-foreground text-xs group-hover:text-[#7778FF] transition-colors'>{row.customer}</div>
                    <div className='text-[11px] text-muted-foreground font-mono'>{row.domain}</div>
                  </td>

                  {/* Plan */}
                  <td className='py-3.5 px-4 font-semibold text-foreground'>
                    <span className='rounded-md bg-muted px-2 py-0.5 text-xs'>
                      {row.plan}
                    </span>
                  </td>

                  {/* Quota Progress with 3D gradient shimmer */}
                  <td className='py-3.5 px-4'>
                    {row.status === 'revoked' ? (
                      <span className='text-muted-foreground font-mono'>—</span>
                    ) : (
                      <div className='space-y-1.5'>
                        <div className='flex justify-between font-mono text-[11px]'>
                          <span
                            className={cn(
                              'font-bold',
                              row.percent === 100
                                ? 'text-[#FF667A]'
                                : row.percent > 60
                                ? 'text-amber-500'
                                : 'text-foreground'
                            )}
                          >
                            {row.usedQuota} / {row.totalQuota}
                          </span>
                          <span className='text-muted-foreground'>{row.percent}%</span>
                        </div>
                        <div className='h-2 w-full rounded-full bg-muted/60 overflow-hidden shadow-inner'>
                          <div
                            className={cn(
                              'h-full rounded-full transition-all shadow-xs',
                              row.percent === 100
                                ? 'bg-gradient-to-r from-red-500 to-[#FF667A]'
                                : row.percent > 60
                                ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                                : 'bg-gradient-to-r from-[#7778FF] to-[#4CC9F0]'
                            )}
                            style={{ width: `${Math.min(100, row.percent)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </td>

                  {/* Expires At */}
                  <td className='py-3.5 px-4 font-mono text-muted-foreground'>
                    {row.expiresAt}
                  </td>

                  {/* Status */}
                  <td className='py-3.5 px-4'>
                    {row.status === 'active' && (
                      <span className='inline-flex items-center gap-1.5 text-[#39D6A0] font-bold'>
                        <span className='size-1.5 rounded-full bg-[#39D6A0] shadow-[0_0_6px_#39D6A0]' /> {row.statusLabel}
                      </span>
                    )}
                    {row.status === 'expired' && (
                      <span className='inline-flex items-center gap-1.5 text-muted-foreground font-medium'>
                        <span className='size-1.5 rounded-full bg-muted-foreground' /> {row.statusLabel}
                      </span>
                    )}
                    {row.status === 'quota' && (
                      <span className='inline-flex items-center gap-1.5 text-[#FF667A] font-bold'>
                        <span className='size-1.5 rounded-xs bg-[#FF667A]' /> {row.statusLabel}
                      </span>
                    )}
                    {row.status === 'revoked' && (
                      <span className='inline-flex items-center gap-1.5 text-[#FF667A] font-medium'>
                        <span className='size-1.5 rounded-full border border-[#FF667A]' /> {row.statusLabel}
                      </span>
                    )}
                  </td>

                  {/* Actions Menu */}
                  <td className='py-3.5 px-4 text-right' onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant='ghost' size='sm' className='h-7 w-7 p-0 text-muted-foreground hover:text-foreground interactive-press'>
                          <MoreHorizontal className='size-4' />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align='end' className='w-44 border-border bg-card/95 backdrop-blur-xl shadow-xl'>
                        <DropdownMenuItem onClick={() => setSelectedLicense(row)}>
                          {isId ? 'Inspeksi cepat (Drawer)' : 'Quick inspect (Drawer)'}
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to='/admin/licenses/$licenseId' params={{ licenseId: row.fullId }}>
                            {isId ? 'Halaman lengkap' : 'Full page view'}
                          </Link>
                        </DropdownMenuItem>
                        {row.status !== 'revoked' && (
                          <DropdownMenuItem
                            onClick={() => setRevokeTarget(row)}
                            className='text-[#FF667A] focus:text-[#FF667A]'
                          >
                            {isId ? 'Cabut lisensi' : 'Revoke license'}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Pagination Bar ── */}
        <div className='flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground'>
          <div>
            1–25 {isId ? 'dari 128 · 25 per halaman' : 'of 128 · 25 per page'}
          </div>
          <div className='flex items-center gap-1 font-mono'>
            <Button variant='outline' size='sm' className='h-7 w-7 p-0' disabled>
              <ChevronLeft className='size-3.5' />
            </Button>
            <Button variant='outline' size='sm' className='h-7 w-7 p-0 bg-muted font-bold text-foreground'>
              1
            </Button>
            <Button variant='outline' size='sm' className='h-7 w-7 p-0'>
              2
            </Button>
            <span className='px-1'>...</span>
            <Button variant='outline' size='sm' className='h-7 w-7 p-0'>
              6
            </Button>
            <Button variant='outline' size='sm' className='h-7 w-7 p-0'>
              <ChevronRight className='size-3.5' />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Issue License Modal ── */}
      <IssueLicenseModal
        open={issueModalOpen}
        onOpenChange={setIssueModalOpen}
        onSuccess={() => lic.refetch()}
      />

      {/* ── Revoke License Dialog (Moda page-24) ── */}
      <Dialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <DialogContent className='sm:max-w-md border-border bg-card'>
          <div className='flex items-center gap-3 text-destructive'>
            <AlertTriangle className='size-5 text-[#FF667A]' />
            <DialogTitle className='text-base font-bold text-foreground'>
              {isId ? 'Cabut lisensi ini?' : 'Revoke this license?'}
            </DialogTitle>
          </div>
          <DialogDescription className='text-xs text-muted-foreground pt-1'>
            {isId
              ? `Lisensi ${revokeTarget?.id} (${revokeTarget?.customer}) akan dicabut secara permanen. Semua panggilan API dari aplikasi host akan langsung ditolak.`
              : `License ${revokeTarget?.id} (${revokeTarget?.customer}) will be permanently revoked. All API calls from the host application will be rejected immediately.`}
          </DialogDescription>
          <DialogFooter className='pt-4 gap-2'>
            <Button variant='outline' size='sm' onClick={() => setRevokeTarget(null)}>
              {isId ? 'Batal' : 'Cancel'}
            </Button>
            <Button
              size='sm'
              className='bg-[#FF667A] hover:bg-[#FF667A]/90 text-white'
              onClick={() => {
                if (revokeTarget) revokeMut.mutate(revokeTarget.fullId)
              }}
            >
              {isId ? 'Ya, cabut sekarang' : 'Yes, revoke now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Contextual License Quick-Inspection Drawer (Moda page-12 contextual inspection) ── */}
      <Sheet open={!!selectedLicense} onOpenChange={(open) => !open && setSelectedLicense(null)}>
        <SheetContent side='right' className='w-full sm:max-w-md bg-card/95 backdrop-blur-xl border-l border-border p-6 flex flex-col gap-6 overflow-y-auto'>
          <SheetHeader className='space-y-1.5 text-left'>
            <div className='flex items-center justify-between'>
              <span className='font-mono text-xs font-bold text-[#7778FF] bg-[#7778FF]/10 px-2 py-0.5 rounded-md border border-[#7778FF]/20'>
                {selectedLicense?.fullId}
              </span>
              <span className='rounded-md bg-muted px-2 py-0.5 text-xs font-bold text-foreground'>
                {selectedLicense?.plan}
              </span>
            </div>
            <SheetTitle className='text-lg font-bold text-foreground pt-1'>
              {selectedLicense?.customer}
            </SheetTitle>
            <SheetDescription className='text-xs font-mono text-muted-foreground'>
              {selectedLicense?.domain}
            </SheetDescription>
          </SheetHeader>

          {selectedLicense && (
            <div className='space-y-5 text-xs flex-1'>
              {/* Status Badge Strip */}
              <div className='flex items-center justify-between p-3 rounded-xl border border-border bg-card'>
                <span className='text-muted-foreground'>{isId ? 'Status Lisensi' : 'License Status'}</span>
                {selectedLicense.status === 'active' && (
                  <span className='inline-flex items-center gap-1.5 text-[#39D6A0] font-bold'>
                    <span className='size-2 rounded-full bg-[#39D6A0] shadow-[0_0_6px_#39D6A0]' /> {selectedLicense.statusLabel}
                  </span>
                )}
                {selectedLicense.status === 'expired' && (
                  <span className='inline-flex items-center gap-1.5 text-muted-foreground font-bold'>
                    <span className='size-2 rounded-full bg-muted-foreground' /> {selectedLicense.statusLabel}
                  </span>
                )}
                {selectedLicense.status === 'quota' && (
                  <span className='inline-flex items-center gap-1.5 text-[#FF667A] font-bold'>
                    <span className='size-2 rounded-xs bg-[#FF667A]' /> {selectedLicense.statusLabel}
                  </span>
                )}
                {selectedLicense.status === 'revoked' && (
                  <span className='inline-flex items-center gap-1.5 text-[#FF667A] font-bold'>
                    <span className='size-2 rounded-full border border-[#FF667A]' /> {selectedLicense.statusLabel}
                  </span>
                )}
              </div>

              {/* Quota Usage Breakdown */}
              <div className='rounded-xl border border-border p-4 bg-card space-y-3'>
                <div className='flex items-center justify-between'>
                  <span className='text-[11px] font-bold uppercase tracking-wider text-muted-foreground'>
                    {isId ? 'Penggunaan Kuota Token' : 'Token Quota Usage'}
                  </span>
                  <span className='font-mono font-bold text-foreground'>
                    {selectedLicense.percent}%
                  </span>
                </div>

                <div className='h-2.5 w-full rounded-full bg-muted/60 overflow-hidden shadow-inner'>
                  <div
                    className={cn(
                      'h-full rounded-full transition-all shadow-xs',
                      selectedLicense.percent === 100
                        ? 'bg-gradient-to-r from-red-500 to-[#FF667A]'
                        : selectedLicense.percent > 60
                        ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                        : 'bg-gradient-to-r from-[#7778FF] to-[#4CC9F0]'
                    )}
                    style={{ width: `${Math.min(100, selectedLicense.percent)}%` }}
                  />
                </div>

                <div className='flex justify-between font-mono text-[11px] pt-1'>
                  <span className='text-muted-foreground'>
                    {isId ? 'Terpakai' : 'Used'}: <strong className='text-foreground'>{selectedLicense.usedQuota}</strong>
                  </span>
                  <span className='text-muted-foreground'>
                    {isId ? 'Total Kuota' : 'Limit'}: <strong className='text-foreground'>{selectedLicense.totalQuota}</strong>
                  </span>
                </div>
              </div>

              {/* License Invariants & Details */}
              <div className='rounded-xl border border-border p-4 bg-card space-y-2.5'>
                <div className='text-[11px] font-bold uppercase tracking-wider text-muted-foreground'>
                  {isId ? 'Metadata Lisensi' : 'License Metadata'}
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>{isId ? 'Kedaluwarsa' : 'Expires At'}</span>
                  <span className='font-mono text-foreground'>{selectedLicense.expiresAt}</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>{isId ? 'Verifikasi Kriptografi' : 'Crypto Verification'}</span>
                  <span className='font-mono text-emerald-500 font-bold'>Ed25519 (Offline)</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>{isId ? 'Domain Terikat' : 'Bound Domain'}</span>
                  <span className='font-mono text-foreground'>{selectedLicense.domain}</span>
                </div>
              </div>

              {/* Skills terdaftar — dari data lisensi nyata (bila tersedia) */}
              <div className='rounded-xl border border-border p-4 bg-card space-y-2.5'>
                <div className='text-[11px] font-bold uppercase tracking-wider text-muted-foreground'>
                  {isId ? 'Skill Read-Only Terdaftar' : 'Registered Read-Only Skills'}
                </div>
                <div className='flex flex-wrap gap-1.5 pt-1'>
                  {(selectedLicense.skills?.length
                    ? selectedLicense.skills
                    : []
                  ).map((sk) => (
                    <span key={sk} className='rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-foreground border border-border/60'>
                      {sk}
                    </span>
                  ))}
                  {!selectedLicense.skills?.length && (
                    <span className='text-[11px] text-muted-foreground'>
                      {isId ? 'Tidak ada skill terdaftar pada lisensi ini.' : 'No skills registered on this license.'}
                    </span>
                  )}
                </div>
              </div>

              {/* Token sekali-lihat — TIDAK pernah tersimpan server-side (D-021) */}
              <div className='rounded-xl border border-border p-4 bg-card space-y-2'>
                <div className='text-[11px] font-bold uppercase tracking-wider text-muted-foreground'>
                  {isId ? 'Token Lisensi (Signed)' : 'Signed License Token'}
                </div>
                <p className='text-[11px] text-muted-foreground'>
                  {isId
                    ? 'Token hanya ditampilkan sekali saat penerbitan dan tidak pernah disimpan server-side. Gunakan "Terbitkan" untuk lisensi baru bila token hilang.'
                    : 'The token is shown once at issuance and never stored server-side. Issue a new license if the token is lost.'}
                </p>
              </div>
            </div>
          )}

          <SheetFooter className='flex-col gap-2 pt-4 border-t border-border'>
            <Button
              asChild
              className='w-full bg-[#7778FF] hover:bg-[#8F90FF] text-white text-xs h-9 font-semibold gap-1.5'
            >
              <Link
                to='/admin/licenses/$licenseId'
                params={{ licenseId: selectedLicense?.fullId || '' }}
              >
                <ExternalLink className='size-3.5' /> {isId ? 'Buka Halaman Lengkap →' : 'Open Full Page →'}
              </Link>
            </Button>
            {selectedLicense?.status !== 'revoked' && (
              <Button
                variant='outline'
                onClick={() => {
                  const target = selectedLicense
                  setSelectedLicense(null)
                  setRevokeTarget(target)
                }}
                className='w-full text-xs h-9 text-[#FF667A] hover:text-[#FF667A] border-[#FF667A]/30 hover:bg-[#FF667A]/10'
              >
                {isId ? 'Cabut Lisensi' : 'Revoke License'}
              </Button>
            )}
            <Button
              variant='ghost'
              onClick={() => setSelectedLicense(null)}
              className='w-full text-xs h-8 text-muted-foreground hover:text-foreground'
            >
              {isId ? 'Tutup Drawer' : 'Close Drawer'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
