import { useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchAdminLicenses, fetchLedger } from '@/lib/grouter-api'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft,
  Check,
  Slash,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'
import { useLanguage } from '@/context/language-provider'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogHeader,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export function AdminLicenseDetail() {
  const { licenseId } = useParams({ from: '/_authenticated/admin/licenses_/$licenseId' })
  const { language, t } = useLanguage()
  const isId = language === 'id'

  const [activeTab, setActiveTab] = useState<'ringkasan' | 'ledger' | 'skill' | 'audit'>('ringkasan')
  const [revokeModalOpen, setRevokeModalOpen] = useState(false)
  const [renewModalOpen, setRenewModalOpen] = useState(false)
  const [renewDuration, setRenewDuration] = useState('30')
  const [renewQuota, setRenewQuota] = useState('1000000')
  
  const licenses = useQuery({ queryKey: ['admin-licenses'], queryFn: fetchAdminLicenses })
  const ledger = useQuery({
    queryKey: ['admin-ledger', 'license', licenseId],
    queryFn: () => fetchLedger({ licenseId, limit: 10 }),
  })

  // Data REAL: lisensi dari /api/admin/licenses + kuota & request dari ledger gateway.
  const licRecord = (licenses.data?.licenses ?? []).find((l) => l.id === licenseId) ?? null
  const usageRows = ((ledger.data?.records ?? []) as Array<{
    quota?: { usedTokens?: number; limit?: number | null; planKey?: string | null }
    status?: string
  }>)
  const quotaInfo = usageRows.find((r) => r.quota)?.quota ?? null
  const usedTokens = quotaInfo?.usedTokens ?? 0
  const totalQuotaN = quotaInfo?.limit ?? null
  const percent = totalQuotaN ? Math.min(100, Math.round((usedTokens / totalQuotaN) * 100)) : 0
  const fmtDateID = (value?: string | number | null) => {
    if (value == null || value === '') return '—'
    const date = new Date(value)
    return Number.isNaN(date.getTime())
      ? '—'
      : date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const licenseData = {
    customer: licRecord?.customer ?? '—',
    domain: licRecord?.planKey ?? '—',
    plan: licRecord?.planKey ?? '—',
    pricePerDay: '—',
    issuedAt: fmtDateID(licRecord?.createdAt ?? null),
    expiresAt: fmtDateID(licRecord?.expiresAt ?? null),
    owner: (licRecord?.accountId as string | null | undefined) ?? '—',
    status: String(licRecord?.status ?? (licRecord ? 'active' : 'unknown')),
    usedQuota: usedTokens.toLocaleString('id-ID'),
    totalQuota: totalQuotaN != null ? totalQuotaN.toLocaleString('id-ID') : '—',
    percent,
  }

  // Skill = fitur lisensi dari server (features[]), usage dari ledger (belum per-skill → tampil '—').
  const skills = ((licRecord?.features ?? []) as string[]).map((name) => ({
    name,
    allowed: true,
    usage: '—',
    errorLabel: '',
  }))

  const recentRequests = ((ledger.data?.records ?? []) as Array<{
    requestId: string; createdAt: number | null
    inputTokens: number | null; outputTokens: number | null; status: string
  }>).map((r) => ({
    id: r.requestId.length > 15 ? r.requestId.slice(0, 9) + '...' + r.requestId.slice(-4) : r.requestId,
    time: r.createdAt ? new Date(r.createdAt).toLocaleTimeString('id-ID') : '—',
    skill: '—',
    in: (r.inputTokens ?? 0).toLocaleString('id-ID'),
    out: (r.outputTokens ?? 0).toLocaleString('id-ID'),
    status: r.status,
    type: r.status === 'ok' ? 'success' : 'error',
  }))

  // Audit log: sementara hanya penerbitan lisensi (server belum menyimpan audit trail per lisensi).
  const auditLogs = licRecord
    ? [{ event: 'license.issued', actor: 'admin (Operator Console)', time: fmtDateID(licRecord.createdAt ?? null), details: `Plan ${licRecord.planKey ?? '—'} · Ed25519` }]
    : []

  const [renewError, setRenewError] = useState(false)

  // renewError ditampilkan di header bila true (server belum punya endpoint renew)
  const handleRenewSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Pembaruan lisensi membutuhkan endpoint khusus di server (belum tersedia).
    // Form dinonaktifkan agar tidak menampilkan keberhasilan palsu.
    setRenewError(true)
  }

  return (
    <div className='space-y-6 animate-fade-in'>
      {renewError && (
        <div className='rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-500 font-medium'>
          {isId ? 'Pembaruan lisensi belum tersedia di server — hubungi operator.' : 'License renewal is not available server-side yet — contact an operator.'}
        </div>
      )}
      {/* ── Top Header Row ── */}
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <div className='space-y-1'>
          <div className='flex items-center gap-3'>
            <Button asChild variant='ghost' size='icon' className='size-8 -ml-2 text-muted-foreground hover:text-foreground'>
              <Link to='/admin/licenses'>
                <ArrowLeft className='size-4' />
              </Link>
            </Button>
            <h1 className='text-2xl font-bold tracking-tight text-foreground'>
              {licenseData.customer}
            </h1>
            <span className='inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-500'>
              <span className='size-1.5 rounded-full bg-emerald-500' />
              {isId ? 'Aktif' : 'Active'}
            </span>
          </div>
          <p className='text-xs sm:text-sm text-muted-foreground font-mono pl-8'>
            {licenseId.slice(0, 16)}... · {licenseData.domain} · {licenseData.plan}
          </p>
        </div>

        <div className='flex items-center gap-3 pl-8 sm:pl-0'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setRenewModalOpen(true)}
            className='h-9 border-border bg-card/60 hover:bg-muted text-xs sm:text-sm font-medium interactive-press'
          >
            {isId ? 'Perpanjang' : 'Renew'}
          </Button>
          <Button
            size='sm'
            onClick={() => setRevokeModalOpen(true)}
            className='h-9 border border-[#FF667A]/40 bg-transparent hover:bg-[#FF667A]/15 text-[#FF667A] text-xs sm:text-sm font-medium interactive-press'
          >
            {isId ? 'Cabut lisensi' : 'Revoke license'}
          </Button>
        </div>
      </div>

      {/* ── Tabs Navigation ── */}
      <div className='border-b border-border'>
        <div
          role='tablist'
          aria-label={isId ? 'Navigasi detail lisensi' : 'License detail navigation'}
          className='flex items-center gap-6 text-sm font-medium'
        >
          {[
            { id: 'ringkasan', label: isId ? 'Ringkasan' : 'Overview' },
            { id: 'ledger', label: 'Ledger' },
            { id: 'skill', label: 'Skill' },
            { id: 'audit', label: isId ? 'Log audit' : 'Audit log' },
          ].map((tab) => (
            <button
              key={tab.id}
              role='tab'
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              id={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id as Parameters<typeof setActiveTab>[0])}
              className={cn(
                'py-2.5 transition-colors border-b-2 -mb-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                activeTab === tab.id
                  ? 'border-[#7778FF] text-foreground font-semibold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab Content: Ringkasan ── */}
      {activeTab === 'ringkasan' && (
        <div className='space-y-6'>
          {/* Row 1: 3 Bento Cards with 3D Depth */}
          <div className='grid grid-cols-1 md:grid-cols-3 gap-5'>
            {/* Card 1: Detail */}
            <div className='rounded-xl border border-border/80 bg-card/80 p-5 card-3d hover-lift-3d bevel-shine space-y-4'>
              <h2 className='text-sm font-bold text-foreground'>
                Detail
              </h2>
              <div className='space-y-3 text-xs'>
                <div className='flex justify-between py-1 border-b border-border/50'>
                  <span className='text-muted-foreground'>{isId ? 'Paket' : 'Plan'}</span>
                  <span className='font-bold text-foreground'>{licenseData.plan} · {licenseData.pricePerDay}</span>
                </div>
                <div className='flex justify-between py-1 border-b border-border/50'>
                  <span className='text-muted-foreground'>{isId ? 'Diterbitkan' : 'Issued'}</span>
                  <span className='font-medium text-foreground'>{licenseData.issuedAt}</span>
                </div>
                <div className='flex justify-between py-1 border-b border-border/50'>
                  <span className='text-muted-foreground'>{isId ? 'Berakhir' : 'Expires'}</span>
                  <span className='font-medium text-foreground'>{licenseData.expiresAt}</span>
                </div>
                <div className='flex justify-between py-1'>
                  <span className='text-muted-foreground'>{isId ? 'Pemilik' : 'Owner'}</span>
                  <span className='font-mono font-bold text-foreground'>{licenseData.owner ?? '—'}</span>
                </div>
              </div>
            </div>

            {/* Card 2: Kuota token with 3D gradient progress */}
            <div className='rounded-xl border border-border/80 bg-card/80 p-5 card-3d hover-lift-3d bevel-shine space-y-3'>
              <div className='flex items-center justify-between'>
                <h2 className='text-sm font-bold text-foreground'>
                  {isId ? 'Kuota token' : 'Token quota'}
                </h2>
                <span className='text-xs text-muted-foreground font-mono'>
                  {isId ? 'periode ini' : 'this period'}
                </span>
              </div>
              <div className='space-y-2'>
                <div className='flex items-baseline justify-between'>
                  <span className='text-3xl font-extrabold font-mono tracking-tight text-foreground'>
                    {licenseData.percent}%
                  </span>
                  <span className='font-mono text-xs text-muted-foreground font-bold'>
                    {licenseData.usedQuota} / {licenseData.totalQuota}
                  </span>
                </div>
                <div className='h-2.5 w-full rounded-full bg-muted/60 overflow-hidden shadow-inner'>
                  <div
                    className='h-full rounded-full bg-gradient-to-r from-[#7778FF] to-[#4CC9F0] transition-all shadow-xs'
                    style={{ width: `${licenseData.percent}%` }}
                  />
                </div>
                <div className='flex justify-between text-[11px] text-muted-foreground font-mono'>
                  <span>0</span>
                  <span className='text-amber-500 font-bold'>{isId ? 'peringatan 80%' : '80% warning'}</span>
                </div>
              </div>
              <p className='text-[11px] text-muted-foreground leading-relaxed pt-1'>
                {isId
                  ? 'Token dipesan sinkron per permintaan dan direkonsiliasi dengan usage upstream. Permintaan gagal tidak ditagih.'
                  : 'Tokens are reserved synchronously per request and reconciled with upstream usage. Failed requests are not billed.'}
              </p>
            </div>

            {/* Card 3: Skill terdaftar */}
            <div className='rounded-xl border border-border/80 bg-card/80 p-5 card-3d hover-lift-3d bevel-shine space-y-3'>
              <div className='flex items-center justify-between'>
                <h2 className='text-sm font-bold text-foreground'>
                  {isId ? 'Skill terdaftar' : 'Registered skills'}
                </h2>
                <span className='text-xs text-muted-foreground font-mono'>
                  read-only
                </span>
              </div>
              <div className='space-y-2 font-mono text-xs'>
                {skills.map((skill, i) => (
                  <div
                    key={i}
                    className={cn(
                      'flex items-center justify-between rounded-lg p-2.5 transition-colors',
                      skill.allowed
                        ? 'border border-border/60 bg-muted/30 text-foreground'
                        : 'border border-[#FF667A]/30 bg-[#FF667A]/10 text-[#FF667A]'
                    )}
                  >
                    <div className='flex items-center gap-2'>
                      {skill.allowed ? (
                        <Check className='size-3.5 text-emerald-500' />
                      ) : (
                        <Slash className='size-3.5 text-[#FF667A]' />
                      )}
                      <span className='font-bold'>{skill.name}</span>
                    </div>
                    {!skill.allowed && (
                      <span className='font-sans text-[11px] font-bold'>
                        · {skill.errorLabel}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Permintaan terbaru Table */}
          <div className='rounded-xl border border-border/80 bg-card/80 p-5 card-3d bevel-shine space-y-4'>
            <div className='flex items-center justify-between'>
              <h2 className='text-sm sm:text-base font-semibold text-foreground'>
                {isId ? 'Permintaan terbaru' : 'Latest requests'}
              </h2>
              <Link to='/admin/ledger' className='text-xs font-medium text-[#7778FF] hover:underline flex items-center gap-1'>
                {t('btn_open_ledger')}
              </Link>
            </div>

            <div className='overflow-x-auto'>
              <table className='w-full text-left text-xs'>
                <thead>
                  <tr className='border-b border-border text-muted-foreground font-semibold uppercase tracking-wider'>
                    <th className='pb-2.5'>REQUEST ID</th>
                    <th className='pb-2.5'>{isId ? 'WAKTU' : 'TIME'}</th>
                    <th className='pb-2.5'>SKILL</th>
                    <th className='pb-2.5 text-right'>IN</th>
                    <th className='pb-2.5 text-right'>OUT</th>
                    <th className='pb-2.5 text-right'>STATUS</th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-border/60 font-mono'>
                  {recentRequests.map((req, i) => (
                    <tr key={i} className='hover:bg-muted/30 transition-colors'>
                      <td className='py-3 text-foreground font-medium'>{req.id}</td>
                      <td className='py-3 text-muted-foreground'>{req.time}</td>
                      <td className='py-3 text-foreground font-sans'>{req.skill}</td>
                      <td className='py-3 text-right text-foreground'>{req.in}</td>
                      <td className='py-3 text-right text-foreground'>{req.out}</td>
                      <td className='py-3 text-right'>
                        {req.type === 'success' ? (
                          <span className='inline-flex items-center gap-1 text-[#39D6A0] font-sans font-medium'>
                            <span className='size-1.5 rounded-full bg-[#39D6A0]' /> ok
                          </span>
                        ) : (
                          <span className='inline-flex items-center gap-1 text-[#FF667A] font-sans font-medium'>
                            <span className='size-1.5 rounded-xs bg-[#FF667A]' /> upstream
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab Content: Ledger ── */}
      {activeTab === 'ledger' && (
        <div id='panel-ledger' role='tabpanel' aria-labelledby='tab-ledger' className='space-y-4'>
          <div className='rounded-xl border border-border/80 bg-card/80 p-5 card-3d bevel-shine space-y-4'>
            <div className='flex items-center justify-between'>
              <div>
                <h2 className='text-sm sm:text-base font-semibold text-foreground'>
                  {isId ? 'Ledger Permintaan Lisensi' : 'License Request Ledger'}
                </h2>
                <p className='text-xs text-muted-foreground'>
                  {isId
                    ? 'Catatan konsumsi token, penolakan, dan rekonsiliasi gateway untuk lisensi ini.'
                    : 'Token consumption, rejections, and gateway reconciliation logs for this license.'}
                </p>
              </div>
              <Button asChild variant='outline' size='sm' className='h-8 text-xs font-semibold'>
                <Link to='/admin/ledger'>
                  {isId ? 'Buka Ledger Utama' : 'Open Main Ledger'}
                </Link>
              </Button>
            </div>

            <div className='overflow-x-auto'>
              <table className='w-full text-left text-xs'>
                <thead>
                  <tr className='border-b border-border text-muted-foreground font-semibold uppercase tracking-wider font-mono'>
                    <th className='pb-2.5'>REQUEST ID</th>
                    <th className='pb-2.5'>{isId ? 'WAKTU' : 'TIME'}</th>
                    <th className='pb-2.5'>SKILL</th>
                    <th className='pb-2.5 text-right'>IN</th>
                    <th className='pb-2.5 text-right'>OUT</th>
                    <th className='pb-2.5 text-right'>STATUS</th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-border/60 font-mono'>
                  {recentRequests.map((req, i) => (
                    <tr key={i} className='hover:bg-muted/30 transition-colors'>
                      <td className='py-3 text-foreground font-medium'>{req.id}</td>
                      <td className='py-3 text-muted-foreground'>{req.time}</td>
                      <td className='py-3 text-foreground font-sans'>{req.skill}</td>
                      <td className='py-3 text-right text-foreground font-bold'>{req.in}</td>
                      <td className='py-3 text-right text-foreground font-bold'>{req.out}</td>
                      <td className='py-3 text-right'>
                        {req.type === 'success' ? (
                          <span className='inline-flex items-center gap-1 text-[#39D6A0] font-sans font-medium'>
                            <span className='size-1.5 rounded-full bg-[#39D6A0]' /> ok
                          </span>
                        ) : (
                          <span className='inline-flex items-center gap-1 text-[#FF667A] font-sans font-medium'>
                            <span className='size-1.5 rounded-xs bg-[#FF667A]' /> upstream
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab Content: Skill ── */}
      {activeTab === 'skill' && (
        <div id='panel-skill' role='tabpanel' aria-labelledby='tab-skill' className='space-y-4'>
          <div className='rounded-xl border border-border/80 bg-card/80 p-5 card-3d bevel-shine space-y-4'>
            <div className='flex items-center justify-between'>
              <div>
                <h2 className='text-sm sm:text-base font-semibold text-foreground'>
                  {isId ? 'Konfigurasi Skill Read-Only' : 'Read-Only Skill Configuration'}
                </h2>
                <p className='text-xs text-muted-foreground'>
                  {isId
                    ? 'Klik baris skill untuk mengaktifkan atau menonaktifkan otorisasi pemanggilan.'
                    : 'Click any skill row to toggle invocation authorization.'}
                </p>
              </div>
            </div>

            <div className='space-y-2 font-mono text-xs'>
              {skills.map((skill, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex items-center justify-between rounded-xl p-3.5 transition-all cursor-pointer interactive-press',
                    skill.allowed
                      ? 'border border-border/80 bg-card/70 hover:border-emerald-500/40 text-foreground'
                      : 'border border-[#FF667A]/30 bg-[#FF667A]/10 text-[#FF667A]'
                  )}
                >
                  <div className='flex items-center gap-3'>
                    {skill.allowed ? (
                      <span className='size-6 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center shrink-0'>
                        <Check className='size-3.5' />
                      </span>
                    ) : (
                      <span className='size-6 rounded-full bg-[#FF667A]/20 text-[#FF667A] flex items-center justify-center shrink-0'>
                        <Slash className='size-3.5' />
                      </span>
                    )}
                    <div>
                      <span className='font-bold block text-sm font-sans'>{skill.name}</span>
                      <span className='text-[11px] text-muted-foreground font-mono'>
                        {skill.allowed ? (isId ? 'Otorisasi aktif · read-only' : 'Authorized · read-only') : (isId ? 'Ditolak · tidak diizinkan' : 'Denied · forbidden')}
                      </span>
                    </div>
                  </div>
                  <div className='text-right'>
                    <span className='font-mono font-bold text-foreground block'>{skill.usage}</span>
                    <span className='text-[10px] text-muted-foreground'>{isId ? 'panggilan' : 'calls'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab Content: Audit Log ── */}
      {activeTab === 'audit' && (
        <div id='panel-audit' role='tabpanel' aria-labelledby='tab-audit' className='space-y-4'>
          <div className='rounded-xl border border-border/80 bg-card/80 p-5 card-3d bevel-shine space-y-4'>
            <div>
              <h2 className='text-sm sm:text-base font-semibold text-foreground'>
                {isId ? 'Catatan Jejak Audit Keamanan' : 'Security Audit Trail'}
              </h2>
              <p className='text-xs text-muted-foreground'>
                {isId
                  ? 'Catatan tidak dapat diubah (append-only) untuk semua peristiwa lifecycle lisensi.'
                  : 'Immutable append-only records for all license lifecycle events.'}
              </p>
            </div>

            <div className='overflow-x-auto'>
              <table className='w-full text-left text-xs'>
                <thead>
                  <tr className='border-b border-border text-muted-foreground font-semibold uppercase tracking-wider font-mono'>
                    <th className='pb-2.5'>EVENT</th>
                    <th className='pb-2.5'>ACTOR</th>
                    <th className='pb-2.5'>{isId ? 'WAKTU' : 'TIME'}</th>
                    <th className='pb-2.5'>DETAILS</th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-border/60 font-mono'>
                  {auditLogs.map((log, i) => (
                    <tr key={i} className='hover:bg-muted/30 transition-colors'>
                      <td className='py-3 text-indigo-400 font-bold'>{log.event}</td>
                      <td className='py-3 text-foreground font-sans'>{log.actor}</td>
                      <td className='py-3 text-muted-foreground'>{log.time}</td>
                      <td className='py-3 text-muted-foreground font-sans'>{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Renew License Dialog ── */}
      <Dialog open={renewModalOpen} onOpenChange={setRenewModalOpen}>
        <DialogContent className='sm:max-w-md border-border bg-card/95 backdrop-blur-xl shadow-2xl'>
          <DialogHeader>
            <DialogTitle className='text-base font-bold text-foreground'>
              {isId ? 'Perpanjang Lisensi' : 'Renew License'}
            </DialogTitle>
            <DialogDescription className='text-xs text-muted-foreground'>
              {isId
                ? `Perpanjang masa aktif dan tambah kuota token untuk ${licenseData.customer}.`
                : `Extend validity and add token quota for ${licenseData.customer}.`}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRenewSubmit} className='space-y-4 py-2'>
            <div className='space-y-1.5'>
              <Label htmlFor='renew-duration' className='text-xs font-semibold'>
                {isId ? 'Tambah Masa Aktif' : 'Add Duration'}
              </Label>
              <select
                id='renew-duration'
                value={renewDuration}
                onChange={(e) => setRenewDuration(e.target.value)}
                className='w-full rounded-md border border-border bg-card px-3 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary'
              >
                <option value='30'>+30 {isId ? 'Hari' : 'Days'}</option>
                <option value='90'>+90 {isId ? 'Hari' : 'Days'}</option>
                <option value='365'>+1 {isId ? 'Tahun (365 Hari)' : 'Year (365 Days)'}</option>
              </select>
            </div>

            <div className='space-y-1.5'>
              <Label htmlFor='renew-quota' className='text-xs font-semibold'>
                {isId ? 'Tambah Kuota Token' : 'Add Token Quota'}
              </Label>
              <select
                id='renew-quota'
                value={renewQuota}
                onChange={(e) => setRenewQuota(e.target.value)}
                className='w-full rounded-md border border-border bg-card px-3 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary'
              >
                <option value='500000'>+500.000 Token</option>
                <option value='1000000'>+1.000.000 Token</option>
                <option value='2000000'>+2.000.000 Token</option>
                <option value='5000000'>+5.000.000 Token</option>
              </select>
            </div>

            {renewError && (
              <div className='flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-semibold'>
                <CheckCircle2 className='size-4' />
                <span>{isId ? 'Lisensi berhasil diperpanjang!' : 'License renewed successfully!'}</span>
              </div>
            )}

            <DialogFooter className='pt-2 gap-2'>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => setRenewModalOpen(false)}
                className='text-xs'
              >
                {isId ? 'Batal' : 'Cancel'}
              </Button>
              <Button
                type='submit'
                size='sm'
                className='bg-[#7778FF] hover:bg-[#8F90FF] text-white text-xs font-bold interactive-press'
              >
                {isId ? 'Simpan & Perpanjang' : 'Confirm & Renew'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Revoke Dialog */}
      <Dialog open={revokeModalOpen} onOpenChange={setRevokeModalOpen}>
        <DialogContent className='sm:max-w-md border-border bg-card'>
          <div className='flex items-center gap-3 text-destructive'>
            <AlertTriangle className='size-5 text-[#FF667A]' />
            <DialogTitle className='text-base font-bold text-foreground'>
              {isId ? 'Cabut lisensi ini?' : 'Revoke this license?'}
            </DialogTitle>
          </div>
          <DialogDescription className='text-xs text-muted-foreground pt-1'>
            {isId
              ? `Lisensi ${licenseId} (${licenseData.customer}) akan dicabut secara permanen. Semua panggilan API dari aplikasi host akan langsung ditolak.`
              : `License ${licenseId} (${licenseData.customer}) will be permanently revoked. All API calls from the host application will be rejected immediately.`}
          </DialogDescription>
          <DialogFooter className='pt-4 gap-2'>
            <Button variant='outline' size='sm' onClick={() => setRevokeModalOpen(false)}>
              {isId ? 'Batal' : 'Cancel'}
            </Button>
            <Button
              size='sm'
              className='bg-[#FF667A] hover:bg-[#FF667A]/90 text-white'
              onClick={() => setRevokeModalOpen(false)}
            >
              {isId ? 'Ya, cabut sekarang' : 'Yes, revoke now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
