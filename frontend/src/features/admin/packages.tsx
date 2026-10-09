import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchAdminSettings, patchAdminSettings } from '@/lib/grouter-api'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

interface PlanRow {
  key: string
  name?: string
  amount?: number
  expiresInDays?: number
  quota?: number | null
  features?: string[]
  ai?: { enabled: boolean; provider?: string; allowedModels?: string[]; defaultModel?: string | null; quotaTokens?: number | null }
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
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error('Simpan gagal: ' + (msg || 'validasi server menolak perubahan'))
    },
  })

  if (settings.isLoading) return <Skeleton className='h-64' />

  const update = (i: number, patch: Partial<PlanRow>) => {
    setDraft((d) => d.map((p, j) => (j === i ? { ...p, ...patch } : p)))
    setDirty(true)
  }
  const updateAi = (i: number, patch: Partial<NonNullable<PlanRow['ai']>>) => {
    setDraft((d) => d.map((p, j) => (j === i ? { ...p, ai: { ...(p.ai || { enabled: false }), ...patch } } : p)))
    setDirty(true)
  }

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Paket & AI Policy'
        description='Harga server-authoritative — pembayaran selalu dihitung server. Kebijakan AI (provider, allowlist model, default model, kuota) divalidasi server; drift konfigurasi membuat AI fail-closed.'
      >
        <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
          {save.isPending ? 'Menyimpan…' : dirty ? 'Simpan perubahan' : 'Tersimpan'}
        </Button>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Harga & Durasi</CardTitle>
          <CardDescription>Perubahan berlaku untuk pembelian baru.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paket</TableHead>
                <TableHead className='hidden md:table-cell'>Key</TableHead>
                <TableHead>Harga (Rp)</TableHead>
                <TableHead>Masa aktif (hari)</TableHead>
                <TableHead className='hidden lg:table-cell'>Quota</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {draft.map((p, i) => (
                <TableRow key={p.key}>
                  <TableCell className='font-medium'>{p.name || p.key}</TableCell>
                  <TableCell className='hidden md:table-cell font-mono text-xs'>{p.key}</TableCell>
                  <TableCell>
                    <Input
                      type='number' className='w-32' value={p.amount ?? 0} min={0}
                      aria-label={'Harga paket ' + (p.name || p.key)}
                      onChange={(e) => update(i, { amount: Number(e.target.value) })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type='number' className='w-24' value={p.expiresInDays ?? 0} min={1}
                      aria-label={'Masa aktif paket ' + (p.name || p.key)}
                      onChange={(e) => update(i, { expiresInDays: Number(e.target.value) })}
                    />
                  </TableCell>
                  <TableCell className='hidden lg:table-cell tabular-nums text-sm'>
                    {p.quota === null || p.quota === undefined ? 'unlimited' : p.quota.toLocaleString('id-ID')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Kebijakan AI per Paket</CardTitle>
          <CardDescription>
            Enforcement server-side (gateway). Model wajib anggota allowlist; default
            model wajib anggota allowlist. Drift konfigurasi → fail-closed 503.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-6'>
          {draft.map((p, i) => (
            <div key={p.key} className='rounded-lg border p-4 space-y-4'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='font-medium'>{p.name || p.key} <span className='font-mono text-xs text-muted-foreground'>({p.key})</span></div>
                <div className='flex items-center gap-2'>
                  <Switch
                    id={'ai-' + p.key}
                    checked={!!p.ai?.enabled}
                    onCheckedChange={(v) => updateAi(i, { enabled: v })}
                    aria-label={'AI untuk paket ' + (p.name || p.key)}
                  />
                  <Label htmlFor={'ai-' + p.key}>AI {p.ai?.enabled ? 'aktif' : 'mati'}</Label>
                </div>
              </div>
              {p.ai?.enabled && (
                <div className='grid gap-4 md:grid-cols-3'>
                  <div className='space-y-1.5'>
                    <Label htmlFor={'ai-models-' + p.key}>Allowed models (pisah koma)</Label>
                    <Input
                      id={'ai-models-' + p.key}
                      value={(p.ai.allowedModels || []).join(', ')}
                      onChange={(e) => updateAi(i, { allowedModels: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                      placeholder='model-a, model-b'
                    />
                  </div>
                  <div className='space-y-1.5'>
                    <Label htmlFor={'ai-default-' + p.key}>Default model</Label>
                    <Input
                      id={'ai-default-' + p.key}
                      value={p.ai.defaultModel || ''}
                      onChange={(e) => updateAi(i, { defaultModel: e.target.value || null })}
                      placeholder='salah satu dari allowed models'
                    />
                  </div>
                  <div className='space-y-1.5'>
                    <Label htmlFor={'ai-quota-' + p.key}>Token quota (kosong = unlimited)</Label>
                    <Input
                      id={'ai-quota-' + p.key}
                      type='number'
                      value={p.ai.quotaTokens ?? ''}
                      onChange={(e) => updateAi(i, { quotaTokens: e.target.value === '' ? null : Number(e.target.value) })}
                      placeholder='ikut plan'
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
