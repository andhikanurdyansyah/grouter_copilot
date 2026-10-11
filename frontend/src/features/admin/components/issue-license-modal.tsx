import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { issueLicense, fetchPlans } from '@/lib/grouter-api'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { EyeOff, Copy, Check, Download, ShieldCheck } from 'lucide-react'
import { useLanguage } from '@/context/language-provider'

type IssueLicenseModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function IssueLicenseModal({ open, onOpenChange, onSuccess }: IssueLicenseModalProps) {
  const { language } = useLanguage()
  const isId = language === 'id'

  const [step, setStep] = useState<1 | 2>(1)
  const [customer, setCustomer] = useState('')
  const [planKey, setPlanKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  // Katalog paket REAL dari server (SSOT: plan key + expiresInDays).
  const plansQ = useQuery({ queryKey: ['plans'], queryFn: fetchPlans })
  const planOptions = (plansQ.data?.plans ?? []).filter((p) => p.amount > 0 && p.key !== 'custom')
  const selectedPlanObj = planOptions.find((p) => p.key === planKey) ?? planOptions[0]

  // Generated token payload for step 2
  const [issuedLicense, setIssuedLicense] = useState<{
    id: string
    token: string
    quota: string
    expiresAt: string
  } | null>(null)


  const issueMut = useMutation({
    mutationFn: () =>
      issueLicense({
        customer: customer.trim() || undefined,
        planKey: selectedPlanObj?.key ?? null,
        expiresInDays: selectedPlanObj?.expiresInDays ?? null,
      }),
    onSuccess: (data) => {
      const quota = (data as { license?: { quota?: { limit?: number | null } | null } }).license?.quota?.limit
      setIssuedLicense({
        id: data.license.id,
        token: data.token ?? '',
        quota: quota != null ? quota.toLocaleString('id-ID') + ' token' : '—',
        expiresAt: '—',
      })
      setStep(2)
      onSuccess?.()
    },
  })

  const handleNext = () => {
    if (!customer.trim()) return
    issueMut.mutate()
  }

  const handleCopy = () => {
    if (issuedLicense) {
      navigator.clipboard.writeText(issuedLicense.token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  const handleDownloadTxt = () => {
    if (!issuedLicense) return
    const content = `gRouter Copilot License
ID: ${issuedLicense.id}
Customer: ${customer}
Plan: ${selectedPlanObj?.name ?? '-'}
Quota: ${issuedLicense.quota} tokens
Expires: ${issuedLicense.expiresAt}
Token:
${issuedLicense.token}
`
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `license-${issuedLicense.id}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleClose = () => {
    setStep(1)
    setCopied(false)
    setConfirmed(false)
    setIssuedLicense(null)
    onOpenChange(false)
    if (onSuccess) onSuccess()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className='sm:max-w-xl p-0 overflow-hidden border border-border/80 bg-card/95 backdrop-blur-xl shadow-2xl rounded-2xl'>
        <div className='p-6'>
          {step === 1 ? (
            /* Step 1: Form */
            <div className='space-y-5'>
              <div className='flex items-center justify-between border-b border-border/70 pb-4'>
                <div className='flex items-center gap-3'>
                  <img src='/app/images/grouter-logo-64.png' alt='gRouter' className='size-8 rounded-lg shadow-sm' />
                  <div>
                    <DialogTitle className='text-lg font-bold text-foreground'>
                      {isId ? 'Terbitkan lisensi baru' : 'Issue New License'}
                    </DialogTitle>
                    <DialogDescription className='text-xs text-muted-foreground'>
                      {isId ? 'Langkah 1 dari 2 · Masukkan data pelanggan' : 'Step 1 of 2 · Enter customer details'}
                    </DialogDescription>
                  </div>
                </div>
              </div>

              <div className='space-y-4 pt-1'>
                <div className='space-y-1.5'>
                  <label className='text-xs font-semibold text-muted-foreground uppercase tracking-wider'>
                    {isId ? 'Nama Pelanggan' : 'Customer Name'}
                  </label>
                  <input
                    type='text'
                    value={customer}
                    onChange={(e) => setCustomer(e.target.value)}
                    className='w-full rounded-lg border border-border bg-card/60 px-3.5 py-2 text-sm text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary'
                  />
                </div>

                <div className='space-y-1.5'>
                  <label className='text-xs font-semibold text-muted-foreground uppercase tracking-wider'>
                    {isId ? 'Nama Pelanggan' : 'Customer Name'}
                  </label>
                  <input
                    id='issue-customer'
                    type='text'
                    value={customer}
                    onChange={(e) => setCustomer(e.target.value)}
                    placeholder={isId ? 'mis. PT Maju Digital' : 'e.g. PT Maju Digital'}
                    className='w-full rounded-lg border border-border bg-card/60 px-3.5 py-2 text-sm text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary'
                  />
                </div>

                <div className='grid grid-cols-2 gap-3'>
                  <div className='space-y-1.5'>
                    <label className='text-xs font-semibold text-muted-foreground uppercase tracking-wider'>
                      {isId ? 'Paket Layanan' : 'Service Plan'}
                    </label>
                    <select
                      value={selectedPlanObj?.key ?? ''}
                      onChange={(e) => setPlanKey(e.target.value)}
                      className='w-full rounded-lg border border-border bg-card/60 px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary'
                    >
                      {planOptions.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.name} · {p.amount.toLocaleString('id-ID')} IDR · {p.expiresInDays}h
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className='space-y-1.5'>
                    <label className='text-xs font-semibold text-muted-foreground uppercase tracking-wider'>
                      {isId ? 'Masa Berlaku' : 'Duration'}
                    </label>
                    <div className='w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground'>
                      {selectedPlanObj ? `${selectedPlanObj.expiresInDays} ${isId ? 'hari' : 'days'}` : '—'}
                    </div>
                  </div>
                </div>
              </div>

              <div className='flex items-center justify-end gap-3 pt-4 border-t border-border/70'>
                <Button variant='outline' onClick={handleClose}>
                  {isId ? 'Batal' : 'Cancel'}
                </Button>
                <Button onClick={handleNext} disabled={issueMut.isPending} className='bg-[#7778FF] hover:bg-[#8F90FF] text-white'>
                  {issueMut.isPending ? (isId ? 'Menerbitkan…' : 'Issuing…') : (isId ? 'Terbitkan' : 'Issue')}
                </Button>
              </div>
            </div>
          ) : (
            /* Step 2: Moda Page-16 1:1 Token Reveal */
            <div className='space-y-5'>
              <div className='flex items-center justify-between border-b border-border/70 pb-4'>
                <div className='flex items-center gap-3'>
                  <img src='/app/images/grouter-logo-64.png' alt='gRouter' className='size-8 rounded-lg shadow-sm' />
                  <div>
                    <DialogTitle className='text-lg font-bold text-foreground'>
                      {isId ? 'Lisensi diterbitkan' : 'License Issued'}
                    </DialogTitle>
                    <DialogDescription className='text-xs text-muted-foreground'>
                      {isId
                        ? `Langkah 2 dari 2 · ${customer} · ${selectedPlanObj?.name ?? ''}`
                        : `Step 2 of 2 · ${customer} · ${selectedPlanObj?.name ?? ''}`}
                    </DialogDescription>
                  </div>
                </div>
              </div>

              {/* Warning Banner */}
              <div className='flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-500'>
                <EyeOff className='size-4 shrink-0' />
                <span>
                  {isId
                    ? 'Token hanya tampil sekali. Tidak akan muncul di daftar, log, atau URL.'
                    : 'The token is only displayed once. It will never appear in lists, logs, or URLs.'}
                </span>
              </div>

              {/* Token Reveal Box */}
              <div className='space-y-2'>
                <label className='text-xs font-semibold text-muted-foreground uppercase tracking-wider'>
                  {isId ? 'TOKEN LISENSI' : 'LICENSE TOKEN'}
                </label>
                <div className='relative flex items-center justify-between rounded-xl border border-border bg-muted/40 p-3.5 font-mono text-xs text-foreground'>
                  <span id='issued-token' className='break-all pr-20 select-all'>{issuedLicense?.token}</span>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={handleCopy}
                    className='shrink-0 h-8 gap-1.5 border-border bg-card hover:bg-muted text-xs'
                  >
                    {copied ? <Check className='size-3.5 text-emerald-500' /> : <Copy className='size-3.5' />}
                    {copied ? (isId ? 'Tersalin' : 'Copied') : (isId ? 'Salin' : 'Copy')}
                  </Button>
                </div>
                {copied && (
                  <p className='text-xs text-emerald-500 flex items-center gap-1.5 pt-1'>
                    <Check className='size-3.5' /> {isId ? 'Disalin ke clipboard' : 'Copied to clipboard'}
                  </p>
                )}
              </div>

              {/* Metadata List */}
              <div className='rounded-xl border border-border/70 bg-card/50 p-4 space-y-2 text-xs'>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>{isId ? 'ID lisensi' : 'License ID'}</span>
                  <span className='font-mono font-medium text-foreground'>{issuedLicense?.id}</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>{isId ? 'Kuota token' : 'Token quota'}</span>
                  <span className='font-mono font-medium text-foreground'>{issuedLicense?.quota}</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>{isId ? 'Berlaku hingga' : 'Valid until'}</span>
                  <span className='font-medium text-foreground'>{issuedLicense?.expiresAt}</span>
                </div>
                <div className='flex justify-between items-center'>
                  <span className='text-muted-foreground'>{isId ? 'Tanda tangan' : 'Signature'}</span>
                  <span className='font-medium text-emerald-500 flex items-center gap-1'>
                    <ShieldCheck className='size-3.5' /> Ed25519 · {isId ? 'terverifikasi server' : 'server verified'}
                  </span>
                </div>
              </div>

              {/* Confirmation Checkbox */}
              <label className='flex items-center gap-2.5 cursor-pointer pt-1'>
                <input
                  type='checkbox'
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className='size-4 rounded border-border text-primary focus:ring-primary'
                />
                <span className='text-xs text-muted-foreground'>
                  {isId
                    ? 'Saya sudah menyimpan token di tempat aman'
                    : 'I have saved the token in a secure location'}
                </span>
              </label>

              {/* Footer Actions */}
              <div className='flex items-center justify-between pt-4 border-t border-border/70'>
                <span className='text-xs text-muted-foreground'>Esc {isId ? 'untuk menutup' : 'to close'}</span>
                <div className='flex items-center gap-2.5'>
                  <Button variant='outline' size='sm' onClick={handleDownloadTxt} className='gap-1.5'>
                    <Download className='size-3.5' /> {isId ? 'Unduh .txt' : 'Download .txt'}
                  </Button>
                  <Button
                    size='sm'
                    onClick={handleClose}
                    disabled={!confirmed}
                    className='bg-[#7778FF] hover:bg-[#8F90FF] text-white'
                  >
                    {isId ? 'Selesai' : 'Done'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
