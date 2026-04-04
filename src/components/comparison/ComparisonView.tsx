import { useMemo } from 'react'
import { usePatientStore } from '../../store/patient-store'
import { useUIStore } from '../../store/ui-store'
import { computeConcentrationCurve, computeMetrics, doseTimestamp } from '../../lib/pk-engine'
import { doseDateRange } from '../../lib/date-utils'
import { ConcentrationChart } from './ConcentrationChart'
import { MetricsPanel } from './MetricsPanel'
import { DoseTable } from '../plans/DoseTable'
import type { Plan, ComputedPlan } from '../../types'

function computePlan(plan: Plan | undefined, start: Date, end: Date, resolutionHours: number): ComputedPlan | null {
  if (!plan || plan.doses.length === 0) return null
  const curve = computeConcentrationCurve(plan.doses, plan.pkParams, start, end, resolutionHours, plan.startingWeightLbs)
  const metrics = computeMetrics(curve, plan.doses)
  return { plan, curve, metrics }
}

export function ComparisonView() {
  const { getActivePlan } = usePatientStore()
  const { chartResolutionHours, hiddenPlanIds } = useUIStore()

  const baselinePlan = getActivePlan('baseline')
  const experimentPlan = getActivePlan('experiment')
  const actualPlan = getActivePlan('actual')

  const baselineVisible = baselinePlan ? !hiddenPlanIds.includes(baselinePlan.id) : false
  const experimentVisible = experimentPlan ? !hiddenPlanIds.includes(experimentPlan.id) : false
  const actualVisible = actualPlan ? !hiddenPlanIds.includes(actualPlan.id) : false

  const dateRange = useMemo(() => {
    const allDoses = [
      ...(baselinePlan?.doses ?? []),
      ...(experimentPlan?.doses ?? []),
      ...(actualPlan?.doses ?? []),
    ]
    return doseDateRange(allDoses, 1, 14)
  }, [baselinePlan?.doses, experimentPlan?.doses, actualPlan?.doses])

  const baseline = useMemo(
    () => computePlan(baselinePlan, dateRange.start, dateRange.end, chartResolutionHours),
    [baselinePlan, dateRange, chartResolutionHours],
  )

  const experiment = useMemo(
    () => computePlan(experimentPlan, dateRange.start, dateRange.end, chartResolutionHours),
    [experimentPlan, dateRange, chartResolutionHours],
  )

  const actual = useMemo(
    () => computePlan(actualPlan, dateRange.start, dateRange.end, chartResolutionHours),
    [actualPlan, dateRange, chartResolutionHours],
  )

  // Merge all curves into a unified timeline for the chart (only visible plans)
  const chartData = useMemo(() => {
    const visiblePlans = [
      baselineVisible ? baseline : null,
      experimentVisible ? experiment : null,
      actualVisible ? actual : null,
    ]
    const timeSet = new Set<number>()
    for (const cp of visiblePlans) {
      if (cp) cp.curve.forEach(p => timeSet.add(p.timestamp))
    }
    const times = Array.from(timeSet).sort((a, b) => a - b)

    return times.map(ts => {
      const bPoint = baselineVisible ? baseline?.curve.find(p => p.timestamp === ts) : undefined
      const ePoint = experimentVisible ? experiment?.curve.find(p => p.timestamp === ts) : undefined
      const aPoint = actualVisible ? actual?.curve.find(p => p.timestamp === ts) : undefined
      return {
        timestamp: ts,
        day: (ts - dateRange.start.getTime()) / (24 * 3600 * 1000),
        baseline: bPoint?.concentration,
        experiment: ePoint?.concentration,
        actual: aPoint?.concentration,
      }
    })
  }, [baseline, experiment, actual, dateRange, baselineVisible, experimentVisible, actualVisible])

  // Collect dose markers for the chart (only visible plans)
  const doseMarkers = useMemo(() => {
    const markers: Array<{ timestamp: number; day: number; type: string; mg: number }> = []
    const startMs = dateRange.start.getTime()
    const visibleEntries: Array<[typeof baselinePlan, boolean]> = [
      [baselinePlan, baselineVisible],
      [experimentPlan, experimentVisible],
      [actualPlan, actualVisible],
    ]
    for (const [plan, visible] of visibleEntries) {
      if (!plan || !visible) continue
      for (const dose of plan.doses) {
        const ts = doseTimestamp(dose)
        markers.push({
          timestamp: ts,
          day: (ts - startMs) / (24 * 3600 * 1000),
          type: plan.type,
          mg: dose.amountMg,
        })
      }
    }
    return markers
  }, [baselinePlan, experimentPlan, actualPlan, dateRange, baselineVisible, experimentVisible, actualVisible])

  const hasAnyData = baseline || experiment || actual

  return (
    <div className="space-y-6">
      {!hasAnyData ? (
        <div className="text-center py-16 text-text-secondary">
          <p className="text-lg font-medium mb-2">No active plans with doses</p>
          <p className="text-sm">Create a plan and add doses from the sidebar to get started.</p>
        </div>
      ) : (
        <>
          <ConcentrationChart
            data={chartData}
            doseMarkers={doseMarkers}
            baselineColor={baselinePlan?.color ?? '#3b82f6'}
            experimentColor={experimentPlan?.color ?? '#f59e0b'}
            actualColor={actualPlan?.color ?? '#10b981'}
            hasBaseline={!!baseline && baselineVisible}
            hasExperiment={!!experiment && experimentVisible}
            hasActual={!!actual && actualVisible}
          />
          <MetricsPanel baseline={baseline} experiment={experiment} actual={actual} />
        </>
      )}
      <DoseTable />
    </div>
  )
}
