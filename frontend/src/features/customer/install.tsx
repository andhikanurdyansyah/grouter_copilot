import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMe } from '@/lib/grouter-api'
import { PageHeader } from '@/components/shared/page-header'
import { TableSkeleton } from '@/components/shared/data-states'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, Copy, CircleHelp, Package } from 'lucide-react'
import { toast } from 'sonner'
import { Link } from '@tanstack/react-router'
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion'

export function CustomerInstall() {
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe })
  const [copied, setCopied] = useState(false)
  const licenseId = me.data?.licenses?.find((l) => String(l.status) !== 'revoked')?.id ?? me.data?.licenses?.[0]?.id
  const usageRow = me.data?.usage?.find((u) => u.licenseId === licenseId)
  const hasFirstRequest = (usageRow?.usedTokens ?? 0) > 0

  const copy = async () => {
    if (!licenseId) return
    try {
      await navigator.clipboard.writeText(licenseId)
      setCopied(true)
      toast.success('License ID disalin')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Gagal menyalin — salin manual')
    }
  }

  if (me.isPending) {
    return (
      <div className='space-y-5'>
        <PageHeader title='Instalasi & Panduan' description='Sambungkan Copilot ke workspace Anda dalam 3 langkah.' />
        <TableSkeleton rows={3} cols={3} />
      </div>
    )
  }

  const hasLicense = !!licenseId

  return (
    <div className='space-y-5'>
      <PageHeader
        title='Instalasi & Panduan'
        description={hasLicense
          ? 'Tiga langkah menghubungkan Copilot. Lisensi Anda memvalidasi otomatis ke server.'
          : 'Anda belum punya lisensi untuk dipasang. Pilih paket dulu untuk menerbitkan lisensi.'}
      />

      {!hasLicense ? (
        <Card className='border-dashed'>
          <CardContent className='flex flex-col items-center gap-3 py-10 text-center'>
            <div className='flex size-12 items-center justify-center rounded-2xl bg-primary/10'>
              <Package className='size-6 text-primary' aria-hidden />
            </div>
            <p className='text-sm font-medium'>Belum ada lisensi untuk dipasang</p>
            <p className='max-w-md text-sm text-muted-foreground'>
              Beli paket terlebih dahulu — lisensi terbit otomatis setelah pembayaran QRIS terverifikasi server.
            </p>
            <Button asChild className='mt-1'>
              <Link to='/user/orders'>Lihat paket</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ol className='space-y-4' aria-label='Langkah instalasi Copilot'>
          <Step n={1} total={3} title='Salin License ID Anda' done={copied}>
            <div className='flex flex-wrap items-center gap-2'>
              <code className='rounded-md border bg-muted px-3 py-2 font-mono text-sm'>{licenseId}</code>
              <Button size='sm' variant='outline' onClick={copy} aria-label={copied ? 'License ID tersalin' : 'Salin License ID'}>
                {copied ? <Check className='size-3.5 text-emerald-600' aria-hidden /> : <Copy className='size-3.5' aria-hidden />}
                {copied ? 'Tersalin' : 'Salin'}
              </Button>
            </div>
          </Step>
          <Step n={2} total={3} title='Jalankan installer Copilot' done={false}>
            <p className='text-sm text-muted-foreground'>
              Buka terminal di workspace Anda dan jalankan perintah installer dari dokumentasi produk.
              Installer akan meminta License ID — tempel yang Anda salin di langkah 1.
            </p>
          </Step>
          <Step n={3} total={3} title='Verifikasi koneksi' done={hasFirstRequest}>
            {hasFirstRequest ? (
              <p className='text-sm text-muted-foreground'>
                Request AI pertama sudah tercatat di server — koneksi Copilot terverifikasi.
              </p>
            ) : (
              <p className='text-sm text-muted-foreground'>
                Setelah terpasang, plugin mengirim request AI ke server. Halaman
                <strong className='text-foreground'> Pemakaian AI</strong> akan menampilkan request
                pertama begitu Copilot dipakai — itu tanda koneksi berhasil.
              </p>
            )}
            {!hasFirstRequest && (
              <p className='text-xs text-amber-600 dark:text-amber-400' role='status'>
                Belum ada request AI tercatat — verifikasi menyusul setelah pemakaian pertama.
              </p>
            )}
          </Step>
        </ol>
      )}

      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-base'><CircleHelp className='size-4 text-muted-foreground' aria-hidden /> Pertanyaan umum</CardTitle>
          <CardDescription>Masalah yang paling sering muncul saat instalasi.</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type='single' collapsible className='w-full'>
            <AccordionItem value='q1'>
              <AccordionTrigger>License ID saya tidak diterima installer</AccordionTrigger>
              <AccordionContent className='text-sm text-muted-foreground'>
                Pastikan Anda menyalin ID lengkap (diawali <code className='font-mono text-xs'>lic_</code>) tanpa spasi.
                Lisensi berstatus dicabut atau kedaluwarsa akan ditolak server — cek status di halaman Status Saya.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value='q2'>
              <AccordionTrigger>Copilot terpasang tapi AI gagal</AccordionTrigger>
              <AccordionContent className='text-sm text-muted-foreground'>
                Kemungkinan kuota lifetime lisensi Anda sudah habis atau model tidak ada di allowlist paket.
                Cek halaman Pemakaian AI; jika kuota habis, perpanjang lewat Paket & Perpanjangan.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value='q3'>
              <AccordionTrigger>Apakah kredensial AI saya dibagikan ke client?</AccordionTrigger>
              <AccordionContent className='text-sm text-muted-foreground'>
                Tidak. Semua entitlement dan kredensial tervalidasi server-side; client hanya memegang
                lisensi tanpa rahasia di dalamnya.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  )
}

function Step({ n, total, title, done, children }: { n: number; total: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <li className='flex gap-4 rounded-lg border bg-card p-4'>
      <div className='flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary'>
        {done ? <Check className='size-4 text-emerald-600' aria-hidden /> : n}
      </div>
      <div className='min-w-0 flex-1 space-y-2'>
        <div className='flex flex-wrap items-center gap-2'>
          <p className='text-sm font-semibold'>{title}</p>
          <span className='text-xs text-muted-foreground'>langkah {n} dari {total}</span>
          {done && <Badge variant='outline' className='bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'>selesai</Badge>}
        </div>
        {children}
      </div>
    </li>
  )
}
