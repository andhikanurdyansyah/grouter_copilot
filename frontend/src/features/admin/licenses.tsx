import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { fetchAdminLicenses, fetchAdminSettings, issueLicense, revokeLicense, fmtDate } from '@/lib/grouter-api'
import { PageHeader } from '@/components/shared/page-header'
import { StatusBadge, licenseTone } from '@/components/shared/status-badge'
import { TableSkeleton, EmptyState, ErrorState } from '@/components/shared/data-states'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ArrowDown, ArrowUp, Search, Copy, Check, MoreHorizontal } from 'lucide-react'

interface AdminLicense {
  id: string
  customer?: string | null
  planKey?: string | null
  status?: string
  createdAt?: number | string
  expiresAt?: number | string
  // Catatan: field secret backend (token, grouterApiKey) sengaja TIDAK dirender di UI.
  [k: string]: unknown
}

function statusOf(l: AdminLicense): string {
  return String(l.status || (l.expiresAt && new Date(l.expiresAt).getTime() < Date.now() ? 'expired' : 'active'))
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

type SortKey = 'customer' | 'createdAt' | 'expiresAt' | 'status'

export function AdminLicenses() {
  const qc = useQueryClient()
  const lic = useQuery({ queryKey: ['admin-licenses'], queryFn: fetchAdminLicenses })
  const settings = useQuery({ queryKey: ['admin-settings'], queryFn: fetchAdminSettings })
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'createdAt', dir: -1 })
  const [open, setOpen] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<AdminLicense | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [form, setForm] = useState<{ customer: string; planKey: string }>({ customer: '', planKey: 'none' })

  // Feedback "Tersalin" hilang setelah 1.5 detik
  useEffect(() => {
    if (!copiedId) return
    const t = setTimeout(() => setCopiedId(null), 1500)
    return () => clearTimeout(t)
  }, [copiedId])

  const onCopyId = async (id: string) => {
    if (await copyText(id)) {
      setCopiedId(id)
    } else {
      toast.error('Gagal menyalin')
    }
  }

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-licenses'] })
    qc.invalidateQueries({ queryKey: ['admin-stats'] })
  }

  const issue = useMutation({
    mutationFn: () => issueLicense({
      customer: form.customer || undefined,
      planKey: form.planKey === 'none' ? null : form.planKey,
    }),
    onSuccess: () => {
      toast.success('Lisensi terbit')
      setOpen(false)
      setForm({ customer: '', planKey: 'none' })
      invalidate()
    },
    onError: (e) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error('Terbitkan gagal: ' + (msg || 'coba lagi'))
    },
  })

  const revoke = useMutation({
    mutationFn: (id: string) => revokeLicense(id),
    onSuccess: () => {
      toast.success('Lisensi dicabut')
      setRevokeTarget(null)
      invalidate()
    },
    onError: (e) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error('Revoke gagal: ' + (msg || 'coba lagi'))
      setRevokeTarget(null)
    },
  })

  const rows = useMemo(() => {
    let list = ((lic.data?.licenses ?? []) as AdminLicense[]).map((l): AdminLicense & { _st: string } => ({ ...l, _st: statusOf(l) }))
    if (status !== 'all') list = list.filter((l) => l._st === status)
    const needle = q.trim().toLowerCase()
    if (needle) {
      list = list.filter((l) =>
        String(l.customer || '').toLowerCase().includes(needle) ||
        String(l.id || '').toLowerCase().includes(needle))
    }
    const val = (l: AdminLicense & { _st: string }): string | number => {
      if (sort.key === 'customer') return String(l.customer || '').toLowerCase()
      if (sort.key === 'status') return l._st
      if (sort.key === 'createdAt') return new Date(l.createdAt ?? 0).getTime()
      return new Date(l.expiresAt ?? 0).getTime()
    }
    return [...list].sort((a, b) => {
      const va = val(a); const vb = val(b)
      if (va < vb) return -1 * sort.dir
      if (va > vb) return 1 * sort.dir
      return 0
    })
  }, [lic.data, q, status, sort])

  const allLicenses = (lic.data?.licenses ?? []) as AdminLicense[]
  const total = allLicenses.length
  const activeCount = allLicenses.filter((l) => statusOf(l) === 'active').length
  const revokedCount = allLicenses.filter((l) => statusOf(l) === 'revoked').length
  const plans = (settings.data as { settings?: { plans?: { key: string; name: string }[] } })?.settings?.plans ?? []
  const plansMap = new Map(plans.map((p) => [p.key, p.name]))

  const toggleSort = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }))
  }
  const SortHead = ({ label, k, hide }: { label: string; k: SortKey; hide?: string }) => (
    <TableHead className={hide}>
      <button
        type='button'
        className='inline-flex items-center gap-1 hover:text-foreground'
        onClick={() => toggleSort(k)}
        aria-label={'Urutkan berdasarkan ' + label.toLowerCase()}
      >
        {label}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp className='size-3' aria-hidden /> : <ArrowDown className='size-3' aria-hidden />)}
      </button>
    </TableHead>
  )

  return (
    <div className='space-y-5'>
      <PageHeader
        title='Lisensi'
        description={`${total.toLocaleString('id-ID')} lisensi${rows.length !== total ? ` · ${rows.length.toLocaleString('id-ID')} cocok dengan filter` : ''}`}
      >
        <Button onClick={() => setOpen(true)}>+ Terbitkan Lisensi</Button>
      </PageHeader>

      <div className='flex flex-wrap items-center gap-2'>
        <div className='relative'>
          <Search className='absolute left-2.5 top-2.5 size-4 text-muted-foreground' aria-hidden />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder='Cari pelanggan / lic_…'
            className='w-64 pl-8'
            aria-label='Cari pelanggan atau license ID'
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className='w-40' aria-label='Filter status lisensi'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>Semua status</SelectItem>
            <SelectItem value='active'>Aktif</SelectItem>
            <SelectItem value='expired'>Kedaluwarsa</SelectItem>
            <SelectItem value='revoked'>Dicabut</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {lic.isPending ? (
        <TableSkeleton rows={6} cols={5} />
      ) : lic.isError ? (
        <ErrorState
          status={(lic.error as { response?: { status?: number } })?.response?.status}
          message={(lic.error as Error).message}
          onRetry={() => lic.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title='Tidak ada lisensi yang cocok'
          description='Ubah kata kunci pencarian atau filter status.'
        />
      ) : (
        <Card className='py-0'>
          <CardContent className='px-0'>
            <p className='border-b px-4 py-2.5 text-xs text-muted-foreground' role='status'>
              {total.toLocaleString('id-ID')} lisensi · {activeCount.toLocaleString('id-ID')} aktif · {revokedCount.toLocaleString('id-ID')} dicabut
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead label='Pelanggan' k='customer' />
                  <TableHead className='hidden md:table-cell'>License ID</TableHead>
                  <TableHead className='hidden lg:table-cell'>Paket</TableHead>
                  <SortHead label='Status' k='status' />
                  <SortHead label='Kedaluwarsa' k='expiresAt' hide='hidden xl:table-cell' />
                  <TableHead className='text-right'>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((l) => {
                  const copied = copiedId === l.id
                  return (
                    <TableRow key={l.id}>
                      <TableCell className='font-medium'>
                        {l.customer
                          ? l.customer
                          : <span className='italic text-muted-foreground'>tanpa nama</span>}
                      </TableCell>
                      <TableCell className='hidden md:table-cell'>
                        <span className='inline-flex max-w-full items-center gap-1'>
                          <Link
                            to='/admin/licenses/$licenseId'
                            params={{ licenseId: l.id }}
                            className='truncate font-mono text-xs text-muted-foreground underline-offset-2 [overflow-wrap:anywhere] hover:text-foreground hover:underline'
                            title='Buka detail lisensi'
                          >
                            {l.id}
                          </Link>
                          <button
                            type='button'
                            className='inline-flex shrink-0 items-center gap-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                            onClick={() => onCopyId(l.id)}
                            aria-label={copied ? 'License ID tersalin' : 'Salin License ID ' + l.id}
                          >
                            {copied
                              ? <Check className='size-3.5 text-emerald-600' aria-hidden />
                              : <Copy className='size-3.5' aria-hidden />}
                            <span className='sr-only' role='status' aria-live='polite'>
                              {copied ? 'Tersalin' : ''}
                            </span>
                          </button>
                          {copied && (
                            <span className='shrink-0 text-xs font-medium text-emerald-600' role='status' aria-live='polite'>
                              Tersalin
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className='hidden lg:table-cell text-sm'>
                        {l.planKey ? (plansMap.get(String(l.planKey)) || String(l.planKey)) : <span className='text-muted-foreground'>—</span>}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={licenseTone(l._st)}>
                          {l._st === 'active' ? 'aktif' : l._st === 'expired' ? 'kedaluwarsa' : 'dicabut'}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className='hidden xl:table-cell text-sm whitespace-nowrap'>{fmtDate(l.expiresAt)}</TableCell>
                      <TableCell className='text-right'>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size='sm'
                              variant='ghost'
                              className='size-8 p-0'
                              aria-label={'Aksi untuk lisensi ' + (l.customer || l.id)}
                            >
                              <MoreHorizontal className='size-4' aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align='end'>
                            <DropdownMenuItem onSelect={() => onCopyId(l.id)}>
                              <Copy className='size-4' aria-hidden />
                              Salin License ID
                            </DropdownMenuItem>
                            {l._st === 'active' && (
                              <DropdownMenuItem
                                className='text-destructive focus:text-destructive'
                                onSelect={() => setRevokeTarget(l)}
                              >
                                Cabut lisensi…
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <div className='flex items-center justify-between border-t px-4 py-2.5'>
              <p className='text-xs text-muted-foreground' aria-live='polite'>
                {rows.length.toLocaleString('id-ID')} dari {total.toLocaleString('id-ID')} lisensi
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog terbitkan */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Terbitkan Lisensi</DialogTitle>
            <DialogDescription>
              Pilih paket agar entitlement AI sesuai kebijakan paket. Tanpa paket, AI berjalan
              unlimited di luar model entitlement — gunakan hanya bila memang disengaja.
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4 py-2'>
            <div className='space-y-2'>
              <Label htmlFor='issue-customer'>Nama customer (opsional)</Label>
              <Input
                id='issue-customer'
                value={form.customer}
                onChange={(e) => setForm({ ...form, customer: e.target.value })}
                placeholder='mis. Acme CRM'
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='issue-plan'>Paket</Label>
              <Select value={form.planKey} onValueChange={(v) => setForm({ ...form, planKey: v })}>
                <SelectTrigger id='issue-plan'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='none'>— tanpa paket (unlimited) —</SelectItem>
                  {plans.map((p) => (
                    <SelectItem key={p.key} value={p.key}>{p.name} ({p.key})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setOpen(false)}>Batal</Button>
            <Button onClick={() => issue.mutate()} disabled={issue.isPending}>
              {issue.isPending ? 'Menerbitkan…' : 'Terbitkan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Konfirmasi revoke (destructive terpisah dari aksi rutin) */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(v) => !v && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Cabut lisensi {revokeTarget?.customer || revokeTarget?.id}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Lisensi yang dicabut langsung berhenti bekerja — install dan heartbeat tidak lagi
              valid. Tindakan ini tidak bisa dikembalikan dan memengaruhi customer secara langsung.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className='bg-destructive text-white hover:bg-destructive/90'
              onClick={() => { if (revokeTarget) revoke.mutate(revokeTarget.id) }}
            >
              {revoke.isPending ? 'Mencabut…' : 'Ya, cabut lisensi'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
