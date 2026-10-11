import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchAdminSettings, patchAdminSettings } from '@/lib/grouter-api'
import { Button } from '@/components/ui/button'
import { Plus, Edit3, ExternalLink, CheckCircle2, Check } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLanguage } from '@/context/language-provider'
import { cn } from '@/lib/utils'

export function AdminPackages() {
  const { language, t } = useLanguage()
  const isId = language === 'id'
  const qc = useQueryClient()

  const [hasChanges, setHasChanges] = useState(true)
  const [proPrice, setProPrice] = useState('15.000')
  const [proTokens, setProTokens] = useState('2.000.000')
  const [proMaxTokens, setProMaxTokens] = useState(true)
  const [newPlanOpen, setNewPlanOpen] = useState(false)
  const [saveToast, setSaveToast] = useState(false)

  // New plan form state
  const [newPlanName, setNewPlanName] = useState('')
  const [newPlanSlug, setNewPlanSlug] = useState('')
  const [newPlanPrice, setNewPlanPrice] = useState('25.000')
  const [newPlanQuota, setNewPlanQuota] = useState('5.000.000')
  const [newPlanModel, setNewPlanModel] = useState('grouter/balanced')

  const settings = useQuery({ queryKey: ['admin-settings'], queryFn: fetchAdminSettings })

  const saveMut = useMutation({
    mutationFn: () => patchAdminSettings({}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] })
      setHasChanges(false)
      setSaveToast(true)
      setTimeout(() => setSaveToast(false), 3000)
    },
  })

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
              ? 'Harga dihitung di server. Perubahan berlaku untuk pembelian baru, bukan lisensi berjalan.'
              : 'Prices are calculated on the server. Changes apply to new purchases, not active licenses.'}
          </p>
        </div>

        <div className='flex items-center gap-3'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setNewPlanOpen(true)}
            className='h-9 gap-1.5 border-border bg-card/60 hover:bg-muted text-xs sm:text-sm font-medium interactive-press'
          >
            <Plus className='size-3.5' /> {t('btn_new_plan')}
          </Button>

          <Button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className='h-9 gap-1.5 bg-[#7778FF] hover:bg-[#8F90FF] text-white font-medium text-xs sm:text-sm rounded-lg shadow-sm interactive-press'
          >
            {saveMut.isPending ? 'Menyimpan...' : t('btn_save_changes')}
          </Button>
        </div>
      </div>

      {/* ── Unsaved Changes Alert Bar (Moda page-28) ── */}
      {hasChanges && (
        <div className='flex items-center justify-between rounded-xl border border-[#7778FF]/30 bg-[#7778FF]/10 p-3 px-4 shadow-2xs text-xs'>
          <div className='flex items-center gap-2.5 text-foreground'>
            <Edit3 className='size-3.5 text-[#7778FF]' />
            <span>
              {isId
                ? '2 perubahan belum disimpan · Pro: harga, Pro: max_tokens'
                : '2 unsaved changes · Pro: price, Pro: max_tokens'}
            </span>
          </div>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => setHasChanges(false)}
            className='h-7 text-xs text-muted-foreground hover:text-foreground'
          >
            {t('btn_discard')}
          </Button>
        </div>
      )}

      {/* ── 3 Pricing & AI Plan Cards with 3D Depth ── */}
      <div className='grid grid-cols-1 md:grid-cols-3 gap-5'>
        {/* Plan 1: Starter */}
        <div className='rounded-xl border border-border/80 bg-card/80 p-5 card-3d hover-lift-3d bevel-shine space-y-4'>
          <div className='flex items-start justify-between'>
            <div>
              <h2 className='text-base font-bold text-foreground'>Starter</h2>
              <p className='text-xs text-muted-foreground font-mono mt-0.5'>
                slug: starter · 54% {isId ? 'lisensi aktif' : 'active licenses'}
              </p>
            </div>
            <span className='inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-500'>
              ● {isId ? 'Publik' : 'Public'}
            </span>
          </div>

          <div className='space-y-3 pt-2 text-xs'>
            <div className='space-y-1.5'>
              <label className='text-muted-foreground font-semibold'>{isId ? 'Harga' : 'Price'}</label>
              <div className='flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono'>
                <span className='text-muted-foreground'>Rp <span className='text-foreground font-extrabold'>5.000</span></span>
                <span className='text-muted-foreground'>/{isId ? 'hari' : 'day'}</span>
              </div>
            </div>

            <div className='space-y-1.5'>
              <label className='text-muted-foreground font-semibold'>{isId ? 'Kuota token per lisensi' : 'Token quota per license'}</label>
              <div className='rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-foreground font-extrabold'>
                500.000
              </div>
            </div>

            <div className='space-y-1.5'>
              <label className='text-muted-foreground font-semibold'>Model</label>
              <select className='w-full rounded-lg border border-border bg-card/80 px-3 py-2 font-mono text-xs text-foreground focus:ring-1 focus:ring-primary'>
                <option>grouter/fast-mini</option>
                <option>grouter/balanced</option>
              </select>
            </div>

            <div className='pt-2 flex items-center gap-2.5'>
              <div className='size-3.5 rounded-full bg-[#7778FF]' />
              <span className='text-xs text-muted-foreground font-mono'>max_tokens 1.024 / {isId ? 'permintaan' : 'request'}</span>
            </div>
          </div>
        </div>

        {/* Plan 2: Pro (Selected / Editing) with 3D Glowing Ring */}
        <div className='rounded-xl border-2 border-[#7778FF] bg-card/95 p-5 card-3d bevel-shine space-y-4 relative shadow-[0_0_30px_rgba(119,120,255,0.25)] hover-lift-3d'>
          <div className='flex items-start justify-between'>
            <div>
              <h2 className='text-base font-extrabold text-foreground'>Pro</h2>
              <p className='text-xs text-muted-foreground font-mono mt-0.5'>
                slug: pro · 34% {isId ? 'lisensi aktif · diubah' : 'active licenses · edited'}
              </p>
            </div>
            <span className='inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-500'>
              ● {isId ? 'Publik' : 'Public'}
            </span>
          </div>

          <div className='space-y-3 pt-2 text-xs'>
            <div className='space-y-1.5'>
              <label className='text-muted-foreground font-semibold'>{isId ? 'Harga' : 'Price'}</label>
              <div className='flex items-center justify-between rounded-lg border-2 border-[#7778FF] bg-muted/50 px-3 py-2 font-mono shadow-inner'>
                <span className='text-muted-foreground'>Rp <span className='text-foreground font-extrabold'>{proPrice}</span></span>
                <span className='text-muted-foreground'>/{isId ? 'hari' : 'day'}</span>
              </div>
            </div>

            <div className='space-y-1.5'>
              <label className='text-muted-foreground font-semibold'>{isId ? 'Kuota token per lisensi' : 'Token quota per license'}</label>
              <div className='rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-foreground font-extrabold'>
                {proTokens}
              </div>
            </div>

            <div className='space-y-1.5'>
              <label className='text-muted-foreground font-semibold'>Model</label>
              <select className='w-full rounded-lg border border-border bg-card/80 px-3 py-2 font-mono text-xs text-foreground focus:ring-1 focus:ring-primary'>
                <option>grouter/balanced</option>
                <option>grouter/fast-mini</option>
                <option>grouter/pro-large</option>
              </select>
            </div>

            <div className='pt-2 flex items-center gap-2.5'>
              <div className='size-3.5 rounded-full bg-[#7778FF]' />
              <span className='text-xs text-muted-foreground font-mono'>max_tokens 2.048 / {isId ? 'permintaan' : 'request'}</span>
            </div>
          </div>
        </div>

        {/* Plan 3: Enterprise */}
        <div className='rounded-xl border border-border/80 bg-card/80 p-5 card-3d hover-lift-3d bevel-shine space-y-4'>
          <div className='flex items-start justify-between'>
            <div>
              <h2 className='text-base font-bold text-foreground'>Enterprise</h2>
              <p className='text-xs text-muted-foreground font-mono mt-0.5'>
                slug: enterprise · 12% {isId ? 'lisensi aktif' : 'active licenses'}
              </p>
            </div>
            <span className='inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground'>
              ● {isId ? 'Privat' : 'Private'}
            </span>
          </div>

          <div className='space-y-3 pt-2 text-xs'>
            <div className='space-y-1.5'>
              <label className='text-muted-foreground font-semibold'>{isId ? 'Harga' : 'Price'}</label>
              <div className='flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono'>
                <span className='text-muted-foreground'>Rp <span className='text-foreground font-extrabold'>45.000</span></span>
                <span className='text-muted-foreground'>/{isId ? 'hari' : 'day'}</span>
              </div>
            </div>

            <div className='space-y-1.5'>
              <label className='text-muted-foreground font-semibold'>{isId ? 'Kuota token per lisensi' : 'Token quota per license'}</label>
              <div className='rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-foreground font-extrabold'>
                10.000.000
              </div>
            </div>

            <div className='space-y-1.5'>
              <label className='text-muted-foreground font-semibold'>Model</label>
              <select className='w-full rounded-lg border border-border bg-card/80 px-3 py-2 font-mono text-xs text-foreground focus:ring-1 focus:ring-primary'>
                <option>grouter/pro-large</option>
                <option>grouter/balanced</option>
              </select>
            </div>

            <div className='pt-2 flex items-center gap-2.5'>
              <div className='size-3.5 rounded-full bg-muted-foreground/40' />
              <span className='text-xs text-muted-foreground font-mono'>{isId ? 'Tanpa batas max_tokens' : 'No max_tokens limit'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom Card: Kebijakan Gateway D-021 ── */}
      <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-border bg-card/70 p-5 shadow-2xs'>
        <div className='flex items-center gap-4'>
          <img src='/app/images/grouter-hub-cluster.png' alt='Gateway' className='size-12 shrink-0 object-contain' />
          <div>
            <h2 className='text-sm font-bold text-foreground'>
              {isId ? 'Kebijakan gateway · D-021' : 'Gateway Policy · D-021'}
            </h2>
            <p className='text-xs text-muted-foreground max-w-2xl mt-0.5 leading-relaxed'>
              {isId
                ? 'Satu kredensial layanan di server. Kunci provider tidak pernah diserahkan ke aplikasi pelanggan; kuota ditegakkan per lisensi, idempoten per requestId.'
                : 'Single service credential on the server. Provider keys are never handed to customer applications; quotas enforced per license, idempotent per requestId.'}
            </p>
          </div>
        </div>

        <Button
          variant='outline'
          size='sm'
          className='gap-1.5 text-xs text-foreground shrink-0'
          onClick={() => window.open('https://github.com/andhikanurdyansyah/grouter_copilot/blob/main/docs/15-decision-log.md', '_blank')}
        >
          {isId ? 'Baca dokumen ↗' : 'Read docs ↗'}
        </Button>
      </div>

      {/* Create New Plan Dialog */}
      <Dialog open={newPlanOpen} onOpenChange={setNewPlanOpen}>
        <DialogContent className='sm:max-w-md border-border bg-card/95 backdrop-blur-xl shadow-2xl'>
          <DialogHeader>
            <DialogTitle className='text-base font-bold text-foreground'>
              {isId ? 'Buat Paket Langganan Baru' : 'Create New Subscription Plan'}
            </DialogTitle>
            <DialogDescription className='text-xs text-muted-foreground'>
              {isId
                ? 'Tentukan kuota token server, model default, dan tarif harian untuk paket baru.'
                : 'Define server token quota, default model, and daily price for the new plan.'}
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!newPlanName.trim()) return
              setNewPlanOpen(false)
              setSaveToast(true)
              setTimeout(() => setSaveToast(false), 3000)
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
                  value={newPlanName}
                  onChange={(e) => setNewPlanName(e.target.value)}
                  placeholder='e.g. Scale'
                  required
                  className='text-xs'
                />
              </div>
              <div className='space-y-1.5'>
                <Label htmlFor='plan-slug' className='text-xs font-semibold'>
                  Slug ID
                </Label>
                <Input
                  id='plan-slug'
                  value={newPlanSlug}
                  onChange={(e) => setNewPlanSlug(e.target.value)}
                  placeholder='e.g. scale'
                  required
                  className='text-xs font-mono'
                />
              </div>
            </div>

            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1.5'>
                <Label htmlFor='plan-price' className='text-xs font-semibold'>
                  {isId ? 'Tarif / Hari (IDR)' : 'Price / Day (IDR)'}
                </Label>
                <Input
                  id='plan-price'
                  value={newPlanPrice}
                  onChange={(e) => setNewPlanPrice(e.target.value)}
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
                  value={newPlanQuota}
                  onChange={(e) => setNewPlanQuota(e.target.value)}
                  required
                  className='text-xs font-mono'
                />
              </div>
            </div>

            <div className='space-y-1.5'>
              <Label htmlFor='plan-model' className='text-xs font-semibold'>
                {isId ? 'Model AI Default' : 'Default AI Model'}
              </Label>
              <select
                id='plan-model'
                value={newPlanModel}
                onChange={(e) => setNewPlanModel(e.target.value)}
                className='w-full rounded-md border border-border bg-card px-3 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary font-mono'
              >
                <option value='grouter/fast-mini'>grouter/fast-mini (Ultra Fast)</option>
                <option value='grouter/balanced'>grouter/balanced (Standard)</option>
                <option value='grouter/pro-large'>grouter/pro-large (Complex Reasoning)</option>
              </select>
            </div>

            <DialogFooter className='pt-2 gap-2'>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => setNewPlanOpen(false)}
                className='text-xs'
              >
                {isId ? 'Batal' : 'Cancel'}
              </Button>
              <Button
                type='submit'
                size='sm'
                className='bg-[#7778FF] hover:bg-[#8F90FF] text-white text-xs font-bold interactive-press'
              >
                {isId ? 'Simpan Paket' : 'Save Plan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Save Toast */}
      {saveToast && (
        <div className='fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border border-border bg-card/95 p-3 px-4 shadow-2xl backdrop-blur-md animate-fade-in'>
          <div className='size-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0'>
            <Check className='size-3' />
          </div>
          <span className='text-xs font-semibold text-foreground'>
            {isId ? 'Perubahan kebijakan paket berhasil disimpan!' : 'Plan policy changes saved successfully!'}
          </span>
        </div>
      )}
    </div>
  )
}
