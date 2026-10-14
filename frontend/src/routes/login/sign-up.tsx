import { createFileRoute } from '@tanstack/react-router'
import { AuthComponent } from '@/components/ui/sign-up'

/**
 * /login/sign-up — Sign-up EMAIL murni (tanpa social), design /app/sign-up.
 * Wiring Better Auth nyata: POST /api/auth/sign-up/email {name, email, password}
 * → sukses: redirect /user (dashboard customer).
 */
export const Route = createFileRoute('/login/sign-up')({
  component: LoginPageSignUp,
})

function LoginPageSignUp() {
  const handleSignUp = async (payload: { email: string; password: string }) => {
    // Better Auth wajib name — pakai local-part email bila tak diisi user.
    const name = payload.email.split('@')[0] || 'User'
    const res = await fetch('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ name, email: payload.email, password: payload.password }),
    })
    if (res.ok) {
      setTimeout(() => { window.location.href = '/user' }, 1600) // biar confetti+modal success terlihat
      return
    }
    const data = await res.json().catch(() => null)
    const message =
      (data && (data.message || data.error || (data.errors && data.errors[0] && data.errors[0].message))) ||
      `Sign-up failed (${res.status}).`
    throw new Error(message)
  }

  return (
    <div className="relative">
      <AuthComponent
        brandName="gRouter Copilot"
        hideSocial
        onSignUp={handleSignUp}
      />
      <p className="fixed bottom-5 left-1/2 -translate-x-1/2 z-20 text-sm text-muted-foreground">
        Already have an account?{' '}
        <a href="/login" className="font-semibold text-foreground hover:underline">Sign in</a>
      </p>
    </div>
  )
}
