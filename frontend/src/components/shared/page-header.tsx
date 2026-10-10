import { cn } from '@/lib/utils'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'

// Page header konsisten: trigger sidebar (mobile) + judul H1 + deskripsi
// kontekstual + aksi utama. Menyeragamkan hierarki halaman customer & admin.
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
      <div className='flex min-w-0 items-center gap-2.5'>
        {/* Mobile: satu-satunya cara membuka sidebar — wajib ada di semua halaman */}
        <SidebarTrigger className='-ml-1.5 md:hidden' aria-label='Buka menu navigasi' />
        <Separator orientation='vertical' className='!h-5 md:hidden' />
        <div className='min-w-0 space-y-1'>
          <h1 className='text-xl font-semibold tracking-tight'>{title}</h1>
          {description && (
            <p className='text-[13.5px] leading-relaxed text-muted-foreground max-w-2xl text-pretty'>
              {description}
            </p>
          )}
        </div>
      </div>
      {children && <div className='flex flex-wrap items-center gap-2'>{children}</div>}
    </div>
  )
}
