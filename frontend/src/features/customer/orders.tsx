import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchPlans, fetchMe, formatIDR, fmtDate } from '@/lib/grouter-api'
import { PageHeader } from '@/components/shared/page-header'
import { StatusBadge } from '@/components/shared/status-badge'
import { TableSkeleton, ErrorState } from '@/components/shared/data-states'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { api } from '@/lib/grouter-api'
import { toast } from 'sonner'
import { Check, Clock, Copy, Sparkles, Mail } from 'lucide-react'
import { Link } from '@tanstack/react-router'

interface OrderResp {
  order?: { id: string; qrString?: string; qrUrl?: string; amount?: number; packageKey?: string }
  [k: string]: unknown
}

interface Plan {
  key: string
  name: string
  amount: number
  expiresInDays: number
  quota?: number | null
  ai?: { enabled?: boolean; quotaTokens?: number | null }
}

function daysLeft(iso?: string): number | null {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / 86_400_000))
}

// Paket & Perpanjangan: keputusan pembelian dulu — paket aktif & status order
// di atas, perbandingan paket sebagai kartu (bukan tabel mentah), harga nol
// = state "penjualan langsung" (hubungi sales), bukan produk gratis.
export function CustomerOrders() {
  const qc = useQueryClient()
  const plans = useQuery({ queryKey: ['plans'], queryFn: fetchPlans })
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe })
  const [qr, setQr] = useState<OrderResp | null>(null)

  const buy = useMutation({
    mutationFn: async (packageKey: string) => {
      // Pricing selalu server-side: hanya packageKey yang dikirim.
      const { data } = await api.post<OrderResp>('/orders', { packageKey })
      return data
    },
    onSuccess: (data) => {
      setQr(data)
      qc.invalidateQueries({ queryKey: ['me'] })
      qc.invalidateQueries({ queryKey: ['orders-latest'] })
    },
    onError: (e) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error('Checkout gagal: ' + (msg || 'coba lagi'))
    },
  })

  if (plans.isPending) {
    return (
      <div className='space-y-5'>
        <PageHeader title='Paket & Perpanjangan' description='Pilih paket yang sesuai kebutuhan AI Anda.' />
        <TableSkeleton rows={3} cols={3} />
      </div>
    )
  }
  if (plans.isError) {
    return (
      <div className='space-y-5'>
        <PageHeader title='Paket & Perpanjangan' description='Pilih paket yang sesuai kebutuhan AI Anda.' />
        <ErrorState
          status={(plans.error as { response?: { status?: number } })?.response?.status}
          message={(plans.error as Error).message}
          onRetry={() => plans.refetch()}
        />
      </div>
    )
  }

  const planList = (plans.data?.plans ?? []) as Plan[]
  // Paket reguler berharga → checkout; paket reguler tanpa harga → unpriced;
  // paket 'custom' → jalur sales (by design).
  const isCustom = (p: Plan) => p.key === 'custom' || /custom/i.test(p.name)
  const purchasable = planList.filter((p) => p.amount > 0)
  const unpricedList = planList.filter((p) => !(p.amount > 0) && !isCustom(p))
  const salesOnly = planList.filter((p) => !(p.amount > 0) && isCustom(p))

  // Paket aktif customer (entitlement nyata)
  const myLicense = me.data?.licenses?.find((l) => String(l.status ?? 'active') === 'active') ?? me.data?.licenses?.[0]
  const myUsage = me.data?.usage?.find((u) => u.licenseId === myLicense?.id)
  const activePlan = myLicense?.planKey ? planList.find((p) => p.key === myLicense.planKey) : undefined
  const quota = myUsage?.quotaLimit ?? activePlan?.ai?.quotaTokens ?? null
  const used = myUsage?.usedTokens ?? 0
  const remainingDays = daysLeft(myLicense?.expiresAt)

  return (
    <div className='mx-auto flex max-w-6xl flex-col gap-6'>
      <PageHeader
        title='Paket & Perpanjangan'
        description='Kuota token berlaku selama masa aktif lisensi dan tidak direset bulanan. Harga sudah termasuk kode unik pembayaran QRIS untuk verifikasi otomatis.'
      />

      {/* PAKET AKTIF ANDA — konteks keputusan sebelum katalog */}
      {myLicense && (
        <section aria-labelledby='active-plan'>
          <Card className='border-primary/25 bg-primary/[0.04]'>
            <CardContent className='flex flex-wrap items-center justify-between gap-4 p-5'>
              <div>
                <div className='flex flex-wrap items-center gap-2'>
                  <Sparkles className='size-4 text-primary' aria-hidden />
                  <h2 id='active-plan' className='text-sm font-medium'>
                    Paket aktif Anda: {activePlan?.name ?? myLicense.planKey ?? '—'}
                  </h2>
                  <StatusBadge tone='success'>aktif</StatusBadge>
                </div>
                <p className='mt-1 text-sm text-muted-foreground'>
                  {remainingDays !== null ? `Sisa ${remainingDays} hari · ` : ''}
                  Berlaku s.d. {myLicense.expiresAt ? new Date(myLicense.expiresAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}
                  {quota !== null && quota !== undefined ? ` · terpakai ${used.toLocaleString('id-ID')} dari ${quota.toLocaleString('id-ID')} token` : ' · kuota unlimited'}
                </p>
              </div>
              <Button asChild variant='outline' size='sm'>
                <Link to='/user/usage'>Lihat pemakaian</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      )}

      <LatestOrder />

      {/* PERBANDINGAN PAKET — kartu, bukan tabel */}
      <section aria-labelledby='plan-comparison'>
        <h2 id='plan-comparison' className='text-lg font-medium tracking-tight'>Pilih paket Anda</h2>
        <p className='mt-0.5 text-sm text-muted-foreground'>Semua paket memakai gateway AI yang sama — beda durasi dan kuota token.</p>
        <div className='mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
          {[...purchasable, ...unpricedList, ...salesOnly].map((p) => (
            <PlanCard
              key={p.key}
              plan={p}
              current={myLicense?.planKey === p.key}
              onBuy={p.amount > 0 ? () => buy.mutate(p.key) : undefined}
              buying={buy.isPending}
              salesOnly={isCustom(p)}
            />
          ))}
        </div>
      </section>

      {/* CHECKOUT QRIS */}
      <Dialog open={!!qr} onOpenChange={(open) => { if (!open) setQr(null) }}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>Selesaikan pembayaran</DialogTitle>
            <DialogDescription>
              Order <code className='font-mono text-xs'>{String((qr?.order as { id?: string })?.id ?? '')}</code> —
              scan QR berikut dengan aplikasi pembayaran Anda. Lisensi terbit otomatis setelah pembayaran terverifikasi server
              (biasanya beberapa detik setelah pembayaran).
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const o = qr?.order as { qrString?: string; qrUrl?: string; amount?: number } | undefined
            const qrValue = o?.qrUrl || o?.qrString
            return (
              <div className='flex flex-col items-center gap-3 py-2'>
                {o?.amount ? (
                  <p className='text-2xl font-semibold tabular-nums'>{formatIDR(o.amount)}</p>
                ) : (
                  <p className='text-sm text-muted-foreground'>Jumlah tagihan mengikuti konfirmasi server.</p>
                )}
                {qrValue ? (
                  <img
                    src={'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(qrValue)}
                    alt='Kode QR pembayaran QRIS'
                    className='rounded-md border bg-white p-2'
                    width={220}
                    height={220}
                  />
                ) : (
                  <div className='chassis-well w-full break-all px-3 py-2 font-mono text-xs'>{qrValue || 'QR tidak tersedia'}</div>
                )}
                <p className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                  <Clock className='size-3.5' aria-hidden /> Biarkan halaman ini terbuka — status order diperbarui otomatis.
                </p>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PlanCard({ plan, current, onBuy, buying, salesOnly }: {
  plan: Plan
  current?: boolean
  onBuy?: () => void
  buying?: boolean
  salesOnly?: boolean
}) {
  const tokens = plan.ai?.quotaTokens
  // Paket reguler tanpa harga terkonfigurasi ≠ gratis: tampilkan state
  // "harga belum tersedia" — jangan pernah menampilkan harga nol sebagai harga beli.
  const unpriced = !salesOnly && !plan.amount
  const specParts = [
    `Lisensi aktif ${plan.expiresInDays} hari`,
    tokens !== null && tokens !== undefined
      ? `Kuota hingga ${tokens.toLocaleString('id-ID')} token`
      : 'Kuota AI ditetapkan saat aktivasi',
  ]
  return (
    <Card className={'relative flex flex-col py-0 ' + (current ? 'border-primary/50 ring-1 ring-primary/30' : salesOnly ? '' : 'border-amber-500/25')}>
      {current && (
        <span className='absolute -top-2.5 left-4 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary-foreground'>
          Paket Anda
        </span>
      )}
      <CardContent className='flex flex-1 flex-col p-5'>
        <div className='flex items-baseline justify-between gap-2'>
          <h3 className='text-base font-medium'>{plan.name}</h3>
          {salesOnly ? (
            <p className='text-2xl font-semibold tracking-tight text-muted-foreground'>Custom</p>
          ) : unpriced ? (
            <Badge variant='outline' className='border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400'>Harga belum tersedia</Badge>
          ) : (
            <p className='text-2xl font-semibold tabular-nums tracking-tight'>{formatIDR(plan.amount)}</p>
          )}
        </div>
        {/* Satu baris spesifikasi: durasi · kuota — tidak ada duplikasi jargon */}
        <p className='mt-1 text-sm text-muted-foreground'>{specParts.join(' · ')}</p>

        <ul className='mt-4 flex-1 space-y-2.5 text-sm'>
          <li className='flex items-center gap-2 text-muted-foreground'>
            <Check className='size-4 text-emerald-500' aria-hidden />
            Kuota berlaku selama masa aktif lisensi — tidak direset bulanan
          </li>
          <li className='flex items-center gap-2 text-muted-foreground'>
            <Check className='size-4 text-emerald-500' aria-hidden />
            Pembayaran QRIS terverifikasi otomatis oleh server
          </li>
        </ul>

        <div className='mt-5 border-t pt-4'>
          {current ? (
            <Button className='w-full' variant='outline' disabled aria-label={'Paket ' + plan.name + ' sedang aktif'}>
              Sedang aktif
            </Button>
          ) : salesOnly || unpriced ? (
            <div className='space-y-2'>
              <Button variant='outline' className='w-full' asChild>
                <a href={`mailto:sales@grouter.web.id?subject=${encodeURIComponent('Paket ' + plan.name + ' — gRouter Copilot')}`}>
                  <Mail className='size-4' aria-hidden /> Hubungi sales
                </a>
              </Button>
              <p className='text-xs text-muted-foreground'>
                {unpriced
                  ? 'Harga paket ini belum ditetapkan — hubungi sales untuk informasi ketersediaan.'
                  : 'Paket custom (volume/harga khusus) disusun bersama tim kami.'}
              </p>
            </div>
          ) : (
            <Button
              className='w-full'
              onClick={onBuy}
              disabled={buying || !onBuy}
            >
              {buying ? 'Memproses…' : 'Beli via QRIS'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// Status order terakhir: kontekstual — pending = lanjut bayar; paid = selesai.
function LatestOrder() {
  const latest = useQuery({
    queryKey: ['orders-latest'],
    queryFn: async () => (await api.get('/orders/latest')).data as { order: { id: string; packageKey?: string; amount?: number; status?: string; createdAt?: number | string } | null },
  })
  const [copied, setCopied] = useState(false)
  if (latest.isPending || latest.isError) return null
  const o = latest.data?.order
  if (!o) return null
  const st = String(o.status || '').toUpperCase()
  const pending = st === 'PENDING'

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(o.id)
      setCopied(true)
      toast.success('Order ID disalin')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Gagal menyalin')
    }
  }

  return (
    <Card className={pending ? 'border-amber-500/30 bg-amber-500/[0.04]' : 'py-0'}>
      <CardContent className={'flex flex-wrap items-center gap-x-6 gap-y-3 ' + (pending ? 'p-5' : 'px-4 py-3.5')}>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2'>
            <p className='label-mono'>{pending ? 'Menunggu pembayaran' : 'Order terakhir'}</p>
            <StatusBadge tone={st === 'PAID' ? 'success' : pending ? 'warning' : 'danger'}>
              {st === 'PAID' ? 'dibayar' : pending ? 'menunggu pembayaran' : st.toLowerCase()}
            </StatusBadge>
          </div>
          <p className='mt-1 text-sm'>
            <button type='button' onClick={copyId} className='group inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground' aria-label={'Salin order ID ' + o.id}>
              {o.id}
              {copied ? <Check className='size-3 text-emerald-500' aria-hidden /> : <Copy className='size-3 opacity-0 transition-opacity group-hover:opacity-100' aria-hidden />}
            </button>
            {o.packageKey ? <span> · {o.packageKey}</span> : null}
            {o.amount ? <span> · {formatIDR(o.amount)}</span> : null}
            <span> · {fmtDate(o.createdAt)}</span>
          </p>
        </div>
        {pending && (
          <Badge variant='outline' className='border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'>
            <Clock className='size-3' aria-hidden /> selesaikan pembayaran QRIS untuk menerbitkan lisensi
          </Badge>
        )}
      </CardContent>
    </Card>
  )
}
