import { useMemo } from 'react'
import type { Plan } from '../../types'
import { doseTimestamp, findNextPeakTime, findPreviousPeakTime } from '../../lib/pk-engine'

interface Props {
  actualPlan: Plan | undefined;
  now: number;
}

function formatDuration(hours: number): string {
  return hours < 72
    ? `${Math.round(hours)}h`
    : `${(hours / 24).toFixed(1)}d`
}

export function PeakTiming({ actualPlan, now }: Props) {
  const info = useMemo(() => {
    if (!actualPlan || actualPlan.doses.length === 0) return null

    const sorted = [...actualPlan.doses].sort(
      (a, b) => doseTimestamp(b) - doseTimestamp(a)
    )
    const lastDose = sorted[0]

    const peakMs = findNextPeakTime(
      actualPlan.doses,
      actualPlan.pkParams,
      now,
      actualPlan.startingWeightLbs,
    )
    const pastPeak = peakMs === null

    let display: string
    if (!pastPeak) {
      const hoursUntilPeak = (peakMs! - now) / (1000 * 3600)
      display = `${formatDuration(hoursUntilPeak)} Until peak`
    } else {
      const previousPeakMs = findPreviousPeakTime(
        actualPlan.doses,
        actualPlan.pkParams,
        now,
        actualPlan.startingWeightLbs,
      )
      if (previousPeakMs !== null) {
        const hoursSincePeak = (now - previousPeakMs) / (1000 * 3600)
        display = `Past peak · ${formatDuration(hoursSincePeak)} ago`
      } else {
        display = 'Past peak'
      }
    }

    return {
      pastPeak,
      display,
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
            {info.display}
          </div>
          <div className="font-mono text-xs tabular-nums text-text-secondary">
            From dose {info.doseDate} {info.doseTime}
          </div>
        </div>
      </div>
    </div>
  )
}
