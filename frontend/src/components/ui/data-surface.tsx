import { AlertTriangle, Inbox, Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useLanguage } from '@/context/language-provider'

/**
 * Shared data-surface states (D-13).
 *
 * Every route that reads server data must distinguish four states instead of
 * rendering an empty layout that looks like "no records":
 *   loading  -> skeleton that mirrors the shape of the real content
 *   error    -> honest failure with a retry affordance (never a success look)
 *   empty    -> truthful "no records yet" with an optional next action
 *   ready    -> caller renders real data
 *
 * These components are presentation only; they never fabricate counts,
 * statuses, or placeholder business values.
 */

type SurfaceCopy = {
  loading: string
  errorTitle: string
  errorBody: string
  retry: string
  emptyTitle: string
  emptyBody: string
}

const COPY: Record<'id' | 'en', SurfaceCopy> = {
  id: {
    loading: 'Memuat data…',
    errorTitle: 'Gagal memuat data',
    errorBody: 'Server tidak mengembalikan data. Periksa koneksi Anda lalu coba lagi.',
    retry: 'Coba lagi',
    emptyTitle: 'Belum ada data',
    emptyBody: 'Belum ada catatan untuk ditampilkan di sini.',
  },
  en: {
    loading: 'Loading data…',
    errorTitle: 'Could not load data',
    errorBody: 'The server did not return data. Check your connection and try again.',
    retry: 'Try again',
    emptyTitle: 'Nothing here yet',
    emptyBody: 'There are no records to show yet.',
  },
}

function useSurfaceCopy() {
  const { language } = useLanguage()
  return COPY[language === 'en' ? 'en' : 'id']
}

/** Skeleton block sized like the content it replaces. */
export function SurfaceSkeleton({
  rows = 4,
  className,
  label,
}: {
  rows?: number
  className?: string
  label?: string
}) {
  const copy = useSurfaceCopy()
  return (
    <div
      role='status'
      aria-live='polite'
      aria-busy='true'
      aria-label={label ?? copy.loading}
      className={cn('space-y-3', className)}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className='flex items-center gap-3'>
          <Skeleton className='h-9 w-9 shrink-0 rounded-lg' />
          <div className='flex-1 space-y-2'>
            <Skeleton className='h-3 w-2/5' />
            <Skeleton className='h-3 w-1/4' />
          </div>
          <Skeleton className='h-6 w-16 rounded-full' />
        </div>
      ))}
      <span className='sr-only'>{copy.loading}</span>
    </div>
  )
}

/** Inline loading row for small widgets (KPI tiles, badges). */
export function InlineLoading({ className, label }: { className?: string; label?: string }) {
  const copy = useSurfaceCopy()
  return (
    <span
      role='status'
      aria-live='polite'
      aria-busy='true'
      className={cn('inline-flex items-center gap-2 text-xs text-muted-foreground', className)}
    >
      <Loader2 className='size-3.5 animate-spin' aria-hidden='true' />
      <span>{label ?? copy.loading}</span>
    </span>
  )
}

/** Honest failure surface with retry. Never styled as success. */
export function SurfaceError({
  onRetry,
  title,
  body,
  className,
  compact = false,
}: {
  onRetry?: () => void
  title?: string
  body?: string
  className?: string
  compact?: boolean
}) {
  const copy = useSurfaceCopy()
  return (
    <div
      role='alert'
      className={cn(
        'flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5',
        compact ? 'p-3' : 'p-5',
        className,
      )}
    >
      <div className='flex items-start gap-3'>
        <AlertTriangle className='mt-0.5 size-4 shrink-0 text-destructive' aria-hidden='true' />
        <div className='space-y-1'>
          <p className='text-sm font-semibold text-foreground'>{title ?? copy.errorTitle}</p>
          <p className='text-xs leading-relaxed text-muted-foreground'>{body ?? copy.errorBody}</p>
        </div>
      </div>
      {onRetry ? (
        <Button type='button' size='sm' variant='outline' onClick={onRetry} className='h-8 gap-1.5 text-xs'>
          <RefreshCw className='size-3.5' aria-hidden='true' />
          {copy.retry}
        </Button>
      ) : null}
    </div>
  )
}

/** Truthful empty state with an optional next action. */
export function SurfaceEmpty({
  title,
  body,
  action,
  className,
  compact = false,
}: {
  title?: string
  body?: string
  action?: React.ReactNode
  className?: string
  compact?: boolean
}) {
  const copy = useSurfaceCopy()
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 text-center',
        compact ? 'px-3 py-6' : 'px-6 py-12',
        className,
      )}
    >
      <Inbox className='size-5 text-muted-foreground/70' aria-hidden='true' />
      <p className='text-sm font-semibold text-foreground'>{title ?? copy.emptyTitle}</p>
      <p className='max-w-sm text-xs leading-relaxed text-muted-foreground'>{body ?? copy.emptyBody}</p>
      {action ? <div className='pt-1'>{action}</div> : null}
    </div>
  )
}

/**
 * Single switch for a query result: renders loading / error / empty / children.
 * `isEmpty` is caller-supplied so the caller stays the source of truth about
 * what counts as "no records" for its own surface.
 */
export function QuerySurface({
  isLoading,
  isError,
  isEmpty,
  onRetry,
  rows = 4,
  emptyTitle,
  emptyBody,
  emptyAction,
  errorTitle,
  errorBody,
  className,
  children,
}: {
  isLoading: boolean
  isError: boolean
  isEmpty?: boolean
  onRetry?: () => void
  rows?: number
  emptyTitle?: string
  emptyBody?: string
  emptyAction?: React.ReactNode
  errorTitle?: string
  errorBody?: string
  className?: string
  children: React.ReactNode
}) {
  if (isError) {
    return (
      <SurfaceError
        onRetry={onRetry}
        title={errorTitle}
        body={errorBody}
        className={className}
      />
    )
  }
  if (isLoading) {
    return <SurfaceSkeleton rows={rows} className={className} />
  }
  if (isEmpty) {
    return (
      <SurfaceEmpty
        title={emptyTitle}
        body={emptyBody}
        action={emptyAction}
        className={className}
      />
    )
  }
  return <>{children}</>
}
