import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchAdminLicenses, fetchAdminSettings, issueLicense, fmtDate } from '@/lib/grouter-api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
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
import { Search } from 'lucide-react'

interface AdminLicense {
  id: string
  customer?: string | null
  planKey?: string | null
  status?: string
  createdAt?: string
  expiresAt?: string
  [k: string]: unknown
}

function statusOf(l: AdminLicense): string {
  return String(l.status || (l.expiresAt && new Date(l.expiresAt).getTime() < Date.now() ? 'expired' : 'active'))
}

export function AdminLicenses() {
  const qc = useQueryClient()
  const lic = useQuery({ queryKey: ['admin-licenses'], queryFn: fetchAdminLicenses })
  const settings = useQuery({ queryKey: ['admin-settings'], queryFn: fetchAdminSettings })
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<{ customer: string; planKey: string }>({ customer: '', planKey: 'none' })

  const issue = useMutation({
    mutationFn: () => issueLicense({
      customer: form.customer || undefined,
      planKey: form.planKey === 'none' ? null : form.planKey,
    }),
    onSuccess: () => {
      toast.success('Lisensi terbit')
      setOpen(false)
      setForm({ customer: '', planKey: 'none' })
      qc.invalidateQueries({ queryKey: ['admin-licenses'] })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
    },
    onError: (e) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error('Terbitkan gagal: ' + (msg || 'coba lagi'))
    },
  })

  const rows = useMemo(() => {
    let list = (lic.data?.licenses ?? []) as AdminLicense[]
    if (status !== 'all') list = list.filter((l) => statusOf(l) === status)
    const needle = q.trim().toLowerCase()
    if (needle) {
      list = list.filter((l) =>
        String(l.customer || '').toLowerCase().includes(needle) ||
        String(l.id || '').toLowerCase().includes(needle))
    }
    return list
  }, [lic.data, q, status])

  const total = (lic.data?.licenses ?? []).length
  const plans = (settings.data as { settings?: { plans?: { key: string; name: string }[] } })?.settings?.plans ?? []

  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Lisensi</h1>
          <p className='text-muted-foreground text-sm'>
            {total ? total + ' lisensi' : 'belum ada lisensi'}
            {rows.length !== total ? ' (' + rows.length + ' cocok)' : ''}
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>+ Terbitkan Lisensi</Button>
      </div>

      <div className='flex flex-wrap items-center gap-2'>
        <div className='relative'>
          <Search className='absolute left-2.5 top-2.5 size-4 text-muted-foreground' />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder='Cari customer / lic_…'
            className='w-64 pl-8'
            aria-label='Cari customer atau license ID'
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

      {lic.isLoading ? (
        <Skeleton className='h-64' />
      ) : (
        <Card>
          <CardContent className='pt-6'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className='hidden md:table-cell'>License ID</TableHead>
                  <TableHead className='hidden lg:table-cell'>Package</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className='hidden xl:table-cell'>Kedaluwarsa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className='text-muted-foreground'>
                      Tidak ada lisensi yang cocok dengan pencarian/filter.
                    </TableCell>
                  </TableRow>
                ) : rows.map((l) => {
                  const st = statusOf(l)
                  return (
                    <TableRow key={l.id}>
                      <TableCell className='font-medium'>{l.customer || '—'}</TableCell>
                      <TableCell className='hidden md:table-cell font-mono text-xs'>{l.id}</TableCell>
                      <TableCell className='hidden lg:table-cell text-sm'>{l.planKey || '—'}</TableCell>
                      <TableCell>
                        <Badge variant={st === 'active' ? 'default' : st === 'expired' ? 'secondary' : 'destructive'}>
                          {st === 'active' ? 'aktif' : st === 'expired' ? 'kedaluwarsa' : 'dicabut'}
                        </Badge>
                      </TableCell>
                      <TableCell className='hidden xl:table-cell text-sm'>{fmtDate(l.expiresAt)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Terbitkan Lisensi</DialogTitle>
            <DialogDescription>
              Pilih paket agar entitlement AI sesuai kebijakan paket. Tanpa paket, AI
              berjalan unlimited di luar model entitlement — gunakan hanya bila memang disengaja.
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
                    <SelectItem key={p.key} value={p.key}>
                      {p.name} ({p.key})
                    </SelectItem>
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
    </div>
  )
}
