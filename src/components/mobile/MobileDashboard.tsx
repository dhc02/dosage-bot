import { useMemo } from 'react'
import { usePatientStore } from '../../store/patient-store'
import { useUIStore } from '../../store/ui-store'
import { useNow } from '../../hooks/useNow'
import {
  computeConcentrationCurve,
  computeMetrics,
  concentrationAtTime,
  slopeAtTime,
} from '../../lib/pk-engine'
import { doseDateRange } from '../../lib/date-utils'
import { CurrentLevelCard } from './CurrentLevelCard'
import { SlopeIndicator } from './SlopeIndicator'
import { BaselineComparison } from './BaselineComparison'

export function MobileDashboard() {
  const { getActivePlan } = usePatientStore()
  const { setShowExperienceLogForm } = useUIStore()
  const now = useNow(60_000)

  const actualPlan = getActivePlan('actual')
  const baselinePlan = getActivePlan('baseline')

  const currentConcentration = useMemo(() => {
    if (!actualPlan || actualPlan.doses.length === 0) return 0
    return concentrationAtTime(actualPlan.doses, actualPlan.pkParams, now, actualPlan.startingWeightLbs)
  }, [actualPlan, now])

  const currentSlopePerHour = useMemo(() => {
    if (!actualPlan || actualPlan.doses.length === 0) return 0
    return slopeAtTime(actualPlan.doses, actualPlan.pkParams, now, actualPlan.startingWeightLbs)
  }, [actualPlan, now])

  const baselineMetrics = useMemo(() => {
    if (!baselinePlan || baselinePlan.doses.length === 0) return null
    const range = doseDateRange(baselinePlan.doses, 1, 14)
    const curve = computeConcentrationCurve(baselinePlan.doses, baselinePlan.pkParams, range.start, range.end, 2, baselinePlan.startingWeightLbs)
    return computeMetrics(curve, baselinePlan.doses)
  }, [baselinePlan])

  const hasActual = !!actualPlan && actualPlan.doses.length > 0

  return (
    <div className="flex flex-col gap-3 p-4 pb-32">
      <CurrentLevelCard concentration={currentConcentration} hasActualPlan={hasActual} />

      {hasActual && <SlopeIndicator slopeNgPerMlPerHour={currentSlopePerHour} />}

      {hasActual && baselineMetrics && baselineMetrics.peakConcentration > 0 && (
        <BaselineComparison
          currentNgMl={currentConcentration}
          baselinePeak={baselineMetrics.peakConcentration}
          baselineTrough={baselineMetrics.troughConcentration}
          baselineAverage={baselineMetrics.averageConcentration}
        />
      )}

      <button
        onClick={() => setShowExperienceLogForm(true)}
        className="mt-3 w-full min-h-14 rounded-2xl bg-primary-600 text-white font-semibold text-base shadow-sm active:bg-primary-700 transition-colors"
      >
        Log How I Feel
      </button>
    </div>
  )
}
