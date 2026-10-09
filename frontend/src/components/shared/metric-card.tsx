import { cn } from '@/lib/utils'

// Metrik ringkas: label kecil + nilai besar tabular. Tidak ada ikon dekoratif,
// tidak ada kartu besar — density disengaja utk konsol operasional.
export function MetricCard({
  label,
  value,
  sub,
  tone,
  className,
}: {
  label: string
  value: string | number
  sub?: string
  tone?: 'default' | 'success' | 'warning' | 'danger'
  className?: string
}) {
  const toneCls =
    tone === 'success' ? 'text-emerald-600 dark:text-emerald-400'
    : tone === 'warning' ? 'text-amber-600 dark:text-amber-400'
    : tone === 'danger' ? 'text-red-600 dark:text-red-400'
    : ''
  return (
    <div className={cn('rounded-lg border bg-card px-4 py-3', className)}>
      <p className='text-xs font-medium text-muted-foreground'>{label}</p>
      <p className={cn('mt-1 text-2xl font-semibold tabular-nums tracking-tight', toneCls)}>
        {typeof value === 'number' ? value.toLocaleString('id-ID') : value}
      </p>
      {sub && <p className='mt-0.5 text-xs text-muted-foreground'>{sub}</p>}
    </div>
  )
}
