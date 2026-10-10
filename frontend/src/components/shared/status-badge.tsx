import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// Status semantik: success | warning | danger | neutral | info.
// Satu kamus warna utk customer & admin (tidak tiap halaman beda warna).
const STYLES: Record<string, string> = {
  success: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
  warning: 'bg-amber-500/10 text-amber-800 dark:text-amber-400 border-amber-500/20',
  danger: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
  neutral: 'bg-muted text-slate-700 dark:text-slate-300 border-border',
  info: 'bg-primary/10 text-primary border-primary/20',
}

export type StatusTone = keyof typeof STYLES

export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: StatusTone
  children: React.ReactNode
  className?: string
}) {
  return (
    <Badge variant='outline' className={cn(STYLES[tone] ?? STYLES.neutral, className)}>
      {children}
    </Badge>
  )
}

// Pemetaan status lisensi/order → tone (single source of truth)
export function licenseTone(status: string): StatusTone {
  if (status === 'active') return 'success'
  if (status === 'expired') return 'warning'
  if (status === 'revoked') return 'danger'
  return 'neutral'
}

export function orderTone(status: string): StatusTone {
  const s = status?.toUpperCase()
  if (s === 'PAID') return 'success'
  if (s === 'PENDING') return 'warning'
  return 'danger'
}
