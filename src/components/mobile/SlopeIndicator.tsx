interface Props {
  slopeNgPerMlPerHour: number;
}

const STEADY_THRESHOLD_PER_DAY = 0.1; // ng/mL/day below this magnitude = "steady"

export function SlopeIndicator({ slopeNgPerMlPerHour }: Props) {
  const perDay = slopeNgPerMlPerHour * 24
  const direction: 'up' | 'down' | 'steady' =
    perDay > STEADY_THRESHOLD_PER_DAY ? 'up'
    : perDay < -STEADY_THRESHOLD_PER_DAY ? 'down'
    : 'steady'

  const config = {
    up:     { arrow: '↑', label: 'Rising',  color: 'text-emerald-600', bg: 'bg-emerald-50' },
    down:   { arrow: '↓', label: 'Falling', color: 'text-red-500',     bg: 'bg-red-50' },
    steady: { arrow: '↔', label: 'Steady',  color: 'text-text-secondary', bg: 'bg-surface-alt' },
  }[direction]

  return (
    <div className="bg-surface border border-border rounded-2xl p-5">
      <div className="text-xs uppercase tracking-wider text-text-secondary font-medium">
        Trend
      </div>
      <div className="mt-2 flex items-center gap-3">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl font-bold ${config.bg} ${config.color}`}>
          {config.arrow}
        </div>
        <div className="flex flex-col">
          <div className={`text-base font-semibold ${config.color}`}>{config.label}</div>
          <div className="font-mono text-sm tabular-nums text-text-secondary">
            {perDay >= 0 ? '+' : ''}{perDay.toFixed(2)} ng/mL/day
          </div>
        </div>
      </div>
    </div>
  )
}
