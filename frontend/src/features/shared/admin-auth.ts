import { create } from 'zustand'

const KEY = 'adminToken'

interface AdminAuthState {
  token: string
  setToken: (t: string) => void
  clear: () => void
}

export const useAdminAuth = create<AdminAuthState>()((set) => ({
  token: (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(KEY)) || '',
  setToken: (t) => {
    sessionStorage.setItem(KEY, t)
    set({ token: t })
  },
  clear: () => {
    sessionStorage.removeItem(KEY)
    set({ token: '' })
  },
}))
