import { useNavigate } from '@tanstack/react-router'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useAdminAuth } from '@/features/shared/admin-auth'

interface SignOutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SignOutDialog({ open, onOpenChange }: SignOutDialogProps) {
  const navigate = useNavigate()
  const isAdmin = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')

  const handleSignOut = async () => {
    if (isAdmin) {
      // Admin: hapus token sesi browser (server-side auth tetap berlaku tiap request)
      useAdminAuth.getState().clear()
      navigate({ to: '/admin-gate', replace: true })
      return
    }
    // Customer: akhiri sesi better-auth di server, lalu ke halaman login server-rendered
    try {
      await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' })
    } catch {
      // abaikan — tetap arahkan ke login
    }
    window.location.href = '/login'
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title='Keluar'
      desc='Anda yakin ingin keluar? Anda perlu masuk lagi untuk mengakses akun.'
      confirmText='Keluar'
      destructive
      handleConfirm={handleSignOut}
      className='sm:max-w-sm'
    />
  )
}
