import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * /sign-up — kompat lama. Rute ini dulu render form showcase TANPA handler
 * (selalu "berhasil" tanpa request backend — D-01). Satu-satunya
 * sign-up nyata adalah /login/sign-up (POST /api/auth/sign-up/email).
 * Jangan pernah render form registrasi di production tanpa handler.
 */
export const Route = createFileRoute('/sign-up')({
  beforeLoad: () => {
    throw redirect({ to: '/login/sign-up', replace: true })
  },
  component: () => null,
})
