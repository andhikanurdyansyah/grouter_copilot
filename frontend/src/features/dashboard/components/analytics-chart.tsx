import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts'

const data = [
  {
    name: 'Mon',
    clicks: 642,
    uniques: 420,
  },
  {
    name: 'Tue',
    clicks: 780,
    uniques: 510,
  },
  {
    name: 'Wed',
    clicks: 890,
    uniques: 620,
  },
  {
    name: 'Thu',
    clicks: 810,
    uniques: 580,
  },
  {
    name: 'Fri',
    clicks: 950,
    uniques: 720,
  },
  {
    name: 'Sat',
    clicks: 620,
    uniques: 380,
  },
  {
    name: 'Sun',
    clicks: 540,
    uniques: 310,
  },
]

export function AnalyticsChart() {
  return (
    <ResponsiveContainer width='100%' height={300}>
      <AreaChart data={data}>
        <XAxis
          dataKey='name'
          stroke='#888888'
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke='#888888'
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (active && payload && payload.length) {
              return (
                <div className='rounded-xl border border-border bg-popover/95 text-popover-foreground backdrop-blur-md px-3 py-2.5 shadow-xl text-xs space-y-1.5 font-mono min-w-[140px]'>
                  <div className='font-bold text-foreground font-sans border-b border-border/60 pb-1'>{label}</div>
                  <div className='flex items-center justify-between gap-3'>
                    <span className='flex items-center gap-1.5 text-muted-foreground'>
                      <span className='size-2 rounded-full bg-primary' />
                      <span>Clicks:</span>
                    </span>
                    <span className='font-bold text-foreground'>{payload[0]?.value?.toLocaleString()}</span>
                  </div>
                  <div className='flex items-center justify-between gap-3'>
                    <span className='flex items-center gap-1.5 text-muted-foreground'>
                      <span className='size-2 rounded-full bg-muted-foreground' />
                      <span>Uniques:</span>
                    </span>
                    <span className='font-bold text-foreground'>{payload[1]?.value?.toLocaleString()}</span>
                  </div>
                </div>
              )
            }
            return null
          }}
        />
        <Area
          type='monotone'
          dataKey='clicks'
          stroke='currentColor'
          className='text-primary'
          fill='currentColor'
          fillOpacity={0.15}
        />
        <Area
          type='monotone'
          dataKey='uniques'
          stroke='currentColor'
          className='text-muted-foreground'
          fill='currentColor'
          fillOpacity={0.1}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
