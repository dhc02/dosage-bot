interface Props {
  currentNgMl: number;
  baselinePeak: number;
  baselineTrough: number;
  baselineAverage: number;
}

export function BaselineComparison({ currentNgMl, baselinePeak, baselineTrough, baselineAverage }: Props) {
  // Position fraction along [trough, peak]
  const span = Math.max(baselinePeak - baselineTrough, 1e-6)
  const clampedCurrent = Math.max(baselineTrough, Math.min(baselinePeak, currentNgMl))
  const currentPct = ((clampedCurrent - baselineTrough) / span) * 100
  const avgPct = ((baselineAverage - baselineTrough) / span) * 100
  const insideZone = currentNgMl >= baselineTrough && currentNgMl <= baselinePeak

  return (
    <div className="bg-surface border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-text-secondary font-medium">
          vs Baseline
        </div>
        <div className="text-[10px] text-text-secondary">trough → peak</div>
      </div>

      <div className="mt-4 relative h-3 rounded-full bg-baseline/15">
        {/* Average tick */}
        <div
          className="absolute top-0 bottom-0 w-px bg-baseline/50"
          style={{ left: `${avgPct}%` }}
          title={`Average: ${baselineAverage.toFixed(1)}`}
        />
        {/* Current marker */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-surface ${insideZone ? 'bg-emerald-500' : 'bg-amber-500'}`}
          style={{ left: `calc(${currentPct}% - 8px)` }}
          title={`Current: ${currentNgMl.toFixed(1)}`}
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="Trough" value={baselineTrough} />
        <Stat label="Average" value={baselineAverage} />
        <Stat label="Peak" value={baselinePeak} />
      </div>

      <div className="mt-3 text-xs text-text-secondary text-center">
        Current: <span className="font-mono font-semibold text-text">{currentNgMl.toFixed(1)} ng/mL</span>
        {!insideZone && (
          <span className={`ml-2 ${currentNgMl > baselinePeak ? 'text-amber-600' : 'text-amber-600'}`}>
            ({currentNgMl > baselinePeak ? 'above peak' : 'below trough'})
          </span>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-text-secondary">{label}</div>
      <div className="font-mono text-sm font-semibold tabular-nums">{value.toFixed(1)}</div>
    </div>
  )
}
