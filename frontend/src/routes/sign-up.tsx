import { createFileRoute } from '@tanstack/react-router'
import { AuthComponent } from '@/components/ui/sign-up'

/**
 * /sign-up — Glass sign-up experience (shadcn UI component integration).
 * Showcase mode: tanpa handler backend, onboarding disimulasikan.
 * Wire ke Better Auth: pass onSignUp={(p) => ...} → POST /api/auth/sign-up/email
 * dan onSocial untuk /api/auth/sign-in/social.
 */
export const Route = createFileRoute('/sign-up')({
  component: SignUpPage,
})

function SignUpPage() {
  return <AuthComponent brandName="gRouter Copilot" />
}
