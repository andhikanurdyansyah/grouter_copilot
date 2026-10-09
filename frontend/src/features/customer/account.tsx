import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMe } from '@/lib/grouter-api'
import { PageHeader } from '@/components/shared/page-header'
import { TableSkeleton } from '@/components/shared/data-states'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/shared/status-badge'
import { LogOut } from 'lucide-react'
import { SignOutDialog } from '@/components/sign-out-dialog'

export function CustomerAccount() {
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe })
  const [signOutOpen, setSignOutOpen] = useState(false)

  if (me.isPending) {
    return (
      <div className='space-y-5'>
        <PageHeader title='Akun' description='Identitas dan sesi Anda.' />
        <TableSkeleton rows={2} cols={3} />
      </div>
    )
  }
  const { account, licenses } = me.data!

  return (
    <div className='space-y-5 max-w-2xl'>
      <PageHeader title='Akun' description='Identitas akun dan pengelolaan sesi.' />

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Identitas</CardTitle>
        </CardHeader>
        <CardContent className='space-y-3 text-sm'>
          <div className='flex items-center justify-between gap-4 border-b pb-2'>
            <span className='text-muted-foreground'>Nama</span>
            <span className='font-medium'>{account.name}</span>
          </div>
          <div className='flex items-center justify-between gap-4 border-b pb-2'>
            <span className='text-muted-foreground'>Email</span>
            <span>{account.email}</span>
          </div>
          <div className='flex items-center justify-between gap-4'>
            <span className='text-muted-foreground'>Lisensi</span>
            <StatusBadge tone={licenses.length > 0 ? 'success' : 'neutral'}>
              {licenses.length > 0 ? `${licenses.length} lisensi` : 'belum ada'}
            </StatusBadge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Sesi</CardTitle>
          <CardDescription>Sesi login browser ini otomatis berakhir saat cookie sesi hangus.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant='outline' className='text-destructive hover:text-destructive' onClick={() => setSignOutOpen(true)}>
            <LogOut className='size-4' /> Keluar dari akun
          </Button>
          <SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
        </CardContent>
      </Card>
    </div>
  )
}
