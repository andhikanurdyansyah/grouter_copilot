import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMe, fmtDate } from '@/lib/grouter-api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
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

  if (me.isLoading) return <Skeleton className='h-64' />

  const licenses = me.data?.licenses ?? []

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(text)
      toast.success(label + ' disalin')
      setTimeout(() => setCopied(null), 1500)
    } catch {
      toast.error('Gagal menyalin')
    }
  }

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>Lisensi & Install</h1>
        <p className='text-muted-foreground text-sm'>
          Lisensi aktif, paket, dan konfigurasi install Copilot Anda.
        </p>
      </div>

      {licenses.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Belum ada lisensi</CardTitle>
            <CardDescription>
              Lisensi terbit otomatis setelah pembayaran paket terverifikasi.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className='pt-6'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>License ID</TableHead>
                  <TableHead className='hidden md:table-cell'>Status</TableHead>
                  <TableHead className='hidden lg:table-cell'>Dibuat</TableHead>
                  <TableHead className='hidden lg:table-cell'>Kedaluwarsa</TableHead>
                  <TableHead className='text-right'>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {licenses.map((l) => {
                  const st = statusOf(l)
                  return (
                    <TableRow key={l.id}>
                      <TableCell className='font-mono text-xs'>{l.id}</TableCell>
                      <TableCell className='hidden md:table-cell'>
                        <Badge variant={st === 'active' ? 'default' : st === 'expired' ? 'secondary' : 'destructive'}>
                          {st === 'active' ? 'aktif' : st === 'expired' ? 'kedaluwarsa' : 'dicabut'}
                        </Badge>
                      </TableCell>
                      <TableCell className='hidden lg:table-cell text-sm'>{fmtDate(l.createdAt)}</TableCell>
                      <TableCell className='hidden lg:table-cell text-sm'>{fmtDate(l.expiresAt)}</TableCell>
                      <TableCell className='text-right'>
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() => copy(l.id, 'License ID')}
                          aria-label={'Salin License ID ' + l.id}
                        >
                          {copied === l.id ? <Check className='size-3.5' /> : <Copy className='size-3.5' />}
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
          <CardTitle className='text-base'>Install Copilot</CardTitle>
          <CardDescription>
            Jalankan installer dari dokumentasi produk, lalu masukkan License ID Anda
            saat diminta. gRouter API key tidak pernah dibagikan ke client — entitlement
            divalidasi server per request.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
