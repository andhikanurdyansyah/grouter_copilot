import { useQuery } from '@tanstack/react-query'
import { fetchHealth, fetchAdminSettings } from '@/lib/grouter-api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

export function AdminSettings() {
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, refetchInterval: 60_000 })
  const settings = useQuery({ queryKey: ['admin-settings'], queryFn: fetchAdminSettings })

  if (settings.isLoading) return <Skeleton className='h-64' />
  const s = (settings.data as { settings?: Record<string, unknown> })?.settings ?? {}
  const provider = s.provider as { model?: string } | undefined
  const aiEnabled = s.aiEnabled

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>Pengaturan Infrastruktur</h1>
        <p className='text-muted-foreground text-sm'>
          Konfigurasi global provider & kesehatan backend. Kebijakan AI per-paket ada di
          menu Paket & AI Policy.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Kesehatan Backend</CardTitle>
        </CardHeader>
        <CardContent className='flex items-center gap-3'>
          {health.isError ? (
            <Badge variant='destructive'>Tak terjangkau</Badge>
          ) : (
            <Badge variant='default'>Sehat</Badge>
          )}
          <span className='text-sm text-muted-foreground'>/api/health — polling 60 detik</span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Provider AI Global</CardTitle>
          <CardDescription>
            Fallback infrastruktur saja. Entitlement customer ditentukan kebijakan paket.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-2 text-sm'>
          <div className='flex justify-between gap-4'>
            <span className='text-muted-foreground'>Model global</span>
            <span className='font-mono text-xs'>{provider?.model || '—'}</span>
          </div>
          <div className='flex justify-between gap-4'>
            <span className='text-muted-foreground'>AI global</span>
            <Badge variant={aiEnabled ? 'default' : 'secondary'}>
              {aiEnabled ? 'aktif' : 'mati'}
            </Badge>
          </div>
          <p className='text-xs text-muted-foreground pt-2'>
            Nilai sensitif (API key, token admin, kredensial pembayaran) tidak pernah
            dikirim ke browser.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
