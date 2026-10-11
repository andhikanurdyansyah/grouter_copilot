import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, ExternalLink, Loader2, Plus } from 'lucide-react'
import { useLanguage } from '@/context/language-provider'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fetchAdminSettings, patchAdminSettings, formatIDR } from '@/lib/grouter-api'

// Paket = SSOT server (settings.plans). Harga/kuota yang diedit di sini disimpan
// via PATCH /api/admin/settings — tanpa state mock, tanpa toast palsu.
type Plan = {
  key: string
  name: string
  amount: number
  currency: string
  quota?: string
  quotaTokens?: number | null
  features?: string[]
  expiresInDays?: number
  active?: boolean
}

type Draft = { amount: string; quotaTokens: string }

export function AdminPackages() {
  const { language, t } = useLanguage()
  const isId = language === 'id'
  const qc = useQueryClient()

  const settings = useQuery({ queryKey: ['admin-settings'], queryFn: fetchAdminSettings })
  const plans = ((settings.data?.plans ?? []) as Plan[]).filter((p) => p.active !== false)

  const [drafts, setDrafts] = useState<Record<string, Draft>>({})

  const draftOf = (p: Plan): Draft => {
    const d = drafts[p.key]
    if (d) return d
    return {
      amount: p.amount != null ? String(p.amount) : '0',
      quotaTokens: p.quotaTokens != null ? String(p.quotaTokens) : '',
    }
  }
  const isDirty = (p: Plan) => {
    const d = drafts[p.key]
    if (!d) return false
    return d.amount !== String(p.amount ?? 0) || d.quotaTokens !== String(p.quotaTokens ?? '')
  }
  const dirtyCount = plans.filter(isDirty).length

  const saveMut = useMutation({
    mutationFn: async () => {
      const next = plans.map((p) => {
        const d = drafts[p.key]
        if (!d) return p
        const amount = Number(d.amount.replace(/[^0-9]/g, '')) || 0
        const qt = d.quotaTokens.trim() === '' ? null : Number(d.quotaTokens.replace(/[^0-9]/g, '')) || 0
        return { ...p, amount, quotaTokens: qt }
      })
      return patchAdminSettings({ plans: next })
    },
    onSuccess: () => {
      setDrafts({})
      qc.invalidateQueries({ queryKey: ['admin-settings'] })
      qc.invalidateQueries({ queryKey: ['public-plans'] })
    },
  })

  // Buat paket baru → langsung PATCH plans + key otomatis dari nama.
  const [newOpen, setNewOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newQuota, setNewQuota] = useState('')
  const [newDays, setNewDays] = useState('90')
  const [newError, setNewError] = useState('')

  const createMut = useMutation({
    mutationFn: async () => {
      const slug =
        newName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ||
        `plan-${Date.now()}`
      if (plans.some((p) => p.key === slug)) throw new Error(isId ? 'Slug sudah dipakai paket lain.' : 'Slug already used by another plan.')
      const plan: Plan = {
        key: slug,
        name: newName.trim(),
        amount: Number(newAmount.replace(/[^0-9]/g, '')) || 0,
        currency: 'IDR',
        quota: undefined,
        quotaTokens: newQuota.trim() === '' ? null : Number(newQuota.replace(/[^0-9]/g, '')) || 0,
        features: ['core'],
        expiresInDays: Number(newDays.replace(/[^0-9]/g, '')) || 90,
        active: true,
      }
      return patchAdminSettings({ plans: [...plans, plan] })
    },
    onSuccess: () => {
      setNewOpen(false)
      setNewName('')
      setNewAmount('')
      setNewQuota('')
      setNewDays('90')
      setNewError('')
      qc.invalidateQueries({ queryKey: ['admin-settings'] })
      qc.invalidateQueries({ queryKey: ['public-plans'] })
    },
    onError: (e: unknown) => setNewError(e instanceof Error ? e.message : 'gagal'),
  })

  const saving = saveMut.isPending || createMut.isPending
  const licensesByPlan = useMemo(() => new Map<string, number>(), [])
  void licensesByPlan

  return (
    <div className='space-y-6 animate-fade-in relative'>
      {/* ── Top Header Row ── */}
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight text-foreground'>
            {isId ? 'Paket & kebijakan AI' : 'Plans & AI Policy'}
          </h1>
          <p className='text-xs sm:text-sm text-muted-foreground mt-0.5'>
            {isId
              ? 'Harga dihitung di server dari daftar paket ini. Perubahan berlaku untuk pembelian baru, bukan lisensi berjalan.'
              : 'Prices are resolved on the server from this plan list. Changes apply to new purchases, not active licenses.'}
          </p>
        </div>

        <div className='flex items-center gap-3'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setNewOpen(true)}
            className='h-9 gap-1.5 border-border bg-card/60 hover:bg-muted text-xs sm:text-sm font-medium interactive-press'
          >
            <Plus className='size-3.5' /> {t('btn_new_plan')}
          </Button>

          <Button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || dirtyCount === 0}
            className='h-9 gap-1.5 bg-[#7778FF] hover:bg-[#8F90FF] text-white font-medium text-xs sm:text-sm rounded-lg'
          >
            {saveMut.isPending ? (
              <Loader2 className='size-3.5 animate-spin' />
            ) : (
              t('btn_save_changes')
            )}
            {dirtyCount > 0 && (
              <span className='ml-1 rounded-full bg-white/20 px-1.5 text-[10px] font-bold'>{dirtyCount}</span>
            )}
          </Button>
        </div>
      </div>

      {saveMut.isError && (
        <div className='rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs font-semibold text-destructive'>
          {isId ? 'Gagal menyimpan: ' : 'Save failed: '}
          {saveMut.error instanceof Error ? saveMut.error.message : 'unknown'}
        </div>
      )}

      {/* ── Plan Cards dari server ── */}
      {settings.isLoading ? (
        <div className='rounded-xl border border-border bg-card/70 p-8 text-sm text-muted-foreground'>
          {isId ? 'Memuat paket dari server…' : 'Loading plans from server…'}
        </div>
      ) : plans.length === 0 ? (
        <div className='rounded-xl border border-border bg-card/70 p-8 text-sm text-muted-foreground'>
          {isId
            ? 'Belum ada paket aktif. Buat paket pertama untuk membuka penjualan.'
            : 'No active plans yet. Create the first plan to open sales.'}
        </div>
      ) : (
        <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5'>
          {plans.map((p) => {
            const d = draftOf(p)
            return (
              <div
                key={p.key}
                className={`rounded-xl border bg-card/80 p-5 card-3d hover-lift-3d bevel-shine space-y-4 ${
                  isDirty(p) ? 'border-[#7778FF]' : 'border-border/80'
                }`}
              >
                <div className='flex items-start justify-between'>
                  <div>
                    <h2 className='text-base font-bold text-foreground'>{p.name}</h2>
                    <p className='text-xs text-muted-foreground font-mono mt-0.5'>
                      {p.key} · {p.expiresInDays ?? '—'} {isId ? 'hari' : 'days'}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      p.active !== false
                        ? 'bg-emerald-500/10 text-emerald-500'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    ● {p.active !== false ? (isId ? 'Publik' : 'Public') : isId ? 'Nonaktif' : 'Inactive'}
                  </span>
                </div>

                <div className='space-y-3 pt-1 text-xs'>
                  <div className='space-y-1.5'>
                    <label className='text-muted-foreground font-semibold'>
                      {isId ? 'Harga (IDR)' : 'Price (IDR)'}
                    </label>
                    <div className='flex items-center rounded-lg border border-border bg-muted/40 px-3 py-2 gap-2'>
                      <span className='text-muted-foreground font-bold'>Rp</span>
                      <input
                        value={d.amount}
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [p.key]: { ...d, amount: e.target.value } }))
                        }
                        inputMode='numeric'
                        className='w-full bg-transparent text-foreground font-extrabold font-mono outline-none'
                      />
                    </div>
                    <p className='text-[11px] text-muted-foreground'>
                      {isId ? 'Sekali bayar untuk masa aktif paket.' : 'One-time price for the plan period.'}
                    </p>
                  </div>

                  <div className='space-y-1.5'>
                    <label className='text-muted-foreground font-semibold'>
                      {isId ? 'Kuota token per lisensi' : 'Token quota per license'}
                    </label>
                    <input
                      value={d.quotaTokens}
                      onChange={(e) =>
                        setDrafts((prev) => ({ ...prev, [p.key]: { ...d, quotaTokens: e.target.value } }))
                      }
                      inputMode='numeric'
                      placeholder={isId ? 'kosong = tanpa kuota AI' : 'empty = no AI quota'}
                      className='w-full rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-foreground font-bold outline-none focus:ring-1 focus:ring-[#7778FF]/40'
                    />
                  </div>

                  <div className='pt-1 flex items-center gap-2 text-[11px] text-muted-foreground font-mono'>
                    <div className='size-3.5 rounded-full bg-[#7778FF]' />
                    {p.quota ? p.quota : formatIDR(p.amount)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Bottom Card: Kebijakan Gateway D-021 ── */}
      <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-border/80 bg-card/80 p-5 card-3d bevel-shine'>
        <div className='flex items-center gap-4'>
          <img src='/app/images/grouter-hub-cluster.png' alt='Gateway' className='size-12 shrink-0 object-contain' />
          <div>
            <h2 className='text-sm font-bold text-foreground'>
              {isId ? 'Kebijakan gateway · D-021' : 'Gateway Policy · D-021'}
            </h2>
            <p className='text-xs text-muted-foreground max-w-2xl mt-0.5 leading-relaxed'>
              {isId
                ? 'Satu kredensial layanan di server. Kunci provider tidak pernah diserahkan ke aplikasi pelanggan; semua permintaan AI diaudit di ledger.'
                : 'Single service credential on the server. Provider keys are never handed to customer applications; all AI requests are audited in the ledger.'}
            </p>
          </div>
        </div>

        <Button
          variant='outline'
          size='sm'
          className='gap-1.5 text-xs text-foreground shrink-0'
          onClick={() => window.open('https://github.com/andhikanurdyansyah/grouter_copilot/blob/main/docs/15-decision-log.md', '_blank')}
        >
          {isId ? 'Baca dokumen ↗' : 'Read docs ↗'} <ExternalLink className='size-3' />
        </Button>
      </div>

      {/* Create New Plan Dialog */}
      <Dialog open={newOpen} onOpenChange={(o) => { setNewOpen(o); if (!o) setNewError('') }}>
        <DialogContent className='sm:max-w-md border-border bg-card/95 backdrop-blur-xl shadow-2xl'>
          <DialogHeader>
            <DialogTitle className='text-base font-bold text-foreground'>
              {isId ? 'Buat Paket Langganan Baru' : 'Create New Subscription Plan'}
            </DialogTitle>
            <DialogDescription className='text-xs text-muted-foreground'>
              {isId
                ? 'Paket baru langsung tersimpan di server dan muncul di halaman pembelian pelanggan.'
                : 'New plans are saved on the server and appear on the customer purchase page immediately.'}
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!newName.trim()) return
              setNewError('')
              createMut.mutate()
            }}
            className='space-y-4 py-2'
          >
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1.5'>
                <Label htmlFor='plan-name' className='text-xs font-semibold'>
                  {isId ? 'Nama Paket' : 'Plan Name'}
                </Label>
                <Input
                  id='plan-name'
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={isId ? 'mis. Scale' : 'e.g. Scale'}
                  required
                  className='text-xs'
                />
              </div>
              <div className='space-y-1.5'>
                <Label htmlFor='plan-days' className='text-xs font-semibold'>
                  {isId ? 'Masa Aktif (hari)' : 'Duration (days)'}
                </Label>
                <Input
                  id='plan-days'
                  value={newDays}
                  onChange={(e) => setNewDays(e.target.value)}
                  inputMode='numeric'
                  required
                  className='text-xs font-mono'
                />
              </div>
            </div>

            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1.5'>
                <Label htmlFor='plan-price' className='text-xs font-semibold'>
                  {isId ? 'Harga (IDR)' : 'Price (IDR)'}
                </Label>
                <Input
                  id='plan-price'
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  inputMode='numeric'
                  required
                  className='text-xs font-mono'
                />
              </div>
              <div className='space-y-1.5'>
                <Label htmlFor='plan-quota' className='text-xs font-semibold'>
                  {isId ? 'Kuota Token' : 'Token Quota'}
                </Label>
                <Input
                  id='plan-quota'
                  value={newQuota}
                  onChange={(e) => setNewQuota(e.target.value)}
                  inputMode='numeric'
                  placeholder={isId ? 'kosong = tanpa kuota AI' : 'empty = no AI quota'}
                  className='text-xs font-mono'
                />
              </div>
            </div>

            {newError && (
              <div className='rounded-lg bg-destructive/15 text-destructive text-xs font-semibold p-2'>
                {newError}
              </div>
            )}

            <DialogFooter className='pt-2 gap-2'>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => setNewOpen(false)}
                className='text-xs'
              >
                {isId ? 'Batal' : 'Cancel'}
              </Button>
              <Button
                type='submit'
                size='sm'
                disabled={createMut.isPending}
                className='bg-[#7778FF] hover:bg-[#8F90FF] text-white text-xs font-bold interactive-press'
              >
                {createMut.isPending ? <Loader2 className='size-3 animate-spin' /> : isId ? 'Simpan Paket' : 'Save Plan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Save Toast (hanya setelah mutasi sukses sungguhan) */}
      {!saveMut.isPending && saveMut.isSuccess && dirtyCount === 0 && !saveMut.isError && (
        <div className='fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border border-border bg-card shadow-2xl px-4 py-3'>
          <div className='size-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center'>
            <Check className='size-3' />
          </div>
          <span className='text-xs font-semibold text-foreground'>
            {isId ? 'Perubahan paket tersimpan di server.' : 'Plan changes saved to the server.'}
          </span>
        </div>
      )}
    </div>
  )
}
