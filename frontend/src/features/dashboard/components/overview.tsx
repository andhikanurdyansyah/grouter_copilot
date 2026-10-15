import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { fetchLedger } from '@/lib/grouter-api'

export function Overview() {
  const ledger = useQuery({ queryKey: ['dashboard-overview-chart-ledger'], queryFn: () => fetchLedger({ limit: 200 }) })
  const records = (ledger.data?.records ?? []) as Array<{ totalTokens?: number | null; inputTokens?: number | null; outputTokens?: number | null; createdAt?: number | null }>
  const [nowMs] = useState(() => Date.now())
  const days = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(nowMs - (11 - index) * 86_400_000)
    const key = date.toLocaleDateString('id-ID', { month: 'short', day: 'numeric' })
    const total = records.filter((r) => r.createdAt && new Date(r.createdAt).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' }) === key)
      .reduce((sum, r) => sum + (r.totalTokens ?? (r.inputTokens ?? 0) + (r.outputTokens ?? 0)), 0)
    return { key, total }
  })
  const max = Math.max(1, ...days.map((d) => d.total))
  return (
    <div className='space-y-3'>
      <div className='flex h-64 items-end gap-1 border-b border-border px-2'>
        {days.map((day) => (
          <div key={day.key} className='group flex h-full flex-1 items-end'>
            <div className='w-full rounded-t bg-primary/70 transition-opacity group-hover:opacity-80' style={{ height: `${Math.max(2, (day.total / max) * 100)}%` }} title={`${day.key}: ${day.total.toLocaleString('id-ID')} tokens`} />
          </div>
        ))}
      </div>
      <div className='flex justify-between text-[10px] text-muted-foreground font-mono'>{days.map((day) => <span key={day.key}>{day.key}</span>)}</div>
    </div>
  )
}
