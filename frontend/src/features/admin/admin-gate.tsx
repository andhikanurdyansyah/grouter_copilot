import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAdminAuth } from '@/features/shared/admin-auth'
import { fetchAdminStats } from '@/lib/grouter-api'
import { ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { useLanguage } from '@/context/language-provider'

export function AdminGate() {
  const nav = useNavigate()
  const setToken = useAdminAuth((s) => s.setToken)
  const { language } = useLanguage()
  const isId = language === 'id'
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const token = value.trim()
    if (!token) return
    setBusy(true)
    try {
      // Verifikasi server-side dulu sebelum token dipercaya sesi browser.
      sessionStorage.setItem('adminToken', token)
      await fetchAdminStats()
      setToken(token)
      nav({ to: '/admin', replace: true })
    } catch (err) {
      sessionStorage.removeItem('adminToken')
      const status = (err as { response?: { status?: number } })?.response?.status
      toast.error(
        status === 401
          ? (isId ? 'Token ditolak server (401)' : 'Token rejected by the server (401)')
          : (isId ? 'Gagal memverifikasi token' : 'Could not verify the token'),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <main id='content' className='flex min-h-svh items-center justify-center p-4'>
      <Card className='w-full max-w-sm'>
        <CardHeader>
          <div className='mb-1 flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-sm'>gR</div>
          <h1 className='text-lg font-semibold'>Copilot Admin</h1>
          <CardDescription>
            {isId
              ? 'Masukkan admin token (otorisasi server-side tetap berlaku di setiap request API).'
              : 'Enter the admin token (server-side authorization still applies to every API request).'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='admin-token'>Admin token</Label>
              <Input
                id='admin-token'
                type='password'
                autoComplete='off'
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder='ADMIN_TOKEN'
                required
              />
            </div>
            <Button type='submit' className='w-full' disabled={busy}>
              {busy ? (isId ? 'Memverifikasi…' : 'Verifying…') : (isId ? 'Buka konsol' : 'Open console')}
            </Button>
            <p className='flex items-start gap-1.5 text-xs text-muted-foreground'>
              <ShieldAlert className='size-3.5 mt-0.5 shrink-0' />
              {isId
                ? 'Token tersimpan hanya di sessionStorage browser ini, tidak pernah dikirim ke tempat lain selain API admin.'
                : 'The token is stored only in this browser’s sessionStorage and is never sent anywhere except the admin API.'}
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
