import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Inbox } from 'lucide-react'

// Loading skeleton untuk tabel (baris konsisten)
export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className='space-y-2' aria-busy='true' aria-label='Memuat data'>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className='flex gap-3'>
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className='h-9 flex-1' />
          ))}
        </div>
      ))}
    </div>
  )
}

// Empty state dengan ikon + CTA opsional
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-center px-4', className)}>
      <Inbox className='size-8 text-muted-foreground/60' aria-hidden />
      <p className='text-sm font-medium'>{title}</p>
      {description && <p className='text-sm text-muted-foreground max-w-md text-pretty'>{description}</p>}
      {action && <div className='pt-2'>{action}</div>}
    </div>
  )
}

// Error state dengan retry
export function ErrorState({
  message,
  onRetry,
  status,
}: {
  message: string
  onRetry?: () => void
  status?: number
}) {
  return (
    <div role='alert' className='flex flex-col items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 py-10 text-center px-4'>
      <AlertTriangle className='size-7 text-red-600 dark:text-red-400' aria-hidden />
      <p className='text-sm font-medium'>
        {status === 401 ? 'Sesi tidak valid' : 'Gagal memuat data'}
      </p>
      <p className='text-sm text-muted-foreground max-w-md'>
        {status === 401 ? 'Muat ulang halaman atau masuk kembali untuk melanjutkan.' : message}
      </p>
      {onRetry && (
        <Button variant='outline' size='sm' onClick={onRetry}>
          Coba lagi
        </Button>
      )}
    </div>
  )
}
