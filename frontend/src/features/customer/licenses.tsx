import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMe, fmtDate } from '@/lib/grouter-api'
import { PageHeader } from '@/components/shared/page-header'
import { StatusBadge } from '@/components/shared/status-badge'
import { TableSkeleton, EmptyState, ErrorState } from '@/components/shared/data-states'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'

function statusOf(l: { status?: string; expiresAt?: string }): string {
  if (l.status) return String(l.status)
  if (l.expiresAt && new Date(l.expiresAt).getTime() < Date.now()) return 'expired'
  return 'active'
}

export function CustomerLicenses() {
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe })
  const [copied, setCopied] = useState<string | null>(null)

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(text)
      toast.success(label + ' disalin ke clipboard')
      setTimeout(() => setCopied(null), 1500)
    } catch {
      toast.error('Gagal menyalin — salin manual dari tabel')
    }
  }

  if (me.isPending) {
    return (
      <div className='space-y-5'>
        <PageHeader title='Lisensi & Install' description='Lisensi aktif, paket, dan konfigurasi install Copilot Anda.' />
        <TableSkeleton rows={4} cols={4} />
      </div>
    )
  }
  if (me.isError) {
    return (
      <div className='space-y-5'>
        <PageHeader title='Lisensi & Install' description='Lisensi aktif, paket, dan konfigurasi install Copilot Anda.' />
        <ErrorState
          status={(me.error as { response?: { status?: number } })?.response?.status}
          message={(me.error as Error).message}
          onRetry={() => me.refetch()}
        />
      </div>
    )
  }

  const licenses = me.data?.licenses ?? []

  return (
    <div className='space-y-5'>
      <PageHeader
        title='Lisensi & Install'
        description='Daftar lisensi, status, dan masa berlaku. Salin License ID untuk registrasi install.'
      />

      {licenses.length === 0 ? (
        <EmptyState
          title='Belum ada lisensi'
          description='Lisensi terbit otomatis setelah pembayaran paket Anda terverifikasi.'
        />
      ) : (
        <Card className='py-0'>
          <CardContent className='px-0'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>License ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className='hidden md:table-cell'>Berlaku s.d.</TableHead>
                  <TableHead className='text-right'>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {licenses.map((l) => {
                  const st = statusOf(l)
                  return (
                    <TableRow key={l.id}>
                      <TableCell className='font-mono text-xs'>{l.id}</TableCell>
                      <TableCell>
                        <StatusBadge tone={st === 'active' ? 'success' : st === 'expired' ? 'warning' : 'danger'}>
                          {st === 'active' ? 'aktif' : st === 'expired' ? 'kedaluwarsa' : 'dicabut'}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className='hidden md:table-cell text-sm whitespace-nowrap'>{fmtDate(l.expiresAt)}</TableCell>
                      <TableCell className='text-right'>
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() => copy(l.id, 'License ID')}
                          aria-label={'Salin License ID ' + l.id}
                        >
                          {copied === l.id ? <Check className='size-3.5 text-emerald-600' /> : <Copy className='size-3.5' />}
                          Salin ID
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Cara install</CardTitle>
          <CardDescription>Tiga langkah menghubungkan Copilot ke workspace Anda.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className='space-y-3 text-sm'>
            <li className='flex gap-3'>
              <span className='flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary'>1</span>
              <span>Salin <strong>License ID</strong> dari tabel di atas.</span>
            </li>
            <li className='flex gap-3'>
              <span className='flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary'>2</span>
              <span>Jalankan installer Copilot dari dokumentasi produk, lalu tempel License ID saat diminta.</span>
            </li>
            <li className='flex gap-3'>
              <span className='flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary'>3</span>
              <span>Plugin melakukan heartbeat & memakai AI sesuai kuota paket — entitlement divalidasi server per request, kredensial tidak pernah dibagikan ke client.</span>
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
