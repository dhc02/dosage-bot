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
  const { setShowExperienceLogForm, openDoseEntry } = useUIStore()
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
    <>
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

      <button
        onClick={openDoseEntry}
        aria-label="Log a dose"
        className="fixed right-5 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 w-14 h-14 rounded-full bg-primary-600 text-white shadow-lg shadow-primary-600/30 active:bg-primary-700 active:scale-95 transition-all flex items-center justify-center"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </>
  )
}
