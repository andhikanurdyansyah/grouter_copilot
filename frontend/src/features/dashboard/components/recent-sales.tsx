import { useQuery } from '@tanstack/react-query'
import { fetchLedger } from '@/lib/grouter-api'
import { useLanguage } from '@/context/language-provider'

export function RecentSales() {
  const { language } = useLanguage()
  const isId = language === 'id'
  const ledger = useQuery({ queryKey: ['dashboard-recent-ledger'], queryFn: () => fetchLedger({ limit: 5 }) })
  const records = (ledger.data?.records ?? []) as Array<{ licenseId: string; customer?: string | null; totalTokens?: number | null; inputTokens?: number | null; outputTokens?: number | null }>
  if (ledger.isLoading) return <p className='text-sm text-muted-foreground'>{isId ? 'Memuat data…' : 'Loading data…'}</p>
  if (!records.length) return <p className='text-sm text-muted-foreground'>{isId ? 'Belum ada aktivitas ledger.' : 'No ledger activity yet.'}</p>
  return (
    <div className='space-y-4'>
      {records.map((record) => {
        const tokens = record.totalTokens ?? (record.inputTokens ?? 0) + (record.outputTokens ?? 0)
        return (
          <div key={`${record.licenseId}-${tokens}`} className='flex items-center gap-4'>
            <div className='flex h-9 w-9 items-center justify-center rounded-full border bg-muted font-mono text-xs'>AI</div>
            <div className='flex flex-1 flex-wrap items-center justify-between gap-2'>
              <div className='space-y-1'>
                <p className='text-sm leading-none font-medium'>{record.customer || record.licenseId}</p>
                <p className='text-xs text-muted-foreground font-mono'>{record.licenseId}</p>
              </div>
              <div className='font-mono text-sm'>{tokens.toLocaleString('id-ID')} token</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
