import { useQuery } from '@tanstack/react-query'
import { fetchHealth, fetchAdminSettings } from '@/lib/grouter-api'
import { PageHeader } from '@/components/shared/page-header'
import { StatusBadge } from '@/components/shared/status-badge'
import { TableSkeleton } from '@/components/shared/data-states'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function AdminSettings() {
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, refetchInterval: 60_000 })
  const settings = useQuery({ queryKey: ['admin-settings'], queryFn: fetchAdminSettings })

  if (settings.isPending) {
    return (
      <div className='space-y-5'>
        <PageHeader title='Pengaturan Infrastruktur' description='Konfigurasi global & kesehatan backend.' />
        <TableSkeleton rows={4} cols={3} />
      </div>
    )
  }
  const s = (settings.data as { settings?: Record<string, unknown> })?.settings ?? {}
  const provider = s.provider as { model?: string } | undefined
  const aiEnabled = s.aiEnabled

  return (
    <div className='space-y-5'>
      <PageHeader
        title='Pengaturan Infrastruktur'
        description='Konfigurasi global provider & kesehatan backend. Kebijakan AI per-paket ada di menu Paket & AI Policy.'
      />

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Kesehatan Backend</CardTitle>
        </CardHeader>
        <CardContent className='flex items-center gap-3'>
          {health.isError ? (
            <StatusBadge tone='danger'>Tak terjangkau</StatusBadge>
          ) : (
            <StatusBadge tone='success'>Sehat</StatusBadge>
          )}
          <span className='text-sm text-muted-foreground'>/api/health · polling 60 dtk</span>
          <Button variant='ghost' size='sm' className='ml-auto' onClick={() => health.refetch()}>
            <RefreshCw className='size-3.5' /> Cek sekarang
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Provider AI Global</CardTitle>
          <CardDescription>
            Fallback infrastruktur saja. Entitlement customer ditentukan kebijakan paket di menu Paket & AI Policy.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-3 text-sm'>
          <div className='flex items-center justify-between gap-4 border-b pb-2'>
            <span className='text-muted-foreground'>Model global</span>
            <span className='font-mono text-xs'>{provider?.model || '—'}</span>
          </div>
          <div className='flex items-center justify-between gap-4'>
            <span className='text-muted-foreground'>AI global</span>
            <StatusBadge tone={aiEnabled ? 'success' : 'neutral'}>{aiEnabled ? 'aktif' : 'mati'}</StatusBadge>
          </div>
          <p className='text-xs text-muted-foreground pt-1'>
            Nilai sensitif (API key gateway, admin token, kredensial pembayaran) tidak pernah dikirim ke browser.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
