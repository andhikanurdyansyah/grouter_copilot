import { createFileRoute, redirect } from '@tanstack/react-router'

// Entry root: redirect ke /admin jika ada adminToken di sessionStorage,
// atau ke /user (dashboard customer PT Maju Digital) jika tidak.
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    if (typeof window !== 'undefined') {
      const adminToken = sessionStorage.getItem('adminToken')
      if (adminToken) {
        throw redirect({ to: '/admin' })
      }
    }
    throw redirect({ to: '/user' })
  },
})
