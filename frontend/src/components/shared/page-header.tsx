import { cn } from '@/lib/utils'

// Page header konsisten: judul H1 + deskripsi kontekstual + aksi utama.
// Menyeragamkan hierarki halaman customer & admin (satu sistem).
export function PageHeader({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: string
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-end justify-between gap-3 pb-1',
        className
      )}
    >
      <div className='space-y-1'>
        <h1 className='text-2xl font-semibold tracking-tight'>{title}</h1>
        {description && (
          <p className='text-sm text-muted-foreground max-w-2xl text-pretty'>
            {description}
          </p>
        )}
      </div>
      {children && <div className='flex flex-wrap items-center gap-2'>{children}</div>}
    </div>
  )
}
