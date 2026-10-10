import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchAdminSettings, patchAdminSettings } from '@/lib/grouter-api'
import { PageHeader } from '@/components/shared/page-header'
import { StatusBadge } from '@/components/shared/status-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Info, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

interface PlanRow {
  key: string
  name?: string
  amount?: number
  expiresInDays?: number
  quota?: number | null
  features?: string[]
  ai?: { enabled: boolean; provider?: string; allowedModels?: string[]; defaultModel?: string | null; quotaTokens?: number | null }
}

// Sentinel untuk Select (Radix tidak menerima value string kosong)
const PROVIDER_DEFAULT = '__gateway_default__'
const MODEL_NONE = '__none__'

// Input harga: tampil terformat ribuan (id-ID) saat tidak fokus,
// angka mentah saat diedit; commit saat blur.
function PriceInput({
  value,
  onCommit,
  ariaLabel,
}: {
  value: number | undefined
  onCommit: (n: number) => void
  ariaLabel: string
}) {
  const [focused, setFocused] = useState(false)
  const [text, setText] = useState('')
  const display = focused ? text : value ? value.toLocaleString('id-ID') : ''

  return (
    <div className='relative'>
      <span className='pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground'>
        Rp
      </span>
      <Input
        inputMode='numeric'
        className='w-40 pl-9 text-right tabular-nums'
        value={display}
        aria-label={ariaLabel}
        placeholder='0'
        onFocus={() => {
          setText(value ? String(value) : '')
          setFocused(true)
        }}
        onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ''))}
        onBlur={() => {
          setFocused(false)
          onCommit(text === '' ? 0 : Number(text))
        }}
      />
    </div>
  )
}

// Popover info: microcopy teknis (fail-closed, drift) dalam bahasa awam.
function AiSafetyInfo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type='button'
          aria-label='Penjelasan perlindungan konfigurasi AI'
          className='inline-flex items-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        >
          <Info className='size-3.5' />
        </button>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-80 text-sm'>
        <p className='font-medium'>Perlindungan konfigurasi AI</p>
        <p className='mt-1.5 text-muted-foreground'>
          Jika konfigurasi tidak konsisten (misalnya model bawaan tidak ada di daftar
          model yang diizinkan), AI otomatis berhenti melayani request daripada
          melayani dengan aturan yang salah. Ini perilaku yang disengaja demi keamanan.
        </p>
      </PopoverContent>
    </Popover>
  )
}

export function AdminPackages() {
  const qc = useQueryClient()
  const settings = useQuery({ queryKey: ['admin-settings'], queryFn: fetchAdminSettings })
  const [draft, setDraft] = useState<PlanRow[]>([])
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (settings.data && !dirty) {
      const raw = (settings.data as { settings?: { plans?: PlanRow[] } }).settings?.plans ?? []
      setDraft(raw.map((p) => ({ ...p, ai: p.ai ? { ...p.ai } : { enabled: false } })))
    }
  }, [settings.data, dirty])

  const save = useMutation({
    mutationFn: () => {
      // PENTING: PATCH plans MENGGANTI seluruh katalog — payload wajib
      // selalu memuat daftar lengkap (draft), bukan subset yang berubah.
      const current = (settings.data as { settings?: Record<string, unknown> }).settings ?? {}
      return patchAdminSettings({ ...current, plans: draft })
    },
    onSuccess: () => {
      toast.success('Katalog paket & kebijakan AI tersimpan')
      setDirty(false)
      qc.invalidateQueries({ queryKey: ['admin-settings'] })
      qc.invalidateQueries({ queryKey: ['plans'] })
    },
    onError: (e) => {
      // Tampilkan pesan server apa adanya.
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error('Simpan gagal: ' + (msg || 'validasi server menolak perubahan'))
    },
  })

  if (settings.isLoading) return <Skeleton className='h-64' />

  const supportedProviders =
    ((settings.data as { settings?: { supportedAiProviders?: string[] } }).settings
      ?.supportedAiProviders as string[]) ?? []

  const saveErrorMsg = save.isError
    ? ((save.error as { response?: { data?: { error?: string } } })?.response?.data?.error ||
      'validasi server menolak perubahan')
    : null

  const update = (i: number, patch: Partial<PlanRow>) => {
    setDraft((d) => d.map((p, j) => (j === i ? { ...p, ...patch } : p)))
    setDirty(true)
  }
  const updateAi = (i: number, patch: Partial<NonNullable<PlanRow['ai']>>) => {
    setDraft((d) => d.map((p, j) => (j === i ? { ...p, ai: { ...(p.ai || { enabled: false }), ...patch } } : p)))
    setDirty(true)
  }
  const resetDraft = () => {
    const raw = (settings.data as { settings?: { plans?: PlanRow[] } }).settings?.plans ?? []
    setDraft(raw.map((p) => ({ ...p, ai: p.ai ? { ...p.ai } : { enabled: false } })))
    setDirty(false)
    save.reset()
  }

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Paket & Kebijakan AI'
        description='Harga selalu dihitung ulang oleh server saat checkout. Kebijakan AI (provider, daftar model, kuota token) divalidasi dan ditegakkan oleh gateway untuk setiap request.'
      >
        {saveErrorMsg && !dirty && (
          <p role='alert' className='text-sm text-red-600 dark:text-red-400'>
            Simpan gagal: {saveErrorMsg}
          </p>
        )}
        {dirty ? (
          <>
            <Button variant='ghost' onClick={resetDraft} disabled={save.isPending}>
              Batalkan
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? 'Menyimpan…' : 'Simpan perubahan'}
            </Button>
          </>
        ) : (
          <p role='status' className='flex items-center gap-2 px-1 text-sm text-muted-foreground'>
            <span aria-hidden>✓</span> Tersimpan
          </p>
        )}
      </PageHeader>

      {draft.length === 0 && (
        <Card>
          <CardContent className='py-10 text-center text-sm text-muted-foreground'>
            Belum ada paket di katalog settings.
          </CardContent>
        </Card>
      )}

      {draft.map((p, i) => {
        const ai = p.ai ?? { enabled: false }
        const allowedModels = ai.allowedModels ?? []
        const noPrice = !p.amount || p.amount <= 0
        const defaultNotAllowed =
          !!ai.defaultModel && allowedModels.length > 0 && !allowedModels.includes(ai.defaultModel)
        const unlimited = ai.quotaTokens === null || ai.quotaTokens === undefined
        // Pastikan provider tersimpan tetap bisa dipilih walau tidak ada di daftar supported.
        const providerOptions = Array.from(
          new Set([...supportedProviders, ...(ai.provider ? [ai.provider] : [])])
        )

        return (
          <Card key={p.key}>
            <CardHeader className='flex-row items-start justify-between gap-3 space-y-0'>
              <div className='space-y-1'>
                <CardTitle className='text-base'>{p.name || p.key}</CardTitle>
                <CardDescription>
                  <code className='font-mono text-xs'>{p.key}</code>
                </CardDescription>
              </div>
              <StatusBadge tone={ai.enabled ? 'success' : 'neutral'}>
                AI {ai.enabled ? 'aktif' : 'nonaktif'}
              </StatusBadge>
            </CardHeader>
            <CardContent className='space-y-5'>
              {/* Identitas komersial: harga, masa aktif, kuota */}
              <div className='grid gap-4 sm:grid-cols-3'>
                <div className='space-y-1.5'>
                  <Label htmlFor={'price-' + p.key}>Harga</Label>
                  <PriceInput
                    value={p.amount}
                    ariaLabel={'Harga paket ' + (p.name || p.key)}
                    onCommit={(n) => update(i, { amount: n })}
                  />
                  {noPrice && (
                    <p
                      role='alert'
                      className='flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400'
                    >
                      <AlertTriangle className='mt-0.5 size-3.5 shrink-0' aria-hidden />
                      Harga belum tersedia — checkout dinonaktifkan server untuk paket ini.
                    </p>
                  )}
                </div>
                <div className='space-y-1.5'>
                  <Label htmlFor={'days-' + p.key}>Masa aktif</Label>
                  <div className='relative w-fit'>
                    <Input
                      id={'days-' + p.key}
                      type='number'
                      className='w-32 pr-12 text-right tabular-nums'
                      value={p.expiresInDays ?? 0}
                      min={1}
                      aria-label={'Masa aktif paket ' + (p.name || p.key)}
                      onChange={(e) => update(i, { expiresInDays: Number(e.target.value) })}
                    />
                    <span className='pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground'>
                      hari
                    </span>
                  </div>
                </div>
                <div className='space-y-1.5'>
                  <Label>Kuota lisensi</Label>
                  <p className='flex h-9 items-center gap-1.5 rounded-md border border-dashed px-3 text-sm tabular-nums'>
                    <span className='font-medium'>
                      {p.quota === null || p.quota === undefined
                        ? 'Tanpa batas'
                        : p.quota.toLocaleString('id-ID')}
                    </span>
                    <span className='text-xs text-muted-foreground'>lisensi aktif</span>
                  </p>
                </div>
              </div>

              <Separator />

              {/* Kebijakan AI — satu paket, satu tempat */}
              <div className='space-y-4'>
                <div className='flex flex-wrap items-center justify-between gap-3'>
                  <div className='flex items-center gap-1.5'>
                    {/* h3: di bawah CardTitle (h2) kartu paket — h1→h2→h3 tanpa skip */}
                    <h3 className='text-sm font-medium'>Kebijakan AI</h3>
                    <AiSafetyInfo />
                  </div>
                  <div className='flex items-center gap-2.5'>
                    <Label htmlFor={'ai-' + p.key} className='text-sm font-normal'>
                      Fitur AI
                    </Label>
                    <Switch
                      id={'ai-' + p.key}
                      checked={!!ai.enabled}
                      onCheckedChange={(v) => updateAi(i, { enabled: v })}
                      aria-label={'Fitur AI untuk paket ' + (p.name || p.key)}
                    />
                    <StatusBadge tone={ai.enabled ? 'success' : 'neutral'}>
                      {ai.enabled ? 'Aktif' : 'Nonaktif'}
                    </StatusBadge>
                  </div>
                </div>

                {ai.enabled && (
                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-1.5'>
                      <Label htmlFor={'ai-provider-' + p.key}>Provider</Label>
                      <Select
                        value={ai.provider || PROVIDER_DEFAULT}
                        onValueChange={(v) =>
                          updateAi(i, { provider: v === PROVIDER_DEFAULT ? undefined : v })
                        }
                      >
                        <SelectTrigger id={'ai-provider-' + p.key} className='w-full'>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={PROVIDER_DEFAULT}>
                            Ikuti default gateway
                          </SelectItem>
                          {providerOptions.map((prov) => (
                            <SelectItem key={prov} value={prov} className='font-mono text-xs'>
                              {prov}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className='space-y-1.5'>
                      <Label htmlFor={'ai-models-' + p.key}>Model yang diizinkan (pisah koma)</Label>
                      <Input
                        id={'ai-models-' + p.key}
                        className='font-mono text-xs'
                        value={allowedModels.join(', ')}
                        onChange={(e) =>
                          updateAi(i, {
                            allowedModels: e.target.value
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                        placeholder='model-a, model-b'
                      />
                    </div>
                    <div className='space-y-1.5'>
                      <Label htmlFor={'ai-default-' + p.key}>Model bawaan</Label>
                      {allowedModels.length > 0 ? (
                        <Select
                          value={ai.defaultModel || MODEL_NONE}
                          onValueChange={(v) =>
                            updateAi(i, { defaultModel: v === MODEL_NONE ? null : v })
                          }
                        >
                          <SelectTrigger id={'ai-default-' + p.key} className='w-full'>
                            <SelectValue placeholder='Pilih dari daftar model' />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={MODEL_NONE}>Belum ditetapkan</SelectItem>
                            {allowedModels.map((m) => (
                              <SelectItem key={m} value={m} className='font-mono text-xs'>
                                {m}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id={'ai-default-' + p.key}
                          className='font-mono text-xs'
                          value={ai.defaultModel || ''}
                          onChange={(e) => updateAi(i, { defaultModel: e.target.value || null })}
                          placeholder='Isi daftar model dulu'
                        />
                      )}
                      {defaultNotAllowed && (
                        <p className='flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400'>
                          <AlertTriangle className='mt-0.5 size-3.5 shrink-0' aria-hidden />
                          Model bawaan tidak ada di daftar yang diizinkan — AI akan berhenti
                          melayani paket ini sampai diperbaiki.
                        </p>
                      )}
                    </div>
                    <div className='space-y-1.5'>
                      <div className='flex items-center justify-between'>
                        <Label htmlFor={'ai-quota-' + p.key}>Kuota token</Label>
                        <div className='flex items-center gap-2'>
                          <Label
                            htmlFor={'ai-unlimited-' + p.key}
                            className='text-xs font-normal text-muted-foreground'
                          >
                            Tanpa batas
                          </Label>
                          <Switch
                            id={'ai-unlimited-' + p.key}
                            checked={unlimited}
                            onCheckedChange={(v) =>
                              updateAi(i, { quotaTokens: v ? null : (ai.quotaTokens ?? 0) })
                            }
                            aria-label={'Kuota token tanpa batas untuk paket ' + (p.name || p.key)}
                          />
                        </div>
                      </div>
                      {unlimited ? (
                        <p className='flex h-9 items-center rounded-md border border-dashed px-3 text-sm text-muted-foreground'>
                          Tanpa batas — pemakaian hanya dibatasi kuota lisensi.
                        </p>
                      ) : (
                        <Input
                          id={'ai-quota-' + p.key}
                          type='number'
                          className='text-right tabular-nums'
                          value={ai.quotaTokens ?? 0}
                          min={0}
                          onChange={(e) =>
                            updateAi(i, {
                              quotaTokens: e.target.value === '' ? 0 : Number(e.target.value),
                            })
                          }
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
