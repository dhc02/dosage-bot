import { useMemo } from 'react'
import type { Plan } from '../../types'
import { doseTimestamp, computeTmax } from '../../lib/pk-engine'

interface Props {
  actualPlan: Plan | undefined;
  now: number;
}

export function PeakTiming({ actualPlan, now }: Props) {
  const info = useMemo(() => {
    if (!actualPlan || actualPlan.doses.length === 0) return null

    // Find the most recent dose
    const sorted = [...actualPlan.doses].sort(
      (a, b) => doseTimestamp(b) - doseTimestamp(a)
    )
    const lastDose = sorted[0]
    const lastDoseMs = doseTimestamp(lastDose)
    const hoursSinceDose = (now - lastDoseMs) / (1000 * 3600)

    const tmax = computeTmax(actualPlan.pkParams)
    const hoursUntilPeak = tmax - hoursSinceDose

    const pastPeak = hoursUntilPeak < 0
    const absHours = Math.abs(hoursUntilPeak)

    // Format: show hours for <72h, days for >=72h
    let display: string
    if (absHours < 72) {
      display = `${Math.round(absHours)}h`
    } else {
      display = `${(absHours / 24).toFixed(1)}d`
    }

    return {
      pastPeak,
      display,
      label: pastPeak ? 'Past peak' : 'Until peak',
      doseDate: lastDose.date,
      doseTime: lastDose.time,
    }
  }, [actualPlan, now])

  if (!info) return null

  return (
    <div className="bg-surface border border-border rounded-2xl p-5">
      <div className="text-xs uppercase tracking-wider text-text-secondary font-medium">
        Peak Timing
      </div>
      <div className="mt-2 flex items-center gap-3">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl font-bold ${
          info.pastPeak
            ? 'bg-amber-50 text-amber-600'
            : 'bg-emerald-50 text-emerald-600'
        }`}>
          {info.pastPeak ? '↘' : '↗'}
        </div>
        <div className="flex flex-col">
          <div className="text-base font-semibold text-text">
            {info.display} {info.label}
          </div>
          <div className="font-mono text-xs tabular-nums text-text-secondary">
            From dose {info.doseDate} {info.doseTime}
          </div>
        </div>
      </div>
    </div>
  )
}
