import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface ChangePasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Ubah password customer (Better Auth /api/auth/change-password).
 * Wajib session cookie; browser otomatis mengirim Origin (CSRF origin-check server).
 * Setelah sukses: sesi lain TIDAK dicabut (hanya reset password yang mencabut).
 */
export function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const reset = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setError('')
    setDone(false)
    setBusy(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (newPassword.length < 8) {
      setError('Password baru minimal 8 karakter.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Konfirmasi password tidak sama.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok) {
        setDone(true)
        return
      }
      const msg =
        (data && (data.message || data.error)) ||
        (res.status === 401 ? 'Password saat ini salah.' : `Gagal (${res.status}). Coba lagi.`)
      setError(msg)
    } catch {
      setError('Tidak dapat menghubungi server. Periksa koneksi Anda.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className='sm:max-w-sm'>
        {done ? (
          <>
            <DialogHeader>
              <DialogTitle>Password diubah</DialogTitle>
              <DialogDescription>
                Password Anda sudah diganti. Gunakan password baru saat masuk berikutnya.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                onClick={() => {
                  reset()
                  onOpenChange(false)
                }}
              >
                Selesai
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Ubah password</DialogTitle>
              <DialogDescription>
                Gunakan password minimal 8 karakter yang belum pernah Anda pakai di layanan lain.
              </DialogDescription>
            </DialogHeader>
            <div className='grid gap-4 py-4'>
              <div className='grid gap-2'>
                <Label htmlFor='cp-current'>Password saat ini</Label>
                <Input
                  id='cp-current'
                  type='password'
                  autoComplete='current-password'
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='cp-new'>Password baru</Label>
                <Input
                  id='cp-new'
                  type='password'
                  autoComplete='new-password'
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='cp-confirm'>Ulangi password baru</Label>
                <Input
                  id='cp-confirm'
                  type='password'
                  autoComplete='new-password'
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              {error && (
                <p role='alert' className='text-sm text-destructive'>
                  {error}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
                Batal
              </Button>
              <Button type='submit' disabled={busy}>
                {busy ? 'Menyimpan…' : 'Simpan'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
