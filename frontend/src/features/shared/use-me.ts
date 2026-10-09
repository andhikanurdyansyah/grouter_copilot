import { useQuery } from '@tanstack/react-query'
import { api, fetchMe, type Me } from '@/lib/grouter-api'

// Mengambil identitas customer via better-auth session (same-origin cookie).
// enabled=false untuk admin (tak perlu).
export function useMe(enabled = true) {
  return useQuery<Me, Error>({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await fetchMe()
      } catch (e) {
        const status = (e as { response?: { status?: number } })?.response?.status
        if (status === 401) {
          // sesi tak valid → kembali ke login server-rendered
          window.location.href = '/login'
        }
        throw e
      }
    },
    enabled,
    retry: false,
    staleTime: 10_000,
  })
}

export { api }
